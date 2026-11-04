/* No file grants. No thread, process, socket, or alternate ABI exception. */
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/landlock.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <sys/prctl.h>
#include <sys/syscall.h>

#if defined(__x86_64__)
#define PROOF_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define PROOF_ARCH AUDIT_ARCH_AARCH64
#else
#error Native proof supports only Linux amd64 and arm64.
#endif
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif
static int landlock(void) {
  int abi = syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  if (abi < 3) return -1;
  struct landlock_ruleset_attr rules = { .handled_access_fs = (1ULL << 15) - 1 };
  int fd = syscall(SYS_landlock_create_ruleset, &rules, sizeof rules, 0);
  if (fd < 0) return -1;
  int result = syscall(SYS_landlock_restrict_self, fd, 0);
  if (close(fd)) return -1;
  return result;
}
#define ALLOW(n) BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_##n, 0, 1), BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW)
static int seccomp(void) {
  struct sock_filter code[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, PROOF_ARCH, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
#if defined(__x86_64__)
    BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, 0x40000000U, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
#endif
    ALLOW(read), ALLOW(write), ALLOW(close), ALLOW(lseek), ALLOW(fstat),
    ALLOW(mmap), ALLOW(mprotect), ALLOW(munmap), ALLOW(mremap), ALLOW(brk),
    ALLOW(madvise), ALLOW(futex), ALLOW(clock_gettime), ALLOW(getrusage),
    ALLOW(rt_sigaction), ALLOW(rt_sigprocmask), ALLOW(rt_sigreturn),
    ALLOW(sigaltstack), ALLOW(getpid), ALLOW(gettid), ALLOW(sched_yield),
    ALLOW(exit), ALLOW(exit_group),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM)
  };
  struct sock_fprog filter = { .len = sizeof code / sizeof code[0], .filter = code };
  return prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &filter);
}
#undef ALLOW
