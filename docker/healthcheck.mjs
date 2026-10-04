/**
 * Container health check.
 *
 * It asks the local listener for readiness. The Host header names the host of
 * the configured origin. A probe answers any host (record 0199), but the
 * origin is the host that every other address of the deployment answers.
 *
 * A container that stops on purpose is not a container to replace. The server
 * reports that it is not ready as the first step of its stop, so this check
 * accepts that one answer and fails on every other refusal. Without that, a
 * normal stop would mark the container unhealthy and a platform that replaces
 * an unhealthy container would act on a container that is already leaving.
 */
import http from 'node:http';

const origin = process.env['NOTESAPP_ORIGIN'] ?? '';
const port = Number(process.env['NOTESAPP_PORT'] ?? '3000');

let host;
try {
  host = new URL(origin).host;
} catch {
  process.stderr.write('notesapp: NOTESAPP_ORIGIN is not a usable URL.\n');
  process.exit(1);
}

/**
 * Whether a refusal body reports the stop of the server.
 *
 * @param {string} text
 * @returns {boolean}
 */
function stopping(text) {
  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return false;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return false;
  return Object.fromEntries(Object.entries(body))['code'] === 'shutting_down';
}

const request = http.request(
  { host: '127.0.0.1', port, path: '/ready', method: 'GET', headers: { host } },
  (response) => {
    response.setEncoding('utf8');
    let text = '';
    // The readiness body is a small report or a small problem. The check reads
    // at most one kilobyte of it and never prints it.
    response.on('data', (chunk) => {
      if (text.length < 1024) text += chunk;
    });
    response.on('end', () => {
      if (response.statusCode === 200) process.exit(0);
      if (response.statusCode === 503 && stopping(text)) {
        process.stdout.write('notesapp: the server is stopping.\n');
        process.exit(0);
      }
      process.exit(1);
    });
  },
);
request.on('error', () => process.exit(1));
request.end();
