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

#include "report.h"

extern char **environ;
static long long millis(void) {
  struct timespec t;
  if (clock_gettime(CLOCK_MONOTONIC, &t)) return -1;
  return (long long)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}
static int emit_report(const char *report, size_t used, long long deadline) {
  if (used > REPORT_LIMIT) return 0;
  int flags = fcntl(1, F_GETFL);
  if (flags < 0 || fcntl(1, F_SETFL, flags | O_NONBLOCK)) return 0;
  size_t sent = 0;
  int ok = 1;
  while (sent < used) {
    long long now = millis();
    if (now < 0 || now >= deadline) { ok = 0; break; }
    ssize_t n = write(1, report + sent, used - sent);
    if (n > 0) sent += (size_t)n;
    else if (n < 0 && (errno == EINTR || errno == EAGAIN)) {
      struct pollfd p = {1, POLLOUT, 0}; poll(&p, 1, 10);
    } else { ok = 0; break; }
  }
  if (fcntl(1, F_SETFL, flags)) ok = 0;
  return ok;
}
struct child_cleanup { int complete, main_status; unsigned reaped; };
static struct child_cleanup finish_children(pid_t child, long long deadline) {
  struct child_cleanup result = {0};
  siginfo_t info;
  /* Keep the main child waitable until group signaling is complete. This
   * reserves its PID, so a reused PID or process group cannot be signaled. */
  for (;;) {
    if (!waitid(P_PID, child, &info, WEXITED | WNOHANG | WNOWAIT)) break;
    if (errno != EINTR || millis() < 0 || millis() >= deadline) return result;
  }
  int signal_error = kill(-child, SIGKILL) && errno != ESRCH;
  if (kill(child, SIGKILL) && errno != ESRCH) signal_error = 1;
  int saw_main = 0;
  for (;;) {
    int status;
    pid_t r = waitpid(-1, &status, WNOHANG);
    if (r > 0) {
      result.reaped++;
      if (r == child) { result.main_status = status; saw_main = 1; }
    } else if (r < 0 && errno == ECHILD) {
      result.complete = saw_main && !signal_error;
      return result;
    } else if (r < 0 && errno != EINTR) return result;
    long long now = millis();
    if (now < 0 || now >= deadline) return result;
    if (!r) { struct timespec delay = {0, 1000000}; nanosleep(&delay, NULL); }
  }
}
int main(int argc, char **argv) {
  if (argc != 2 || strcmp(argv[1], "serve")) return 77;
  if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0)) return 77;
  struct sigaction action = { .sa_handler = SIG_DFL };
  if (sigemptyset(&action.sa_mask) || sigaction(SIGCHLD, &action, NULL)) return 77;
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
  int failed = setpgid(child, child) && errno != EACCES && errno != ESRCH;
  close(pipefd[1]);
  char report[REPORT_LIMIT];
  size_t used = 0;
  int done = 0, eof = 0;
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
      siginfo_t info;
      if (!waitid(P_PID, child, &info, WEXITED | WNOHANG | WNOWAIT)) done = info.si_pid == child;
      else if (errno != EINTR) failed = 1;
    }
  }
  close(pipefd[0]);
  /* Every path after fork uses this bounded kill/reap path, including
   * a zero-exit supervisor that leaves an adopted descendant. */
  struct child_cleanup cleanup = finish_children(child, start + 120000);
  if (!cleanup.complete || cleanup.reaped != 1) {
    const char *message = cleanup.complete
      ? "{\"wrapper_refusal\":\"unexpected_child\",\"children_reaped\":true}\n"
      : "{\"wrapper_refusal\":\"child_cleanup\",\"children_reaped\":false}\n";
    /* One small fixed record, not the buffered report, on this refusal path. */
    (void)emit_report(message, strlen(message), start + 120000);
    return 77;
  }
  if (failed) return 77;
  int accepted = WIFEXITED(cleanup.main_status) && WEXITSTATUS(cleanup.main_status) == 0 && valid_report(report, used);
  /* Rejected reports remain bounded diagnostic evidence. They cannot start the app. */
  if (!emit_report(report, used, start + 120000)) return 77;
  if (!accepted) return 77;
  char *args[] = {"/app/entrypoint.sh.original", "serve", NULL};
  execve(args[0], args, environ);
  return 77;
}
