/* Trusted test stub only. Its live descendant closes every report descriptor. */
#define _GNU_SOURCE
#include <poll.h>
#include <signal.h>
#include <sys/syscall.h>
#include <unistd.h>
int main(void) {
  int ready[2];
  if (pipe(ready)) return 78;
  pid_t descendant = fork();
  if (descendant < 0) return 78;
  if (!descendant) {
    close(ready[0]);
    if (signal(SIGTERM, SIG_IGN) == SIG_ERR) _exit(78);
    close(0); close(1); close(2);
    if (write(ready[1], "R", 1) != 1) _exit(78);
    if (syscall(SYS_close_range, 3U, ~0U, 0U)) _exit(78);
    for (;;) pause();
  }
  close(ready[1]);
  struct pollfd p = {ready[0], POLLIN, 0};
  char byte;
  if (poll(&p, 1, 1000) != 1 || read(ready[0], &byte, 1) != 1 || byte != 'R') return 78;
  close(ready[0]);
  static const char pass[] = "{\"status\":\"PASS\",\"scope\":\"local_diagnostic_only\",\"platform_proved\":false}\n";
  return write(1, pass, sizeof pass - 1) == sizeof pass - 1 ? 0 : 78;
}
