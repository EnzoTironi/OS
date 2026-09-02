# One Fly VM. Volume /data = pgdata + Restate + MinIO.
FROM rust:1.98-bookworm AS zoend
WORKDIR /src
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      pkg-config protobuf-compiler cmake clang binutils \
    && rm -rf /var/lib/apt/lists/*
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY crates crates
COPY apps/zoend apps/zoend
COPY proto proto
COPY wit wit
RUN cargo build --locked --release --package zoend \
      --bin zoen \
      --bin zoen-effect-dispatcher \
      --bin zoen-http-connector \
      --bin zoen-projection \
    && strip --strip-debug \
      target/release/zoen \
      target/release/zoen-effect-dispatcher \
      target/release/zoen-http-connector \
      target/release/zoen-projection

FROM node:22.18.0-bookworm-slim AS auth
WORKDIR /auth
COPY apps/auth/package.json apps/auth/package-lock.json ./
RUN npm ci
COPY apps/auth/src ./src
COPY apps/auth/tsconfig.json ./

FROM node:22.18.0-bookworm-slim AS personal-lake
WORKDIR /app
ARG ZOEN_BUILD_REVISION
COPY package.json package-lock.json tsconfig.json ./
COPY gen/connect gen/connect
COPY testdata/lakes testdata/lakes
COPY apps/zoend/effect-handler apps/zoend/effect-handler
COPY apps/zoend/effect-registrar apps/zoend/effect-registrar
COPY deploy/fly/tsconfig.personal-lake.json deploy/fly/tsconfig.personal-lake.json
COPY deploy/fly/tsconfig.ontology-runtime.json deploy/fly/tsconfig.ontology-runtime.json
COPY deploy/fly/ensure-personal-lake.ts deploy/fly/ensure-personal-lake.ts
RUN npm ci \
    && npx tsc -p deploy/fly/tsconfig.personal-lake.json --pretty false \
    && npx tsc -p deploy/fly/tsconfig.ontology-runtime.json --pretty false \
    && test -n "${ZOEN_BUILD_REVISION}" \
    && node /app/apps/zoend/effect-handler/write-build-artifact.mjs \
      "${ZOEN_BUILD_REVISION}" \
      /app/dist/apps/zoend/effect-handler

FROM node:24.20.0-bookworm-slim AS conversation
WORKDIR /conversation
COPY apps/conversation/package.json apps/conversation/package-lock.json ./
RUN npm ci
COPY apps/conversation/ ./
ENV ZOEN_MODEL=openai-compatible/hy3-free
RUN node ./node_modules/eve/bin/eve.js build

FROM postgres:18
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      ca-certificates curl supervisor python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=zoend /src/target/release/zoen /usr/local/bin/zoen
COPY --from=zoend /src/target/release/zoen-effect-dispatcher /usr/local/bin/zoen-effect-dispatcher
COPY --from=zoend /src/target/release/zoen-http-connector /usr/local/bin/zoen-http-connector
COPY --from=zoend /src/target/release/zoen-projection /usr/local/bin/zoen-projection
COPY --from=personal-lake /usr/local/bin/node /usr/local/bin/node
COPY --from=personal-lake /app /app
COPY --from=auth /auth /auth
COPY --from=conversation /usr/local/bin/node /usr/local/node24/bin/node
COPY --from=conversation /conversation /conversation
COPY deploy/fly/zoen-start-eve /usr/local/bin/zoen-start-eve

# Restate release tarball name can move; install via their image instead.
COPY --from=docker.restate.dev/restatedev/restate:1.7.2 /usr/local/bin/restate-server /usr/local/bin/restate-server
COPY --from=minio/minio:RELEASE.2025-09-07T16-13-09Z /usr/bin/minio /usr/local/bin/minio
COPY --from=minio/mc:RELEASE.2025-08-13T08-35-41Z /usr/bin/mc /usr/local/bin/mc

COPY deploy/fly/supervisord.conf /etc/supervisor/conf.d/zoen.conf
COPY deploy/fly/zoen-ensure-minio-bucket /usr/local/bin/zoen-ensure-minio-bucket
COPY deploy/fly/zoen-wait-for-pg /usr/local/bin/zoen-wait-for-pg
COPY deploy/fly/zoen-start-projection /usr/local/bin/zoen-start-projection
COPY deploy/fly/zoen-start-restate /usr/local/bin/zoen-start-restate
COPY deploy/fly/policies.json /etc/zoen/policies.json
COPY deploy/fly/zoen-remint-agent /usr/local/bin/zoen-remint-agent
COPY deploy/fly/zoen-ensure-agent-binding /usr/local/bin/zoen-ensure-agent-binding
COPY deploy/fly/zoen-ensure-personal-lake /usr/local/bin/zoen-ensure-personal-lake
COPY deploy/fly/zoen-ensure-effect-workload-credential /usr/local/bin/zoen-ensure-effect-workload-credential
COPY deploy/fly/zoen-register-effects /usr/local/bin/zoen-register-effects
COPY deploy/fly/zoen-start-effect-dispatcher /usr/local/bin/zoen-start-effect-dispatcher
COPY deploy/fly/zoen-start-effect-handler /usr/local/bin/zoen-start-effect-handler
COPY deploy/fly/zoen-start-http-connector /usr/local/bin/zoen-start-http-connector
COPY deploy/fly/zoen-start-auth /usr/local/bin/zoen-start-auth
COPY deploy/fly/bind-inbox.sh /usr/local/bin/zoen-bind-inbox
COPY testdata/lakes/commercial.canonical.json /etc/zoen/commercial.canonical.json
COPY testdata/lakes/personal.canonical.json /etc/zoen/personal.canonical.json
COPY deploy/fly/init /docker-entrypoint-initdb.d

ENV PGDATA=/data/pg
ENV RESTATE_BASE_DIR=/data/restate
ENV MINIO_ROOT_USER=zoenminio
ENV POSTGRES_DB=zoen
ENV POSTGRES_USER=postgres
ENV ZOEN_LISTEN_ADDR=0.0.0.0:58701
ENV ZOEN_CEDAR_POLICY_MANIFEST=/etc/zoen/policies.json

EXPOSE 58701
CMD ["/usr/bin/supervisord", "-n"]
