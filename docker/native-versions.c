/* Query the libraries that the runtime loader actually selects. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void version(const char *name, const char *library, const char *symbol,
                    int png, int last) {
  void *handle = dlopen(library, RTLD_NOW | RTLD_LOCAL);
  if (!handle) {
    fprintf(stderr, "%s: %s\n", library, dlerror());
    exit(1);
  }
  void *function = dlsym(handle, symbol);
  Dl_info info;
  if (!function || !dladdr(function, &info) || !info.dli_fname) exit(1);
  const char *value = png ? ((const char *(*)(void *))function)(NULL)
                          : ((const char *(*)(void))function)();
  if (!value || strpbrk(value, "\"\\\n") || strpbrk(info.dli_fname, "\"\\\n")) exit(1);
  if (strcmp(name, "expat") == 0 && strncmp(value, "expat_", 6) == 0) value += 6;
  printf("\"%s\":{\"version\":\"%s\",\"path\":\"%s\"}%s", name, value,
         info.dli_fname, last ? "" : ",");
}

int main(void) {
  printf("{");
  version("heif", "libheif.so.1", "heif_get_version", 0, 0);
  version("png", "libpng16.so.16", "png_get_libpng_ver", 1, 0);
  version("expat", "libexpat.so.1", "XML_ExpatVersion", 0, 0);
  version("vips", "libvips-cpp.so.8.18.7", "vips_version_string", 0, 1);
  printf("}\n");
  return 0;
}
