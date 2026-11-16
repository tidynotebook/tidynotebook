# 0241. Linux images build fixed native libraries

- Status: Accepted
- Date: 2026-11-03

## Context

Sharp 0.35.5 uses native bundle 1.3.4. That bundle still contains libheif
1.23.5, libpng 1.6.58 and Expat 2.8.5. Fixed upstream sources are available.
An npm override cannot change the code inside a prebuilt shared library.

## Decision

Build the Linux image libraries from pinned sources. Use the sharp-libvips
1.3.4 recipe and its codec choices. Keep libvips 8.18.7. Update libheif to
1.23.7, libpng to 1.6.59 and Expat to 2.10.0. Keep these three libraries
shared, so their version functions and loaded paths can be checked.

Compile Sharp against this libvips with its supported custom-library method.
Remove the prebuilt Sharp add-ons and library bundles from the final image.
The normal contributor install keeps the upstream npm packages. It is not
evidence that the fixed libraries run outside the built Linux image.

Keep source archives, hashes, upstream patches, the complete Rust crate
sources, build commands and license files with the image. Pin the build-only
Rust image, Debian snapshot and build tool versions. Disable network access
during native library compilation. Test the final image on native amd64 and
arm64 runners. Check version functions, the libraries loaded by Sharp, their
hashes and the dynamic link graph.

## Consequences

Image builds take longer and require a C/C++ and Rust toolchain. These tools
do not enter the runner. The supported image platforms stay Linux amd64 and
arm64 with the pinned Debian glibc base. The image command and storage format
stay the same. The new library directory is `/opt/notesapp-native`. A modified
compatible library can replace a shared library there. The image includes
the preferred source and build instructions for this purpose.

The PNG, JPEG, GIF and WebP loader restriction stays in place. This decision
does not add worker memory or access limits. No worker sandbox is proved.
The Docker probe queried a kernel capability only. The Railway SSH probe
found UID 0 and stopped before any boundary test. Worker work needs a later
platform decision. Security issues stay open for their unproved scope.

This decision permits no release, deployment or host change.
