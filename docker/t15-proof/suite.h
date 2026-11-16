#include <sys/socket.h>
#include <sys/uio.h>
#include <sys/ptrace.h>
#include <sys/stat.h>
#include <sys/utsname.h>
#include <sched.h>

static char private_dir[] = "/tmp/t15-proof-XXXXXX";
static char canary[256], target[256];
static pid_t supervisor;
static char canary_hash[65];
static int operation, family, socktype;
static const char *opname;

static long perform(void) {
  switch (operation) {
    case 0: return open(canary, O_RDONLY);
    case 1: return open(canary, O_WRONLY);
    case 2: return open(target, O_CREAT | O_EXCL | O_WRONLY, 0600);
    case 3: return rename(canary, target);
    case 4: return link(canary, target);
    case 5: return unlink(canary);
    case 6: return truncate(canary, 0);
    case 7: return open(private_dir, O_DIRECTORY | O_RDONLY);
    case 8: return socket(family, socktype, 0);
    case 9: { int pair[2]; return socketpair(family, socktype, 0, pair); }
    case 10: return syscall(SYS_connect, -1, NULL, 0);
    case 11: return syscall(SYS_bind, -1, NULL, 0);
    case 12: return syscall(SYS_listen, -1, 0);
    case 13: return syscall(SYS_sendto, -1, NULL, 0, 0, NULL, 0);
    case 14: return syscall(SYS_sendmsg, -1, NULL, 0);
    case 15: return syscall(SYS_sendmmsg, -1, NULL, 0, 0);
    case 16: return syscall(SYS_clone, SIGCHLD, NULL, NULL, NULL, 0);
    case 17: return syscall(SYS_clone3, NULL, 0);
    case 18: return syscall(SYS_execve, target, NULL, NULL);
    case 19: return syscall(SYS_execveat, -1, "", NULL, NULL, 0);
    case 20: return syscall(SYS_ptrace, 0x7fffffff, supervisor, NULL, NULL);
    case 21: return syscall(SYS_process_vm_readv, supervisor, NULL, 0, NULL, 0, 0);
    case 22: return syscall(SYS_process_vm_writev, supervisor, NULL, 0, NULL, 0, 0);
    case 23: return syscall(SYS_kill, supervisor, 0);
    case 24: return syscall(SYS_tkill, supervisor, 0);
    case 25: return syscall(SYS_tgkill, supervisor, supervisor, 0);
    case 26: return syscall(SYS_rt_sigqueueinfo, supervisor, 0, NULL);
    case 27: return syscall(SYS_rt_tgsigqueueinfo, supervisor, supervisor, 0, NULL);
#if defined(__x86_64__)
    case 28: return syscall(SYS_fork);
    case 29: return syscall(SYS_vfork);
#endif
    case 30: return syscall(SYS_clone, CLONE_VM | CLONE_THREAD | CLONE_SIGHAND, NULL, NULL, NULL, 0);
    default: return -2;
  }
}

struct result { int magic, installed, error; long value; size_t allocated; };
static void reset_canary(void) {
  unlink(canary);
  unlink(target);
  int fd = open(canary, O_CREAT | O_EXCL | O_WRONLY, 0600);
  if (fd < 0 || write(fd, "T15-CANARY", 10) != 10 || close(fd)) refuse("canary_reset");
}
static void unchanged(void) {
  char bytes[11];
  int fd = open(canary, O_RDONLY | O_NOFOLLOW);
  if (fd < 0 || read(fd, bytes, sizeof bytes) != 10 || memcmp(bytes, "T15-CANARY", 10) || close(fd)) refuse("canary_changed");
  char hash[65];
  if (file_hash(canary, hash) || strcmp(hash, canary_hash)) refuse("canary_hash_changed");
  struct stat st;
  if (!lstat(target, &st) || errno != ENOENT) refuse("unexpected_canary_target");
}

