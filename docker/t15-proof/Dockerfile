# syntax=docker/dockerfile:1
FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS compiler
RUN rm /etc/apt/sources.list.d/debian.sources && \
    printf '%s\n' \
    'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261103T000000Z bookworm main' \
    'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261103T000000Z bookworm-security main' \
    > /etc/apt/sources.list && \
    apt-get -o Acquire::http::Timeout=30 -o Acquire::Retries=2 update && \
    apt-get -o Acquire::http::Timeout=30 -o Acquire::Retries=2 install -y --no-install-recommends gcc libc6-dev
COPY docker/t15-proof /src
RUN mkdir /out && cc -std=c11 -O2 -Wall -Wextra -Werror -Wl,-z,relro,-z,now -Wl,--disable-new-dtags,-rpath,/opt/notesapp-native/lib \
    -o /out/native-boundary-proof /src/preflight.c -ldl && \
    cc -std=c11 -O2 -static -Wall -Wextra -Werror \
    -o /out/entrypoint.sh /src/wrapper.c && \
    cc -std=c11 -O2 -static -Wall -Wextra -Werror -o /out/test-active-cap /src/test-active-cap.c && \
    cc --version > /out/compiler.txt
FROM scratch AS test-tools
COPY --from=compiler /out/test-active-cap /test-active-cap

FROM ghcr.io/tidynotebook/tidynotebook@sha256:8c899a0188642f686a1f3c95a11caa45c0ef3ae01902975b6f5b8d7ffa07d642 AS diagnostic
USER root
RUN cp /app/entrypoint.sh /app/entrypoint.sh.original && \
    chown 0:0 /app/entrypoint.sh.original && chmod 0555 /app/entrypoint.sh.original
COPY --from=compiler --chown=0:0 --chmod=0555 /out/native-boundary-proof /opt/notesapp-native/bin/native-boundary-proof
COPY --from=compiler --chown=0:0 --chmod=0555 /out/entrypoint.sh /app/entrypoint.sh
COPY --chown=0:0 --chmod=0444 docker/t15-proof/fixtures /opt/notesapp-native/proof-fixtures
COPY --chown=0:0 --chmod=0444 docker/t15-proof/fixture-manifest.json /opt/notesapp-native/proof-manifest.json
RUN --mount=type=bind,source=docker/t15-proof,target=/proof-src,readonly \
    --mount=type=bind,from=compiler,source=/out,target=/compiler-out,readonly \
    /usr/bin/env -i PATH=/usr/bin:/bin /usr/local/bin/node /proof-src/manifest.mjs && \
    chmod 0555 /opt/notesapp-native/proof-fixtures /opt/notesapp-native/bin
USER 10001:10001
CMD ["/app/entrypoint.sh", "serve"]
