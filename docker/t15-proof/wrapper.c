/* Static executable: app loader variables cannot run code before env isolation. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/wait.h>
#include <sys/syscall.h>
#include <sys/resource.h>
#include <time.h>
#include <unistd.h>

extern char **environ;
static long long millis(void) {
  struct timespec t;
  if (clock_gettime(CLOCK_MONOTONIC, &t)) return -1;
  return (long long)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}
int main(int argc, char **argv) {
  if (argc != 2 || strcmp(argv[1], "serve")) return 77;
  if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0)) return 77;
  int pipefd[2];
  if (pipe2(pipefd, O_CLOEXEC)) return 77;
  long long start = millis();
  if (start < 0) return 77;
  pid_t parent = getpid();
  pid_t child = fork();
  if (child < 0) return 77;
  if (child == 0) {
    struct rlimit core = {0, 0};
    if (setrlimit(RLIMIT_CORE, &core)) _exit(77);
    if (setpgid(0, 0)) _exit(77);
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != parent ||
        dup2(pipefd[1], STDOUT_FILENO) < 0 || dup2(pipefd[1], STDERR_FILENO) < 0) _exit(77);
    close(pipefd[0]);
    close(pipefd[1]);
    close(0);
    /* Remove inherited app handles before starting the dynamic loader. */
    if (syscall(SYS_close_range, 3U, ~0U, 0U)) _exit(77); /* close_range on amd64 and arm64 */
    char *args[] = {"/opt/notesapp-native/bin/native-boundary-proof",
      "--fixture-dir", "/opt/notesapp-native/proof-fixtures",
      "--as-bytes", "268435456", "--cpu-seconds", "2", "--wall-ms", "5000",
      "--output-bytes", "1048576", "--require-uid", "10001", "--require-gid", "10001", NULL};
    char *env[] = {"PATH=/usr/bin:/bin", NULL};
    execve(args[0], args, env);
    _exit(77);
  }
  if (setpgid(child, child) && errno != EACCES && errno != ESRCH) { kill(child, SIGKILL); waitpid(child, NULL, 0); return 77; }
  close(pipefd[1]);
  char report[65536];
  size_t used = 0;
  int status = 0, done = 0, eof = 0, failed = 0;
  if (fcntl(pipefd[0], F_SETFL, O_NONBLOCK)) failed = 1;
  while (!failed && (!done || !eof)) {
    long long now = millis();
    if (now < 0 || now - start >= 119000) { failed = 1; break; }
    struct pollfd p = { pipefd[0], POLLIN, 0 };
    if (poll(&p, 1, 20) < 0 && errno != EINTR) { failed = 1; break; }
    char buffer[4096];
    ssize_t n = read(pipefd[0], buffer, sizeof buffer);
    if (n > 0) {
      if ((size_t)n > sizeof report - used) { failed = 1; break; }
      memcpy(report + used, buffer, (size_t)n);
      used += (size_t)n;
    } else if (n == 0) eof = 1;
    else if (errno != EAGAIN && errno != EINTR) { failed = 1; break; }
    if (!done) {
      pid_t result = waitpid(child, &status, WNOHANG);
      if (result == child) done = 1;
      else if (result < 0 && errno != EINTR) { failed = 1; break; }
    }
  }
  close(pipefd[0]);
  if (!done) {
    kill(-child, SIGKILL);
    for (;;) {
      pid_t r = waitpid(child, &status, WNOHANG);
      if (r == child) break;
      if (r < 0 && errno != EINTR) return 77;
      if (millis() - start >= 120000) return 77;
      struct timespec delay = {0, 1000000}; nanosleep(&delay, NULL);
    }
  }
  if (failed || !WIFEXITED(status) || WEXITSTATUS(status)) {
    kill(-child, SIGKILL);
    for (;;) {
      pid_t r = waitpid(-1, NULL, WNOHANG);
      if (r < 0 && errno == ECHILD) break;
      if (r < 0 && errno != EINTR) return 77;
      if (millis() - start >= 120000) return 77;
      struct timespec delay = {0, 1000000}; nanosleep(&delay, NULL);
    }
  }
  if (failed) return 77;
  errno = 0;
  if (waitpid(-1, NULL, WNOHANG) != -1 || errno != ECHILD) { kill(-child, SIGKILL); return 77; }
  /* A report remains buffered until the probe stops, to bound app log output. */
  int stdout_flags = fcntl(1, F_GETFL);
  if (stdout_flags < 0 || fcntl(1, F_SETFL, stdout_flags | O_NONBLOCK)) return 77;
  size_t sent = 0;
  while (sent < used) {
    if (millis() - start >= 120000) { fcntl(1, F_SETFL, stdout_flags); return 77; }
    ssize_t n = write(STDOUT_FILENO, report + sent, used - sent);
    if (n < 0 && (errno == EINTR || errno == EAGAIN)) { struct pollfd p = {1, POLLOUT, 0}; poll(&p, 1, 10); continue; }
    if (n <= 0) { fcntl(1, F_SETFL, stdout_flags); return 77; }
    sent += (size_t)n;
  }
  if (fcntl(1, F_SETFL, stdout_flags)) return 77;
  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) return 77;
  static const char pass[] = "{\"status\":\"PASS\",\"scope\":\"local_diagnostic_only\",\"platform_proved\":false}\n";
  if (used < sizeof pass - 1 || memcmp(report + used - (sizeof pass - 1), pass, sizeof pass - 1)) return 77;
  char *args[] = {"/app/entrypoint.sh.original", "serve", NULL};
  execve(args[0], args, environ);
  return 77;
}
