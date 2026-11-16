/* Host-only parser and owned-child tests. No image or native boundary proof. */
#define main wrapper_program_main
#include "wrapper.c"
#undef main
#include <assert.h>
#include <stdlib.h>

static const char guard[] = "{\"test\":\"guard\",\"uid\":10001,\"gid\":10001,\"active_caps\":0,\"bounding\":\"0\"}\n";
static void prefix_refuses(const char *prefix) {
  char report[4096];
  int n = snprintf(report, sizeof report, "%s%s", prefix, proof_pass);
  assert(n > 0 && n < (int)sizeof report);
  assert(!valid_report(report, (size_t)n));
}
static void parser_tests(void) {
  assert(valid_report(proof_pass, sizeof proof_pass - 1));
  char report[4096];
  int n = snprintf(report, sizeof report, "%s%s", guard, proof_pass);
  assert(valid_report(report, (size_t)n));
  assert(!valid_report(report, (size_t)n - 1));
  assert(!valid_report("", 0));
  prefix_refuses("INVALID\n");
  prefix_refuses("{\"status\":\"REFUSE\",\"reason\":\"test\",\"boundary_proved\":false}\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":10001\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":\"10001\",\"gid\":10001,\"active_caps\":0,\"bounding\":\"0\"}\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":10001,\"uid\":0,\"gid\":10001,\"active_caps\":0,\"bounding\":\"0\"}\n");
  prefix_refuses("{\"unexpected\":true}\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":10001,\"gid\":10001,\"active_caps\":0,\"bounding\":\"REFUSE\"}\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":9223372036854775808,\"gid\":10001,\"active_caps\":0,\"bounding\":\"0\"}\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":1e4,\"gid\":10001,\"active_caps\":0,\"bounding\":\"0\"}\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":010001,\"gid\":10001,\"active_caps\":0,\"bounding\":\"0\"}\n");
  prefix_refuses("{\"test\":\"guard\",\"uid\":-10001,\"gid\":10001,\"active_caps\":0,\"bounding\":\"0\"}\n");
  prefix_refuses("{\"test\":{\"status\":\"REFUSE\"}}\n");
  prefix_refuses("{\"test\":\"guard\",}\n");
  prefix_refuses("{\"sta\\u0074us\":\"REFUSE\"}\n");
  prefix_refuses(proof_pass);
  n = snprintf(report, sizeof report, "%s%s", proof_pass, guard);
  assert(!valid_report(report, (size_t)n));
  report[3] = 0;
  assert(!valid_report(report, (size_t)n));
  char *large = malloc(REPORT_LIMIT + 1);
  assert(large);
  size_t used = 0;
  for (size_t i = 0; i < REPORT_RECORD_LIMIT - 1; i++) {
    memcpy(large + used, guard, sizeof guard - 1); used += sizeof guard - 1;
  }
  memcpy(large + used, proof_pass, sizeof proof_pass - 1);
  assert(valid_report(large, used + sizeof proof_pass - 1));
  memcpy(large + used, guard, sizeof guard - 1); used += sizeof guard - 1;
  memcpy(large + used, proof_pass, sizeof proof_pass - 1);
  assert(!valid_report(large, used + sizeof proof_pass - 1));
  memset(large, 'x', REPORT_LIMIT + 1);
  assert(!valid_report(large, REPORT_LIMIT + 1));
  memset(large, 'x', REPORT_LINE_LIMIT + 1); large[REPORT_LINE_LIMIT + 1] = '\n';
  memcpy(large + REPORT_LINE_LIMIT + 2, proof_pass, sizeof proof_pass - 1);
  assert(!valid_report(large, REPORT_LINE_LIMIT + 2 + sizeof proof_pass - 1));
  free(large);
  /* Exercise truncated tokens and byte classes under ASan/UBSan. */
  for (unsigned c = 0; c <= 255; c++) {
    memcpy(report, guard, sizeof guard - 1);
    memcpy(report + sizeof guard - 1, proof_pass, sizeof proof_pass - 1);
    for (size_t i = 0; i < sizeof guard - 1; i++) {
      char saved = report[i]; report[i] = (char)c;
      (void)valid_report(report, sizeof guard + sizeof proof_pass - 2);
      report[i] = saved;
    }
  }
}
static void cleanup_test(const char *stub, int orphan) {
  int output[2]; assert(!pipe(output));
  pid_t child = fork(); assert(child >= 0);
  if (!child) {
    if (setpgid(0, 0)) _exit(79);
    close(output[0]);
    if (dup2(output[1], 1) < 0 || dup2(output[1], 2) < 0) _exit(79);
    close(output[1]);
    if (orphan) { execl(stub, stub, NULL); _exit(79); }
    _exit(0);
  }
  close(output[1]);
  assert(!setpgid(child, child) || errno == EACCES || errno == ESRCH);
  long long deadline = millis() + 2000;
  char report[256]; size_t used = 0; int done = 0, eof = 0;
  assert(!fcntl(output[0], F_SETFL, O_NONBLOCK));
  while (millis() < deadline) {
    ssize_t n = read(output[0], report + used, sizeof report - used);
    if (n > 0) used += (size_t)n;
    else if (n == 0) eof = 1;
    siginfo_t info;
    if (!waitid(P_PID, child, &info, WEXITED | WNOHANG | WNOWAIT) && info.si_pid == child) done = 1;
    if (done && eof) break;
    struct pollfd p = {output[0], POLLIN, 0}; poll(&p, 1, 1);
  }
  /* The main child is still waitable. The cleanup function must retain its
   * identity through signaling, and reap the adopted live descendant too. */
  struct child_cleanup result = finish_children(child, millis() + 2000);
  close(output[0]);
  assert(done && result.complete);
  assert(result.reaped == (orphan ? 2U : 1U));
  assert(WIFEXITED(result.main_status) && !WEXITSTATUS(result.main_status));
  if (orphan) {
    assert(used == sizeof proof_pass - 1 && !memcmp(report, proof_pass, used));
    assert(valid_report(report, used));
  }
  errno = 0; assert(waitpid(-1, NULL, WNOHANG) == -1 && errno == ECHILD);
}
int main(int argc, char **argv) {
  assert(argc == 2 || argc == 3);
  assert(!prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0));
  parser_tests();
  if (argc == 3) {
    char *bytes = malloc(REPORT_LIMIT + 1); assert(bytes);
    FILE *f = fopen(argv[2], "rb"); assert(f);
    size_t n = fread(bytes, 1, REPORT_LIMIT + 1, f);
    assert(!ferror(f) && !fclose(f));
    assert(valid_report(bytes, n)); free(bytes);
  }
  cleanup_test(argv[1], 0);
  cleanup_test(argv[1], 1);
  puts("PASS: bounded report parser and zero-exit orphan reaping; host tests only");
  return 0;
}
