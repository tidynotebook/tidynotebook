"""Local diagnostic tests. This program does not build, publish, or query a platform."""
import hashlib
import json
import pathlib
import platform
import subprocess
import sys
import time

image, destination, active_helper = sys.argv[1:]
evidence = pathlib.Path(destination)
evidence.mkdir(parents=True, exist_ok=True)
if not image.startswith('sha256:'):
    raise SystemExit('Use an immutable local image ID.')
config = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image]))[0]
native = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(platform.machine())
assert native and config['Architecture'] == native, 'Native architecture required'
assert config['Config']['User'] == '10001:10001'
args = ['--fixture-dir', '/opt/notesapp-native/proof-fixtures',
        '--as-bytes', '268435456', '--cpu-seconds', '2', '--wall-ms', '5000',
        '--output-bytes', '1048576', '--require-uid', '10001', '--require-gid', '10001']
base = ['docker', 'run', '--rm', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--network', 'none', '--pids-limit', '64',
        '--memory', '512m', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=64m']
results = []

def run(name, options, command, expected, reason=None):
    start = time.monotonic()
    invocation = base + ['--name', 't15-test-' + name] + options + [image] + command
    result = subprocess.run(invocation, capture_output=True, timeout=125)
    duration = time.monotonic() - start
    (evidence / (name + '.stdout')).write_bytes(result.stdout)
    (evidence / (name + '.stderr')).write_bytes(result.stderr)
    record = {'name': name, 'exit': result.returncode, 'seconds': duration,
              'stdout_bytes': len(result.stdout),
              'stdout_sha256': hashlib.sha256(result.stdout).hexdigest(),
              'stderr_sha256': hashlib.sha256(result.stderr).hexdigest(),
              'command': invocation}
    results.append(record)
    (evidence / 'local-tests.json').write_text(json.dumps(results, indent=2) + '\n')
    assert result.returncode == expected, record
    assert len(result.stdout) + len(result.stderr) <= 65536, record
    if reason:
        assert reason in result.stdout.decode(), record
    return result

probe = '/opt/notesapp-native/bin/native-boundary-proof'
normal = ['--user', '10001:10001', '--entrypoint', '/usr/bin/env']
result = run('suite', normal, ['-i', 'PATH=/usr/bin:/bin', probe] + args, 0)
rows = [json.loads(line) for line in result.stdout.splitlines()]
assert rows[-1] == {'status': 'PASS', 'scope': 'local_diagnostic_only', 'platform_proved': False}
assert results[-1]['seconds'] < 120
for name in ['malloc', 'mmap', 'cpu', 'wall', 'output', 'crash', 'malformed']:
    assert any(row.get('test') == name and row.get('reaped') for row in rows), name
assert sum(row.get('test') == 'fixture' for row in rows) == 11
for name, uid, extra, reason in [
    ('root', '0:0', [], 'identity'),
    ('uid', '10002:10001', [], 'identity'),
    ('gid', '10001:10002', [], 'identity'),
    ('groups', '10001:10001', ['--group-add', '0'], 'groups'),
]:
    run(name, ['--user', uid] + extra + ['--entrypoint', '/usr/bin/env'],
        ['-i', 'PATH=/usr/bin:/bin', probe] + args, 77, reason)
for name, command in [('empty', []), ('migrate', ['migrate']), ('extra', ['serve', 'extra'])]:
    run('wrapper-' + name, ['--user', '10001:10001', '--entrypoint', '/app/entrypoint.sh'], command, 77)
run('wrapper-root', ['--user', '0:0', '--env', 'T15_SYNTHETIC_SECRET=never-print-this',
                    '--env', 'LD_PRELOAD=/t15-invalid-loader', '--entrypoint', '/app/entrypoint.sh'],
    ['serve'], 77, 'identity')
run('active-cap', ['--user', '0:0', '--cap-add', 'SETUID', '--cap-add', 'SETGID',
    '--cap-add', 'SETPCAP', '--cap-add', 'CHOWN', '--mount',
    'type=bind,src=' + str(pathlib.Path(active_helper).resolve()) + ',dst=/test-active-cap,readonly',
    '--entrypoint', '/test-active-cap'], [], 77, 'active_capabilities')

# These trusted stubs test the exact wrapper. They do not replace the native suite result.
inputs = evidence / 'wrapper-inputs'
inputs.mkdir(exist_ok=True)
original = inputs / 'original'
original.write_text("""#!/bin/sh
set -eu
[ "$#" = 1 ] && [ "$1" = serve ]
[ "$T15_SYNTHETIC_SECRET" = test-only-value ]
[ "$LD_LIBRARY_PATH" = /t15-synthetic-safe-path ]
printf '%s\\n' '{"test":"wrapper-app","environment_preserved":true}'
""")
original.chmod(0o555)
synthetic_fd = inputs / 'descriptor'
synthetic_fd.write_text('synthetic descriptor')
for name, body, expected in [
    ('pass', """[ "${T15_SYNTHETIC_SECRET+x}" != x ]
[ "${LD_LIBRARY_PATH+x}" != x ]
[ "$PATH" = /usr/bin:/bin ]
[ ! -e /proc/self/fd/9 ]
printf '%s\\n' '{"status":"PASS","scope":"local_diagnostic_only","platform_proved":false}'""", 0),
    ('malformed', "printf '%s\\n' 'INVALID'", 77),
    ('refuse', 'exit 77', 77),
    ('overflow', 'exec /usr/bin/head -c 70000 /dev/zero', 77),
    ('crash', 'kill -SEGV $$', 77),
]:
    stub = inputs / ('probe-' + name)
    stub.write_text('#!/bin/sh\nset -eu\n' + body + '\n')
    stub.chmod(0o555)
    mounts = []
    for source, target in [(stub, probe), (original, '/app/entrypoint.sh.original'),
                           (synthetic_fd, '/t15-descriptor')]:
        mounts += ['--mount', 'type=bind,src=' + str(source.resolve()) + ',dst=' + target + ',readonly']
    response = run('wrapper-stub-' + name, ['--user', '10001:10001'] + mounts + [
        '--env', 'T15_SYNTHETIC_SECRET=test-only-value',
        '--env', 'LD_LIBRARY_PATH=/t15-synthetic-safe-path', '--entrypoint', '/bin/sh'],
        ['-c', 'exec 9</t15-descriptor; exec /app/entrypoint.sh serve'], expected)
    assert b'test-only-value' not in response.stdout + response.stderr
    assert (b'environment_preserved' in response.stdout) == (expected == 0)
# A separate, default-deny outer filter forces policy installation to fail.
# It has no socket allowance. No fixture is processed under this test profile.
allowed = ('read write close close_range openat newfstatat fstat statx statfs fstatfs lseek pread64 access faccessat faccessat2 '
    'readlink readlinkat getdents64 mmap mprotect munmap mremap madvise brk futex '
    'arch_prctl set_tid_address set_robust_list rseq rt_sigaction rt_sigprocmask rt_sigreturn '
    'sigaltstack getrandom clock_gettime clock_nanosleep nanosleep getrusage prlimit64 '
    'getpid getppid gettid getuid geteuid getgid getegid getresuid getresgid getgroups '
    'setgroups setuid setgid setresuid setresgid capget capset prctl uname sysinfo '
    'fcntl pipe2 dup2 dup3 ioctl getcwd sched_getaffinity sched_yield '
    'mkdir chmod unlink rmdir rename link truncate execve clone fork vfork wait4 '
    'setpgid getpgid kill tgkill poll ppoll restart_syscall exit exit_group').split()
profile = evidence / 'deny-landlock.json'
profile.write_text(json.dumps({'defaultAction': 'SCMP_ACT_ERRNO', 'defaultErrnoRet': 1,
    'syscalls': [{'names': allowed, 'action': 'SCMP_ACT_ALLOW'},
        {'names': ['landlock_create_ruleset'], 'action': 'SCMP_ACT_ERRNO', 'errnoRet': 1}]}, indent=2) + '\n')
response = run('install-refusal', ['--user', '10001:10001', '--security-opt',
    'seccomp=' + str(profile.resolve()), '--entrypoint', '/app/entrypoint.sh'], ['serve'], 77, 'test_mismatch')
refused_rows = [json.loads(line) for line in response.stdout.splitlines()]
assert any(row.get('layers') == 1 and row.get('errno') == 1 and row.get('wait_status') == 77 * 256 for row in refused_rows)
assert not any(row.get('test') == 'fixture' for row in refused_rows)
print(json.dumps({'status': 'PASS', 'architecture': native, 'tests': len(results)}))
