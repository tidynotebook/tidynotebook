/* Fixed producer grammar: flat ASCII JSON records, then one exact PASS record. */
#include <stdint.h>

#define REPORT_LIMIT 65536U
#define REPORT_LINE_LIMIT 1023U
#define REPORT_RECORD_LIMIT 512U
#define REPORT_FIELD_LIMIT 20U
static const char proof_pass[] = "{\"status\":\"PASS\",\"scope\":\"local_diagnostic_only\",\"platform_proved\":false}\n";
struct report_field {
  const char *key, *value;
  size_t key_length, length;
  char type;
};
struct report_record { struct report_field fields[REPORT_FIELD_LIMIT]; size_t count; };
static int same_text(const char *p, size_t length, const char *expected) {
  return strlen(expected) == length && !memcmp(p, expected, length);
}
static int report_string(const char **cursor, const char *end, const char **value, size_t *length) {
  const char *p = *cursor;
  if (p == end || *p++ != '"') return 0;
  *value = p;
  while (p < end && *p != '"') {
    /* The fixed producer emits no escapes or non-ASCII text. */
    if ((unsigned char)*p < 32 || (unsigned char)*p > 126 || *p == '\\') return 0;
    p++;
  }
  if (p == end) return 0;
  *length = (size_t)(p - *value);
  *cursor = p + 1;
  return 1;
}
static const struct report_field *report_find(const struct report_record *r, const char *name) {
  for (size_t i = 0; i < r->count; i++)
    if (same_text(r->fields[i].key, r->fields[i].key_length, name)) return &r->fields[i];
  return NULL;
}
static int report_object(const char *p, const char *end, struct report_record *r) {
  if (p == end || *p++ != '{') return 0;
  r->count = 0;
  for (;;) {
    if (r->count == REPORT_FIELD_LIMIT) return 0;
    struct report_field *f = &r->fields[r->count];
    if (!report_string(&p, end, &f->key, &f->key_length) || !f->key_length || f->key_length > 40) return 0;
    for (size_t i = 0; i < r->count; i++)
      if (r->fields[i].key_length == f->key_length && !memcmp(r->fields[i].key, f->key, f->key_length)) return 0;
    if (p == end || *p++ != ':') return 0;
    if (p < end && *p == '"') {
      f->type = 's';
      if (!report_string(&p, end, &f->value, &f->length)) return 0;
    } else {
      f->value = p;
      while (p < end && *p != ',' && *p != '}') p++;
      f->length = (size_t)(p - f->value);
      if (same_text(f->value, f->length, "true") || same_text(f->value, f->length, "false")) f->type = 'b';
      else {
        f->type = 'n';
        size_t i = 0;
        if (i < f->length && f->value[i] == '-') i++;
        if (i == f->length || (f->value[i] == '0' && i + 1 != f->length)) return 0;
        uint64_t n = 0;
        for (; i < f->length; i++) {
          unsigned char c = (unsigned char)f->value[i];
          if (c < '0' || c > '9' || n > (INT64_MAX - (uint64_t)(c - '0')) / 10) return 0;
          n = n * 10 + c - '0';
        }
      }
    }
    r->count++;
    if (p == end) return 0;
    if (*p == '}') return p + 1 == end;
    if (*p++ != ',') return 0;
  }
}
static int report_schema(const struct report_record *r, const char *schema) {
  size_t count = 0;
  while (*schema) {
    const char *name = schema;
    while (*schema && *schema != ':') schema++;
    if (!*schema) return 0;
    size_t length = (size_t)(schema - name);
    char type = *++schema;
    if (!type) return 0;
    schema++;
    if (*schema && *schema++ != ' ') return 0;
    int found = 0;
    for (size_t i = 0; i < r->count; i++) {
      const struct report_field *f = &r->fields[i];
      if (f->key_length == length && !memcmp(f->key, name, length)) {
        if (f->type != type || (type == 'b' && !same_text(f->value, f->length, "true"))) return 0;
        if (type == 'n' && f->value[0] == '-' && !same_text(name, length, "value")) return 0;
        found = 1;
      }
    }
    if (!found) return 0;
    count++;
  }
  return count == r->count;
}
static int report_value(const struct report_record *r, const char *key, const char *value) {
  const struct report_field *f = report_find(r, key);
  return f && same_text(f->value, f->length, value);
}
static int report_hash(const struct report_record *r, const char *key) {
  const struct report_field *f = report_find(r, key);
  if (!f || f->length != 64) return 0;
  for (size_t i = 0; i < f->length; i++)
    if (!strchr("0123456789abcdef", f->value[i])) return 0;
  return 1;
}
static int report_choice(const struct report_record *r, const char *key, const char *const *choices, size_t count) {
  for (size_t i = 0; i < count; i++) if (report_value(r, key, choices[i])) return 1;
  return 0;
}
static int report_characters(const struct report_record *r, const char *key, const char *characters, size_t maximum) {
  const struct report_field *f = report_find(r, key);
  if (!f || !f->length || f->length > maximum) return 0;
  for (size_t i = 0; i < f->length; i++) if (!strchr(characters, f->value[i])) return 0;
  return 1;
}
static uint64_t report_number(const struct report_record *r, const char *key) {
  const struct report_field *f = report_find(r, key);
  if (!f || f->type != 'n' || !f->length || f->value[0] == '-') return UINT64_MAX;
  uint64_t n = 0;
  for (size_t i = 0; i < f->length; i++) n = n * 10 + (unsigned char)f->value[i] - '0';
  return n;
}
static int report_fixture(const struct report_record *r, const char *key) {
  const char *names[] = {"small.png", "small.jpeg", "small.gif", "small.webp", "wide.png", "tall.png", "limit.png", "limit.jpeg", "limit.webp", "metadata.jpeg", "animated-limit.gif"};
  return report_choice(r, key, names, sizeof names / sizeof names[0]);
}
static int report_nonterminal(const struct report_record *r) {
  if (report_find(r, "status")) return 0;
  if (report_find(r, "test")) {
    if (report_value(r, "test", "guard"))
      return report_schema(r, "test:s uid:n gid:n active_caps:n bounding:s") && report_value(r, "uid", "10001") && report_value(r, "gid", "10001") && report_value(r, "active_caps", "0") && report_characters(r, "bounding", "0123456789abcdef", 16);
    if (report_value(r, "test", "trusted_init"))
      return report_schema(r, "test:s vips:s threads:n concurrency:n") && report_value(r, "threads", "1") && report_value(r, "concurrency", "1") && report_characters(r, "vips", "0123456789.", 32);
    if (report_value(r, "test", "fixture"))
      return report_schema(r, "test:s name:s wait_status:n wall_ms:n output_bytes:n rss_kib:n cpu_us:n reaped:b") && report_value(r, "wait_status", "0") && report_value(r, "output_bytes", "15") && report_fixture(r, "name");
    const char *names[] = {"open_read", "open_write", "create", "rename", "link", "unlink", "truncate", "directory", "socket", "socketpair", "connect", "bind", "listen", "sendto", "sendmsg", "sendmmsg", "clone", "clone3", "execve", "execveat", "ptrace", "process_vm_readv", "process_vm_writev", "kill", "tkill", "tgkill", "rt_sigqueueinfo", "rt_tgsigqueueinfo", "fork", "vfork", "thread_clone", "malloc", "mmap", "cpu", "wall", "output", "crash", "malformed", "x32_refusal"};
    for (size_t i = 0; i < sizeof names / sizeof names[0]; i++)
      if (report_value(r, "test", names[i])) return report_schema(r, "test:s layers:n mode:n expected_errno:n errno:n value:n allocated:n wait_status:n cause:n wall_ms:n cpu_us:n rss_kib:n output_bytes:n reaped:b policy_and_limits_verified:b") && report_number(r, "layers") <= 3 && report_number(r, "mode") <= 8 && report_number(r, "errno") <= 4095 && report_number(r, "expected_errno") <= 4095 && (report_find(r, "value")->value[0] != '-' || report_value(r, "value", "-1"));
    return 0;
  }
  if (report_find(r, "binding")) {
    const char *names[] = {"/opt/notesapp-native/bin/native-boundary-proof", "/app/entrypoint.sh", "/app/entrypoint.sh.original", "/opt/notesapp-native/proof-manifest.json", "/opt/notesapp-native/proof-policy.json"};
    return report_schema(r, "binding:s sha256:s") && report_hash(r, "sha256") && report_choice(r, "binding", names, sizeof names / sizeof names[0]);
  }
  if (report_find(r, "loaded_library")) {
    const struct report_field *f = report_find(r, "loaded_library");
    return report_schema(r, "loaded_library:s sha256:s") && report_hash(r, "sha256") && f->length > 1 && f->value[0] == '/' && report_characters(r, "loaded_library", "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/._+-", 512);
  }
  if (report_find(r, "fixture")) return report_schema(r, "fixture:s sha256:s") && report_hash(r, "sha256") && report_fixture(r, "fixture");
  if (report_find(r, "canary_sha256")) return report_schema(r, "canary_sha256:s") && report_hash(r, "canary_sha256");
  if (report_find(r, "socket_family")) return report_schema(r, "socket_family:n socket_type:n");
  if (report_find(r, "architecture")) return report_schema(r, "architecture:s kernel:s landlock_abi:n") && (report_value(r, "architecture", "x86_64") || report_value(r, "architecture", "aarch64")) && report_number(r, "landlock_abi") >= 3 && report_characters(r, "kernel", "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._+-", 64);
  return report_schema(r, "baseline_vm_kib:n baseline_rss_kib:n as_bytes:n cpu_seconds:n wall_ms:n output_bytes:n") && report_value(r, "as_bytes", "268435456") && report_value(r, "cpu_seconds", "2") && report_value(r, "wall_ms", "5000") && report_value(r, "output_bytes", "1048576");
}
static int valid_report(const char *report, size_t length) {
  if (!length || length > REPORT_LIMIT) return 0;
  size_t offset = 0, count = 0;
  while (offset < length) {
    if (++count > REPORT_RECORD_LIMIT) return 0;
    const char *line = report + offset;
    const char *newline = memchr(line, '\n', length - offset);
    if (!newline || newline == line || (size_t)(newline - line) > REPORT_LINE_LIMIT) return 0;
    size_t bytes = (size_t)(newline - line) + 1;
    struct report_record r;
    if (!report_object(line, newline, &r)) return 0;
    offset += bytes;
    if (report_find(&r, "status"))
      return offset == length && bytes == sizeof proof_pass - 1 && !memcmp(line, proof_pass, bytes);
    if (!report_nonterminal(&r)) return 0;
  }
  return 0;
}
