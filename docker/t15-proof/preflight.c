/* Diagnostic only. Stop before input if trusted native initialization starts threads. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <grp.h>
#include <linux/capability.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <time.h>
#include <stdarg.h>
#include <link.h>
#include "policy.h"
#include <unistd.h>

#include "sha256.h"

static size_t report_bytes;
static void proof_report(const char *format, ...) {
  char line[1024];
  va_list args;
  va_start(args, format);
  int n = vsnprintf(line, sizeof line, format, args);
  va_end(args);
  if (n < 0 || n >= (int)sizeof line || (size_t)n > 65536 - report_bytes) _exit(77);
  report_bytes += (size_t)n;
  if (fwrite(line, 1, (size_t)n, stdout) != (size_t)n) _exit(77);
}
#define printf proof_report
static int loaded(struct dl_phdr_info *info, size_t size, void *data) {
  (void)size; (void)data;
  const char *p = info->dlpi_name;
  if (!p || !*p || !strcmp(p, "linux-vdso.so.1")) return 0;
  if (strlen(p) > 512 || strpbrk(p, "\\\"\n\r")) return -1;
  if (strncmp(p, "/opt/notesapp-native/lib/", 25) && strncmp(p, "/lib/", 5) && strncmp(p, "/lib64/", 7) && strncmp(p, "/usr/lib/", 9)) return -1;
  char hash[65];
  if (file_hash(p, hash) || expected_hash(p, hash)) return -1;
  printf("{\"loaded_library\":\"%s\",\"sha256\":\"%s\"}\n", p, hash);
  return 0;
}
static void (*cleanup)(void);
static void refuse(const char *reason) {
  if (cleanup) cleanup();
  printf("{\"status\":\"REFUSE\",\"reason\":\"%s\",\"boundary_proved\":false}\n", reason);
  exit(77);
}

static int threads(void) {
  FILE *f = fopen("/proc/self/status", "re");
  if (!f) refuse("self_status_unreadable");
  char line[256];
  int count = 0;
  size_t bytes = 0;
  while (fgets(line, sizeof line, f)) {
    bytes += strlen(line);
    if (bytes > 16384) refuse("self_status_too_large");
    if (sscanf(line, "Threads: %d", &count) == 1) break;
  }
  if (fclose(f) || count < 1) refuse("thread_evidence_unreadable");
  return count;
}

static void guard(void) {
  uid_t r, e, s;
  gid_t gr, ge, gs, groups[32];
  if (getresuid(&r, &e, &s) || getresgid(&gr, &ge, &gs) ||
      r != 10001 || e != 10001 || s != 10001 ||
      gr != 10001 || ge != 10001 || gs != 10001) refuse("identity");
  int n = getgroups(32, groups);
  if (n < 0) refuse("groups_unreadable");
  for (int i = 0; i < n; i++) if (groups[i] != 10001) refuse("groups");
  struct __user_cap_header_struct h = { _LINUX_CAPABILITY_VERSION_3, 0 };
  struct __user_cap_data_struct d[2] = {{0}};
  if (syscall(SYS_capget, &h, d)) refuse("capabilities_unreadable");
  for (int i = 0; i < 2; i++)
    if (d[i].effective || d[i].permitted || d[i].inheritable) refuse("active_capabilities");
  unsigned long long bounding = 0;
  for (int cap = 0; cap <= CAP_LAST_CAP; cap++) {
    int ambient = prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_IS_SET, cap, 0, 0);
    int bound = prctl(PR_CAPBSET_READ, cap, 0, 0, 0);
    if (ambient < 0 || bound < 0) refuse("capability_evidence_unreadable");
    if (ambient) refuse("ambient_capabilities");
    if (bound) bounding |= 1ULL << cap;
  }
  printf("{\"test\":\"guard\",\"uid\":10001,\"gid\":10001,\"active_caps\":0,\"bounding\":\"%llx\"}\n", bounding);
}

static void memory_evidence(void) {
  FILE *f = fopen("/proc/self/status", "re");
  if (!f) refuse("memory_evidence");
  char line[256]; size_t bytes = 0; unsigned long vm = 0, rss = 0;
  while (fgets(line, sizeof line, f)) {
    bytes += strlen(line); if (bytes > 16384) refuse("memory_evidence_size");
    if (!strncmp(line, "VmSize:", 7)) vm = strtoul(line + 7, NULL, 10);
    if (!strncmp(line, "VmRSS:", 6)) rss = strtoul(line + 6, NULL, 10);
  }
  if (fclose(f) || !vm || !rss) refuse("memory_evidence_missing");
  printf("{\"baseline_vm_kib\":%lu,\"baseline_rss_kib\":%lu,\"as_bytes\":268435456,\"cpu_seconds\":2,\"wall_ms\":5000,\"output_bytes\":1048576}\n", vm, rss);
}
static long long millis(void) {
  struct timespec t;
  if (clock_gettime(CLOCK_MONOTONIC, &t)) refuse("clock");
  return (long long)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}

static void confirm_limits(void);
static void fixture(void *lib, const char *name, int width, int height) {
  char path[256];
  if (snprintf(path, sizeof path, "/opt/notesapp-native/proof-fixtures/%s", name) >= (int)sizeof path) refuse("fixture_path");
  char hash[65];
  if (file_hash(path, hash) || expected_hash(path, hash)) refuse("fixture_hash");
  printf("{\"fixture\":\"%s\",\"sha256\":\"%s\"}\n", name, hash);
  int input = open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (input < 0) refuse("fixture_open");
  int pipes[2];
  if (pipe2(pipes, O_CLOEXEC)) refuse("result_pipe");
  fflush(stdout);
  long long start = millis();
  pid_t parent = getpid();
  pid_t child = fork();
  if (child < 0) refuse("fork");
  if (child == 0) {
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != parent) _exit(77);
    /* Native symbols and configuration are trusted and resolved before policy. */
    void *(*load)(const void *, size_t, const char *, ...) = dlsym(lib, "vips_image_new_from_buffer");
    int (*get_width)(void *) = dlsym(lib, "vips_image_get_width");
    int (*get_height)(void *) = dlsym(lib, "vips_image_get_height");
    int (*has_alpha)(void *) = dlsym(lib, "vips_image_hasalpha");
    int (*get_int)(void *, const char *, int *) = dlsym(lib, "vips_image_get_int");
    const char *(*find_loader)(const void *, size_t) = dlsym(lib, "vips_foreign_find_load_buffer");
    if (!load || !get_width || !get_height || !has_alpha || !get_int || !find_loader) _exit(77);
    if (dup2(pipes[1], 1) < 0 || dup2(pipes[1], 2) < 0 || dup2(input, 3) < 0) _exit(77);
    close(0);
    if (syscall(SYS_close_range, 4U, ~0U, 0U)) _exit(77);
    struct rlimit as = {268435456, 268435456}, cpu = {2, 2}, core = {0, 0};
    if (setrlimit(RLIMIT_AS, &as) || setrlimit(RLIMIT_CPU, &cpu) || setrlimit(RLIMIT_CORE, &core) ||
        clearenv()) _exit(77);
    confirm_limits();
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) ||
        prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) != 1 || landlock() || seccomp()) _exit(77);
    /* File size and input reads use only the retained descriptor. */
    off_t length = lseek(3, 0, SEEK_END);
    if (length <= 0 || length > 268435456 || lseek(3, 0, SEEK_SET) < 0) _exit(77);
    unsigned char *buffer = malloc((size_t)length);
    if (!buffer) _exit(78);
    size_t used = 0;
    while (used < (size_t)length) {
      ssize_t n = read(3, buffer + used, (size_t)length - used);
      if (n <= 0) _exit(79);
      used += (size_t)n;
    }
    const char *loader = find_loader(buffer, used);
    const char *format = strstr(name, ".png") ? "png" : strstr(name, ".jpeg") ? "jpeg" : strstr(name, ".gif") ? "gif" : "webp";
    if (!loader || !strcasestr(loader, format)) _exit(83);
    void *image = strstr(name, ".gif") || strstr(name, ".webp")
      ? load(buffer, used, "", "access", 1, "n", -1, NULL)
      : load(buffer, used, "", "access", 1, NULL);
    if (!image) _exit(80);
    if (get_width(image) != width || get_height(image) != height) _exit(81);
    int expected_alpha = !strcmp(name, "small.png") || strstr(name, ".webp") || strstr(name, ".gif");
    if (!!has_alpha(image) != !!expected_alpha) _exit(84);
    int metadata = 0;
    if (!strcmp(name, "metadata.jpeg") && (get_int(image, "orientation", &metadata) || metadata != 6)) _exit(85);
    if (!strcmp(name, "animated-limit.gif")) {
      if (get_int(image, "n-pages", &metadata) || metadata != 2) _exit(86);
      if (get_int(image, "page-height", &metadata) || metadata != 2500) _exit(87);
    }
    if (write(1, "T15-FIXTURE-OK\n", 15) != 15) _exit(82);
    _exit(0);
  }
  close(input);
  close(pipes[1]);
  if (fcntl(pipes[0], F_SETFL, O_NONBLOCK)) { kill(child, SIGKILL); waitpid(child, NULL, 0); refuse("pipe_flags"); }
  char report[4096];
  size_t bytes = 0;
  int status = 0, done = 0, eof = 0, killed = 0;
  struct rusage usage = {0};
  while (!done || !eof) {
    if (millis() - start >= 5000 && !done) { kill(child, SIGKILL); killed = 1; }
    char chunk[4096];
    ssize_t n = read(pipes[0], chunk, sizeof chunk);
    if (n > 0) {
      if ((size_t)n <= sizeof report - bytes) memcpy(report + bytes, chunk, (size_t)n);
      bytes += (size_t)n;
      if (bytes > 1048576 && !done) { kill(child, SIGKILL); killed = 1; }
    } else if (!n) eof = 1;
    else if (errno != EAGAIN && errno != EINTR) { kill(child, SIGKILL); killed = 1; eof = 1; }
    if (!done) {
      pid_t result = wait4(child, &status, WNOHANG, &usage);
      if (result == child) done = 1;
      else if (result < 0 && errno != EINTR) refuse("reap");
    }
    if (!done || !eof) { struct pollfd p = {pipes[0], POLLIN, 0}; poll(&p, 1, 10); }
  }
  close(pipes[0]);
  errno = 0;
  int reaped = waitpid(child, NULL, WNOHANG) == -1 && errno == ECHILD;
  printf("{\"test\":\"fixture\",\"name\":\"%s\",\"wait_status\":%d,\"wall_ms\":%lld,\"output_bytes\":%zu,\"rss_kib\":%ld,\"cpu_us\":%ld,\"reaped\":%s}\n",
    name, status, millis() - start, bytes, usage.ru_maxrss,
    usage.ru_utime.tv_sec * 1000000 + usage.ru_utime.tv_usec + usage.ru_stime.tv_sec * 1000000 + usage.ru_stime.tv_usec,
    reaped ? "true" : "false");
  if (!reaped || killed || !WIFEXITED(status) || WEXITSTATUS(status) || bytes != 15 || memcmp(report, "T15-FIXTURE-OK\n", 15)) refuse("valid_input_failed_calibration_stopped");
}

