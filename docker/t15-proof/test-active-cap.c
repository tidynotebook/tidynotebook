/* Test only. Never copied to the candidate. It can run only the refusal case. */
#define _GNU_SOURCE
#include <grp.h>
#include <linux/capability.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>
int main(void) {
  gid_t group = 10001;
  if (getuid() || setgroups(1, &group) || setresgid(group, group, group) ||
      prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0) || setresuid(10001, 10001, 10001)) return 78;
  struct __user_cap_header_struct header = { _LINUX_CAPABILITY_VERSION_3, 0 };
  struct __user_cap_data_struct caps[2] = {{0}};
  caps[0].effective = caps[0].permitted = caps[0].inheritable = 1U << CAP_CHOWN;
  if (syscall(SYS_capset, &header, caps) ||
      prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_RAISE, CAP_CHOWN, 0, 0)) return 78;
  char *args[] = {"/opt/notesapp-native/bin/native-boundary-proof",
    "--fixture-dir", "/opt/notesapp-native/proof-fixtures", "--as-bytes", "268435456",
    "--cpu-seconds", "2", "--wall-ms", "5000", "--output-bytes", "1048576",
    "--require-uid", "10001", "--require-gid", "10001", 0};
  char *environment[] = {"PATH=/usr/bin:/bin", 0};
  execve(args[0], args, environment);
  return 78;
}