/* mode: 0 ordinary syscall, 1 malloc, 2 mmap, 3 CPU, 4 wall,
 * 5 output excess, 6 crash, 7 malformed result. */
static void confirm_limits(void) {
  struct rlimit as, cpu, core;
  if (getrlimit(RLIMIT_AS, &as) || getrlimit(RLIMIT_CPU, &cpu) || getrlimit(RLIMIT_CORE, &core) ||
      as.rlim_cur != 268435456 || as.rlim_max != 268435456 ||
      cpu.rlim_cur != 2 || cpu.rlim_max != 2 || core.rlim_cur || core.rlim_max) _exit(77);
}
static void run_case(int layers, int mode, int expected_errno, int expect_success) {
  reset_canary();
  if (file_hash(canary, canary_hash)) refuse("canary_hash_unreadable");
  int input = open(canary, O_RDONLY | O_CLOEXEC);
  int pipes[2];
  if (input < 0 || pipe2(pipes, O_CLOEXEC)) refuse("test_descriptors");
  printf("{\"canary_sha256\":\"%s\"}\n", canary_hash);
  fflush(stdout);
  long long start = millis();
  pid_t child = fork();
  if (child < 0) refuse("test_fork");
  if (!child) {
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != supervisor) _exit(77);
    if (dup2(pipes[1], 1) < 0 || dup2(pipes[1], 2) < 0 || dup2(input, 3) < 0) _exit(77);
    close(0);
    if (syscall(SYS_close_range, 4U, ~0U, 0U)) _exit(77);
    struct rlimit as = {268435456, 268435456}, cpu = {2, 2}, core = {0, 0};
    if (setrlimit(RLIMIT_AS, &as) || setrlimit(RLIMIT_CPU, &cpu) || setrlimit(RLIMIT_CORE, &core) || clearenv()) _exit(77);
    confirm_limits();
    if (mode == 4 && signal(SIGTERM, SIG_IGN) == SIG_ERR) _exit(77);
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) || prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) != 1) _exit(77);
    int installed = 0;
    if ((layers & 1) && landlock()) {
      struct result failure = { .magic=0x1515, .installed=installed, .error=errno, .value=-1 };
      write(1, &failure, sizeof failure); _exit(77);
    }
    installed |= layers & 1;
    if ((layers & 2) && seccomp()) {
      struct result failure = { .magic=0x1515, .installed=installed, .error=errno, .value=-1 };
      write(1, &failure, sizeof failure); _exit(77);
    }
    char bytes[11];
    if (read(3, bytes, sizeof bytes) != 10 || memcmp(bytes, "T15-CANARY", 10)) _exit(78);
    struct result result = { .magic = 0x1515, .installed = layers };
    if (!mode) {
      errno = 0;
      result.value = perform();
      result.error = errno;
    } else if (mode == 1 || mode == 2) {
      for (int i = 0; i < 128; i++) {
        errno = 0;
        void *p = mode == 1 ? malloc(4194304) : mmap(NULL, 4194304, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (p == NULL || p == MAP_FAILED) { result.error = errno; result.value = -1; break; }
        for (size_t offset = 0; offset < 4194304; offset += 4096) ((volatile char *)p)[offset] = 1;
        result.allocated += 4194304;
      }
    } else if (mode == 3) {
      volatile unsigned long value = 1;
      for (;;) value = value * 33 + 1;
    } else if (mode == 4) {
      /* Sleep without spending the CPU budget. SIGTERM is ignored. */
      for (;;) { struct timespec t = {0, 10000000}; syscall(SYS_nanosleep, &t, NULL); }
    } else if (mode == 5) {
      char bytes[4096] = {0};
      for (int i = 0; i < 512; i++) if (write(i % 2 ? 1 : 2, bytes, sizeof bytes) < 0) _exit(79);
      _exit(0);
    } else if (mode == 6) {
      /* Synchronous crash. It does not signal another process. */
      volatile char *p = (void *)0;
      *p = 0;
    } else if (mode == 7) { write(1, "INVALID", 7); _exit(0); }
#if defined(__x86_64__)
    else if (mode == 8) { syscall(SYS_getpid | 0x40000000U); _exit(79); }
#endif
    if (write(1, &result, sizeof result) != sizeof result) _exit(80);
    _exit(0);
  }
  close(input);
  close(pipes[1]);
  if (fcntl(pipes[0], F_SETFL, O_NONBLOCK)) { kill(child, SIGKILL); waitpid(child, NULL, 0); refuse("nonblocking_pipe"); }
  struct result result = {0};
  size_t bytes = 0;
  int done = 0, eof = 0, status = 0, cause = 0;
  struct rusage usage = {0};
  while (!done || !eof) {
    long long elapsed = millis() - start;
    if (!done && mode == 4 && elapsed >= 50 && !cause) { kill(child, SIGTERM); cause = 1; }
    if (!done && elapsed >= 5000 && cause != 2) { kill(child, SIGKILL); cause = 2; }
    char chunk[4096];
    ssize_t n = read(pipes[0], chunk, sizeof chunk);
    if (n > 0) {
      if (bytes < sizeof result) {
        size_t take = sizeof result - bytes;
        if (take > (size_t)n) take = (size_t)n;
        memcpy((char *)&result + bytes, chunk, take);
      }
      bytes += (size_t)n;
      if (bytes > 1048576 && !done && cause != 3) { kill(child, SIGKILL); cause = 3; }
    } else if (!n) eof = 1;
    else if (errno != EINTR && errno != EAGAIN) { kill(child, SIGKILL); cause = 4; eof = 1; }
    if (!done) {
      pid_t r = wait4(child, &status, WNOHANG, &usage);
      if (r == child) done = 1;
      else if (r < 0 && errno != EINTR) refuse("test_reap");
    }
    if (!done || !eof) { struct pollfd p = {pipes[0], POLLIN, 0}; poll(&p, 1, 1); }
  }
  close(pipes[0]);
  errno = 0;
  if (waitpid(child, NULL, WNOHANG) != -1 || errno != ECHILD) refuse("child_still_present");
  long cpu_us = usage.ru_utime.tv_sec * 1000000 + usage.ru_utime.tv_usec + usage.ru_stime.tv_sec * 1000000 + usage.ru_stime.tv_usec;
  int valid = !cause && WIFEXITED(status) && !WEXITSTATUS(status) && bytes == sizeof result && result.magic == 0x1515 && result.installed == layers;
  if (mode == 3) valid = cause == 0 && WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL && cpu_us >= 1900000;
  else if (mode == 4) valid = cause == 2 && WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL && cpu_us < 1000000;
  else if (mode == 5) valid = cause == 3 && WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL && bytes > 1048576;
  else if (mode == 6) valid = cause == 0 && WIFSIGNALED(status) && WTERMSIG(status) == SIGSEGV && !WCOREDUMP(status);
  else if (mode == 8) valid = cause == 0 && WIFSIGNALED(status) && WTERMSIG(status) == SIGSYS && !WCOREDUMP(status);
  else if (mode == 7) valid = cause == 0 && WIFEXITED(status) && !WEXITSTATUS(status) && bytes == 7 && result.magic != 0x1515;
  else if (mode == 1 || mode == 2) valid = valid && result.error == ENOMEM && result.value == -1 && result.allocated > 0 && result.allocated <= 268435456;
  else if (expect_success) valid = valid && result.value >= 0;
  else valid = valid && result.value == -1 && result.error == expected_errno;
  printf("{\"test\":\"%s\",\"layers\":%d,\"mode\":%d,\"expected_errno\":%d,\"errno\":%d,\"value\":%ld,\"allocated\":%zu,\"wait_status\":%d,\"cause\":%d,\"wall_ms\":%lld,\"cpu_us\":%ld,\"rss_kib\":%ld,\"output_bytes\":%zu,\"reaped\":true,\"policy_and_limits_verified\":%s}\n",
    opname, layers, mode, expected_errno, result.error, result.value, result.allocated, status, cause, millis() - start, cpu_us, usage.ru_maxrss, bytes, valid ? "true" : "false");
  if (layers || mode) unchanged();
  if (!valid) refuse("test_mismatch");
}