#include "suite.h"

int main(int argc, char **argv) {
  guard();
  static const char *args[] = {
    "--fixture-dir", "/opt/notesapp-native/proof-fixtures",
    "--as-bytes", "268435456", "--cpu-seconds", "2", "--wall-ms", "5000",
    "--output-bytes", "1048576", "--require-uid", "10001", "--require-gid", "10001"
  };
  if (argc != 15) refuse("arguments");
  for (int i = 0; i < 14; i++) if (strcmp(argv[i + 1], args[i])) refuse("arguments");
  if (clearenv()) refuse("environment");
  const char *fixed[] = {"/opt/notesapp-native/bin/native-boundary-proof", "/app/entrypoint.sh",
    "/app/entrypoint.sh.original", "/opt/notesapp-native/proof-manifest.json", "/opt/notesapp-native/proof-policy.json"};
  for (size_t i = 0; i < sizeof fixed / sizeof fixed[0]; i++) {
    char hash[65];
    if (file_hash(fixed[i], hash) || expected_hash(fixed[i], hash)) refuse("manifest_binding");
    printf("{\"binding\":\"%s\",\"sha256\":\"%s\"}\n", fixed[i], hash);
  }
  struct sha256 check; char digest[65]; sha_init(&check); sha_update(&check, (const unsigned char *)"abc", 3); sha_finish(&check, digest);
  if (strcmp(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")) refuse("hash_self_test");
  struct rlimit core = {0, 0};
  if (setrlimit(RLIMIT_CORE, &core)) refuse("core_limit");
  if (threads() != 1) refuse("initial_threads");
  void *lib = dlopen("/opt/notesapp-native/lib/libvips-cpp.so.8.18.7", RTLD_NOW | RTLD_LOCAL);
  if (!lib) refuse("native_loader");
  int (*init)(const char *) = dlsym(lib, "vips_init");
  void (*concurrency)(int) = dlsym(lib, "vips_concurrency_set");
  const char *(*version)(void) = dlsym(lib, "vips_version_string");
  if (!init || !concurrency || !version) refuse("native_symbols");
  concurrency(1);
  if (init("t15-native-boundary-proof")) refuse("native_init");
  concurrency(1);
  int count = threads();
  const char *v = version();
  if (!v || strspn(v, "0123456789.") != strlen(v)) refuse("native_version");
  printf("{\"test\":\"trusted_init\",\"vips\":\"%s\",\"threads\":%d,\"concurrency\":1}\n", v, count);
  if (count != 1) refuse("trusted_loader_threads_need_policy_review");
  if (dl_iterate_phdr(loaded, NULL)) refuse("unexpected_library_path");
  struct utsname kernel;
  if (uname(&kernel)) refuse("kernel_evidence");
  printf("{\"architecture\":\"%s\",\"kernel\":\"%s\",\"landlock_abi\":%ld}\n", kernel.machine, kernel.release,
    syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION));
  memory_evidence();
  kernel_suite();
  fixture(lib, "small.png", 8, 8);
  fixture(lib, "small.jpeg", 8, 8);
  fixture(lib, "small.gif", 8, 8);
  fixture(lib, "small.webp", 8, 8);
  fixture(lib, "limit.png", 8000, 5000);
  fixture(lib, "wide.png", 32767, 1);
  fixture(lib, "tall.png", 1, 32767);
  fixture(lib, "metadata.jpeg", 8, 8);
  fixture(lib, "limit.jpeg", 8000, 5000);
  fixture(lib, "limit.webp", 8000, 5000);
  fixture(lib, "animated-limit.gif", 8000, 5000);
  errno = 0;
  if (waitpid(-1, NULL, WNOHANG) != -1 || errno != ECHILD) refuse("unreaped_child");
  printf("{\"status\":\"PASS\",\"scope\":\"local_diagnostic_only\",\"platform_proved\":false}\n");
  return 0;
}
