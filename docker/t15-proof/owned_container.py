"""One disposable proof invocation. Cleanup uses its exact ID and ownership label."""
import json
import pathlib
import re
import subprocess
import time
import uuid

LABEL = 'notesapp.t15.invocation'


class InvocationFailure(RuntimeError):
    def __init__(self, record):
        super().__init__('Owned container invocation failed: ' + record['name'])
        self.record = record


def run_owned(name, image, options, command, evidence, timeout=125):
    evidence = pathlib.Path(evidence)
    owner = uuid.uuid4().hex
    container_name = 't15-' + owner
    cidfile = evidence / (name + '-' + owner + '.cid')
    record = {'name': name, 'owner': owner, 'container_name': container_name,
              'container_id': None, 'status': 'FAIL', 'timed_out': False,
              'cleanup': {'complete': False, 'events': []}}
    stdout = b''
    stderr = b''
    started = time.monotonic()
    creation_finished = False
    phase = 'create'

    def call(arguments, limit):
        result = subprocess.run(['docker'] + arguments, capture_output=True, timeout=limit)
        return result

    def inspect(target, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Cleanup deadline expired')
        template = '{"Id":{{json .Id}},"Owner":{{json (index .Config.Labels "' + LABEL + '")}},"Running":{{json .State.Running}},"ExitCode":{{json .State.ExitCode}}}'
        result = call(['container', 'inspect', '--format', template, target], min(5, remaining))
        if result.returncode:
            text = result.stderr.decode(errors='replace')
            missing = ('Error: No such container: ' + target,
                       'Error: No such object: ' + target,
                       'Error response from daemon: No such container: ' + target)
            if result.returncode == 1 and result.stdout.strip() in (b'', b'[]') and text.strip() in missing:
                return None
            raise RuntimeError('Container inspection failed: ' + text[:2048])
        value = json.loads(result.stdout)
        if value['Owner'] != owner:
            raise RuntimeError('Container ownership mismatch')
        if not re.fullmatch('[0-9a-f]{64}', value['Id']):
            raise RuntimeError('Invalid container identity')
        if record['container_id'] and value['Id'] != record['container_id']:
            raise RuntimeError('Container identity changed')
        return value

    try:
        create = ['create', '--name', container_name, '--label', LABEL + '=' + owner,
                  '--cidfile', str(cidfile)] + options + [image] + command
        record['create_command'] = ['docker'] + create
        result = call(create, 20)
        (evidence / (name + '.create.stdout')).write_bytes(result.stdout)
        (evidence / (name + '.create.stderr')).write_bytes(result.stderr)
        if result.returncode:
            raise RuntimeError('Container creation failed')
        cid = result.stdout.decode().strip()
        if not re.fullmatch('[0-9a-f]{64}', cid):
            raise RuntimeError('Invalid create response')
        record['container_id'] = cid
        creation_finished = True
        phase = 'inspect-before-start'
        value = inspect(cid, time.monotonic() + 5)
        if value is None:
            raise RuntimeError('Owned container disappeared before start')
        record['start_command'] = ['docker', 'start', '--attach', cid]
        phase = 'attach'
        result = call(['start', '--attach', cid], timeout)
        stdout, stderr = result.stdout, result.stderr
        record['client_exit'] = result.returncode
        phase = 'inspect-after-start'
        value = inspect(cid, time.monotonic() + 5)
        if value is None or value['Running']:
            raise RuntimeError('Container did not stop after attach')
        record['exit'] = value['ExitCode']
        if result.returncode not in (0, record['exit']):
            raise RuntimeError('Docker client failed')
        record['status'] = 'PASS'
    except subprocess.TimeoutExpired as error:
        record['timed_out'] = True
        partial_stdout, partial_stderr = error.stdout or b'', error.stderr or b''
        (evidence / (name + '.' + phase + '.timeout.stdout')).write_bytes(partial_stdout)
        (evidence / (name + '.' + phase + '.timeout.stderr')).write_bytes(partial_stderr)
        if phase == 'attach':
            stdout, stderr = partial_stdout, partial_stderr
        record['error'] = phase + ' timeout'
    except Exception as error:
        record['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        # A killed Docker client does not stop its container. Resolve only the
        # unique owned name if creation lost its response, then use the exact ID.
        deadline = time.monotonic() + 15
        events = record['cleanup']['events']
        try:
            if record['container_id'] is None and cidfile.exists():
                cid = cidfile.read_text().strip()
                if re.fullmatch('[0-9a-f]{64}', cid):
                    record['container_id'] = cid
                else:
                    events.append({'action': 'invalid_cidfile', 'fallback': container_name})
            target = record['container_id'] or container_name
            value = inspect(target, deadline)
            if value is not None:
                record['container_id'] = value['Id']
                events.append({'action': 'ownership_verified', 'id': value['Id'],
                               'running': value['Running']})
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Cleanup deadline expired')
                try:
                    removed = call(['container', 'rm', '--force', value['Id']], min(5, remaining))
                    if removed.returncode:
                        record['status'] = 'FAIL'
                        record.setdefault('error', 'Container removal failed')
                    events.append({'action': 'remove', 'id': value['Id'], 'exit': removed.returncode,
                                   'stdout': removed.stdout.decode(errors='replace')[:2048],
                                   'stderr': removed.stderr.decode(errors='replace')[:2048]})
                except subprocess.TimeoutExpired as error:
                    record['status'] = 'FAIL'
                    record['timed_out'] = True
                    record.setdefault('error', 'Container removal timeout')
                    events.append({'action': 'remove_timeout', 'id': value['Id'],
                                   'stdout': (error.stdout or b'').decode(errors='replace')[:2048],
                                   'stderr': (error.stderr or b'').decode(errors='replace')[:2048]})
                record['cleanup']['complete'] = inspect(value['Id'], deadline) is None
            else:
                # A timed-out create can still have an unresolved daemon request.
                # Do not report successful cleanup merely from an absent name.
                record['cleanup']['complete'] = creation_finished
                events.append({'action': 'absent', 'identity': target})
        except Exception as error:
            if isinstance(error, (subprocess.TimeoutExpired, TimeoutError)):
                record['timed_out'] = True
            event = {'action': 'cleanup_error', 'error': type(error).__name__ + ': ' + str(error)}
            if isinstance(error, subprocess.TimeoutExpired):
                event['stdout'] = (error.stdout or b'').decode(errors='replace')[:2048]
                event['stderr'] = (error.stderr or b'').decode(errors='replace')[:2048]
            events.append(event)
        if not record['cleanup']['complete']:
            record['status'] = 'FAIL'
        record['seconds'] = time.monotonic() - started
        (evidence / (name + '.stdout')).write_bytes(stdout)
        (evidence / (name + '.stderr')).write_bytes(stderr)
        (evidence / (name + '.run.json')).write_text(json.dumps(record, indent=2) + '\n')
    if record['status'] != 'PASS':
        raise InvocationFailure(record)
    return subprocess.CompletedProcess(record.get('start_command'), record['exit'], stdout, stderr), record