static void cleanup_canaries(void) {
  unlink(canary); unlink(target); rmdir(private_dir);
}

static void kernel_suite(void) {
  supervisor = getpid();
  if (!mkdtemp(private_dir) || chmod(private_dir, 0700)) refuse("private_directory");
  if (snprintf(canary, sizeof canary, "%s/canary", private_dir) >= (int)sizeof canary ||
      snprintf(target, sizeof target, "%s/target", private_dir) >= (int)sizeof target) refuse("canary_path");
  cleanup = cleanup_canaries;
  const char *files[] = {"open_read", "open_write", "create", "rename", "link", "unlink", "truncate", "directory"};
  for (operation = 0; operation < 8; operation++) {
    opname = files[operation];
    run_case(0, 0, 0, 1);
    run_case(1, 0, EACCES, 0);
    run_case(3, 0, EPERM, 0);
  }
  const char *network[] = {"socket", "socketpair"};
  int families[] = {AF_INET, AF_INET6, AF_UNIX};
  int types[] = {SOCK_STREAM, SOCK_DGRAM};
  for (operation = 8; operation <= 9; operation++) for (int f = 0; f < 3; f++) for (int t = 0; t < 2; t++) {
    family = families[f]; socktype = types[t]; opname = network[operation - 8];
    printf("{\"socket_family\":%d,\"socket_type\":%d}\n", family, socktype);
    if (operation == 8 || family == AF_UNIX) run_case(0, 0, 0, 1);
    else run_case(0, 0, EOPNOTSUPP, 0);
    run_case(2, 0, EPERM, 0); run_case(3, 0, EPERM, 0);
  }
  const char *others[] = {"connect", "bind", "listen", "sendto", "sendmsg", "sendmmsg", "clone", "clone3", "execve", "execveat", "ptrace", "process_vm_readv", "process_vm_writev", "kill", "tkill", "tgkill", "rt_sigqueueinfo", "rt_tgsigqueueinfo", "fork", "vfork"};
  for (operation = 10; operation < 30; operation++) {
#if defined(__aarch64__)
    if (operation >= 28) break; /* No fork/vfork syscall in this ABI. clone is tested. */
#endif
    opname = others[operation - 10];
    if (operation == 18 || operation == 19) run_case(0, 0, ENOENT, 0);
    if (operation == 20) run_case(0, 0, ESRCH, 0);
    if (operation >= 21 && operation <= 25) run_case(0, 0, 0, 1);
    if (operation == 26 || operation == 27) run_case(0, 0, EFAULT, 0);
    if (operation >= 10 && operation <= 15) run_case(0, 0, EBADF, 0);
    run_case(2, 0, EPERM, 0); run_case(3, 0, EPERM, 0);
  }
  operation = 30; opname = "thread_clone";
  run_case(2, 0, EPERM, 0); run_case(3, 0, EPERM, 0);
  const char *resources[] = {"malloc", "mmap", "cpu", "wall", "output", "crash", "malformed"};
  for (int mode = 1; mode <= 7; mode++) {
    opname = resources[mode - 1];
    /* Wall sleep is allowed only in the trusted wall test with Landlock alone. */
    run_case(mode == 4 ? 1 : 3, mode, mode == 1 || mode == 2 ? ENOMEM : 0, 0);
  }
#if defined(__x86_64__)
  opname = "x32_refusal"; run_case(3, 8, 0, 0);
#endif
  unlink(canary); unlink(target);
  if (rmdir(private_dir)) refuse("temporary_cleanup");
  cleanup = NULL;
}
