# Native library source build

Date: 2026-11-03
Base commit: `3935ad23b5257ae60189e59e617ae34cae57fd2d`
Candidate: the source changes in this PR. Exact image evidence is recorded in the PR.

This review covers the library source change only. It does not permit a release,
a deployment or a host change. Issues 332, 385, 386 and 387 stay open for their
remaining evidence. The released v0.23.4 image still uses the older native
bundle. A source merge does not update that image or production.

## Source and build decision

[Record 0241](../../decisions/0241-linux-images-build-fixed-native-libraries.md)
accepts a pinned Linux source build. At this date,
[Sharp 0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5) and
[sharp-libvips 1.3.4](https://github.com/lovell/sharp-libvips/releases/tag/v1.3.4)
are the latest official releases. The official bundle has no fixed replacement.
The image uses Sharp's [custom libvips method](https://sharp.pixelplumbing.com/install/#custom-libvips).

The build keeps libvips 8.18.7 and the upstream codec choices. It changes three
source versions and makes these three libraries shared. Other native versions
stay at the reviewed bundle versions. The source manifest keeps archive and
crate hashes. Native compilation has no network. The checked upstream build
recipe, its reviewed changes, the compiler image, Debian snapshot and tool
versions travel in the preferred source bundle. Exact-source license files
are in `/opt/notesapp-native/THIRD-PARTY-NOTICES.txt`.

## Advisory assessment

| Component | Previous source | Fixed source | Evidence and path assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | --------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| libheif   | 1.23.5          | 1.23.7       | The [1.23.6 release](https://github.com/strukturag/libheif/releases/tag/v1.23.6) and [1.23.7 release](https://github.com/strukturag/libheif/releases/tag/v1.23.7) contain the fixes. The latter fixes further memory and resource defects, including a defect introduced in 1.23.6. The build retains libaom. It disables external plugin loading, examples, libde265 and x265. HEIF input is blocked in the inspection worker before loader selection. This path limit does not replace the library fix. |
| libpng    | 1.6.58          | 1.6.59       | [CVE-2026-46675](https://github.com/pnggroup/libpng/security/advisories/GHSA-qvg3-h654-xq3j) affects 1.6.0 through 1.6.58. It needs a sequential-reader call to `png_read_end` before reading rows. libvips 8.18.7 `libvips/foreign/vipspng.c` does not call `png_read_end`. PNG remains an allowed input. The library is upgraded despite this call-path limit.                                                                                                                                          |
| Expat     | 2.8.5           | 2.10.0       | The [2.10.0 source changelog](https://github.com/libexpat/libexpat/blob/R_2_10_0/expat/Changes) names four new fixes and the two preceding 2.9.0 fixes. Their call paths are assessed below. Public details now replace the earlier incomplete assessment. This is not a claim that all Expat reports are resolved.                                                                                                                                                                                       |

Expat is linked through Fontconfig 2.18.3. Its `src/fcxml.c` creates a fresh
parser for a font configuration, fills an `XML_GetBuffer` allocation with at
most `BUFSIZ` bytes and passes that same count to `XML_ParseBuffer`. It frees
the parser after use. It does not reset parsers or create external-entity
subparsers. The pinned librsvg source uses libxml2 for SVG XML. The image
worker blocks SVG and text loaders. Font configuration is a separate local
configuration path, not a supported image upload format.

| Expat report                                                      | Shipped component and call-path assessment                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CVE-2026-113351](https://github.com/libexpat/libexpat/pull/1431) | The allocation-tracker reset defect affects 2.7.2 through 2.9.0. The old 2.8.5 library matches that range. Fontconfig creates and frees a parser instead of calling `XML_ParserReset`.                                                                    |
| [CVE-2026-115506](https://github.com/libexpat/libexpat/pull/1442) | Entity-expansion protection detects some attacks too late. The general-entity support is compiled in. Fontconfig parses local XML configuration, so this path cannot be declared absent from the library. The fixed code is required.                     |
| [CVE-2026-117610](https://github.com/libexpat/libexpat/pull/1444) | An initial empty, non-final parse on an external-entity subparser can crash. Fontconfig does not create that subparser or install an external-entity handler.                                                                                             |
| [CVE-2026-118370](https://github.com/libexpat/libexpat/pull/1450) | Signed counters in `storeAtts` can overflow on very large attribute counts. Fontconfig XML reaches attribute parsing. A small parse buffer does not prove a bound on the full document, so retain this code-path match until the fixed library is loaded. |
| [CVE-2026-102633](https://github.com/libexpat/libexpat/pull/1392) | A 32-bit allocation arithmetic defect was fixed in 2.9.0. Both supported images are 64-bit. The upgrade also contains that fix.                                                                                                                           |
| [CVE-2026-77214](https://github.com/libexpat/libexpat/pull/1393)  | `XML_ParseBuffer` lacked a capacity check. Fontconfig uses the API, but its count does not exceed the buffer it requested. The upgrade contains the check.                                                                                                |

Node stays at 26.13.0. The official Git comparison contains 26.12.1, the
[October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
No further Node change is needed for that portion of issue 385.

## Evidence required for this candidate

Both native image checks must query the version functions of libheif, libpng,
Expat and libvips. They must find these same library paths in the objects loaded
by Sharp. They check the recorded binary hashes and dynamic link graph. The
image must contain the source-built Sharp add-on and no prebuilt fallback.
The source and notice proof also checks every bundled source hash and the
unchanged Debian runner inventory. Codec tests exercise the actual shipped
child, including supported formats, animation, blocked loaders and the current
40-million-pixel limit. The PR records exact image and test evidence.

A fresh scan of the candidate image is a separate evidence input. A scanner may
not identify custom libraries, bare Node or statically linked components.
Scanner silence does not replace the loaded-library and source proof. Retain
findings and state coverage gaps. Do not suppress version matches to reduce a
finding count.

## Worker and platform scope stays open

The worker still inherits server environment, file and network access. Its
existing time, output and pixel limits do not provide a native memory limit
or a security sandbox. No worker implementation is part of this change.

The local Docker result was a Landlock capability query only. It was not an
allocation, CPU, file, network or process enforcement test. The Railway SSH
session returned UID 0. The guard stopped before any kernel query or boundary
test. No Railway boundary is proved. A later platform decision must approve a
specific non-root candidate and its limited staging proof before that work.
