# Local native boundary diagnostic

This build adds a diagnostic command to the fixed v0.23.5 image. It does not
change the production worker. It has no publication or platform approval.

Build `docker/t15-proof/Dockerfile` on the native architecture. Use a separate
Docker builder so its cache can be removed without a change to other work.
The fixture files are fixed synthetic inputs. `fixtures.mjs` records how they
were made with the native runtime from the saved release artifact. The base
receipt binds that artifact to the selected source, index, and native children.
Do not use emulation as native evidence.

The static wrapper accepts only `serve`. It gives the probe a fixed environment,
closes inherited handles, bounds its report to 64 KiB and two minutes, and reaps
its process group. It starts the saved original script only after the full
probe returns its exact success record. It keeps the app environment for that
script. Other commands return 77. Thus this diagnostic image cannot run the
base image's default migrate command or its explicit migration command.

The probe checks identity and capabilities before file access or ABI queries.
It initializes trusted libraries with one native thread. It checks library and
fixture hashes against the image manifest. Each worker keeps only a read-only
input descriptor and result pipes. It sets hard and soft address space and CPU
limits, no-new-privileges, and no core dumps before the policies. It has no
unrestricted worker fallback. File controls use a private temporary directory.
Socket controls never send a network request. Process controls use only the
supervisor, signal 0, invalid requests, and zero-length memory operations.

The valid-input checks use the buffer loaders for PNG, JPEG, GIF, and WebP.
They check native header inspection, including animation totals. They do not
prove pixel conversion or replace the production worker's file loader tests.
Resource tests report the actual wait status and cause of each termination.
An output test deliberately exceeds its child pipe limit. The parent drains
and kills that child. It does not copy that output to the report.

Run `python3 docker/t15-proof/test-local.py IMAGE_ID EVIDENCE_DIRECTORY ACTIVE_CAP_HELPER` after
the local image is built. The tests use disposable containers with no network,
no capabilities, a read-only root, and a private temporary filesystem. No app
or database deployment is needed for this diagnostic. There is no changed
screen and no screenshot gate. Keep source review, image publication, and
platform approval as separate decisions. Native arm64 proof requires an arm64
machine. A local amd64 result does not prove Railway enforcement.

The test-tools build target exports the static active-capability refusal helper.
It is absent from the candidate. Its test starts as container root with only
the four named capabilities. It changes only its own identity and capabilities,
then executes the fixed probe as UID/GID 10001 with an active capability. The
probe must refuse before any ABI query or boundary test. No root boundary test
is run. Wrapper stub tests are separate from the actual native suite.
