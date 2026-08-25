# One Fly VM. Volume /data = pgdata + Restate + MinIO.
FROM rust:1.89-bookworm AS zoend
WORKDIR /src
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      pkg-config protobuf-compiler cmake clang binutils \
    && rm -rf /var/lib/apt/lists/*
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY crates crates
COPY apps/zoend apps/zoend
COPY proto proto
RUN cargo build --locked --release --package zoend \
    && strip --strip-debug target/release/zoend target/release/zoen-effect-dispatcher \
         target/release/zoen-http-connector target/release/zoen-projection

FROM golang:1.25-bookworm AS companion
WORKDIR /src
COPY apps/whatsapp-companion/go.mod apps/whatsapp-companion/go.sum ./
RUN go mod download
COPY apps/whatsapp-companion/ ./
RUN CGO_ENABLED=0 go build -o /zoen-whatsapp-companion ./cmd/zoen-whatsapp-companion

FROM node:22.18.0-bookworm-slim AS speaker
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages/transport packages/transport
COPY packages/speaker packages/speaker
COPY packages/harness packages/harness
COPY packages/ontology packages/ontology
RUN npm ci \
    && npx tsc -p tsconfig.json --pretty false

FROM postgres:18
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      ca-certificates curl supervisor openjdk-21-jre-headless python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=zoend /src/target/release/zoend /usr/local/bin/zoend
COPY --from=zoend /src/target/release/zoen-effect-dispatcher /usr/local/bin/zoen-effect-dispatcher
COPY --from=companion /zoen-whatsapp-companion /usr/local/bin/zoen-whatsapp-companion
COPY --from=speaker /usr/local/bin/node /usr/local/bin/node
COPY --from=speaker /app /app
COPY --from=quay.io/keycloak/keycloak:26.0.7 /opt/keycloak /opt/keycloak

# Restate release tarball name can move; install via their image instead.
COPY --from=docker.restate.dev/restatedev/restate:1.7.2 /usr/local/bin/restate-server /usr/local/bin/restate-server
COPY --from=minio/minio:RELEASE.2025-09-07T16-13-09Z /usr/bin/minio /usr/local/bin/minio
COPY --from=minio/mc:RELEASE.2025-08-13T08-35-41Z /usr/bin/mc /usr/local/bin/mc

COPY deploy/fly/supervisord.conf /etc/supervisor/conf.d/zoen.conf
COPY deploy/fly/zoen-ensure-minio-bucket /usr/local/bin/zoen-ensure-minio-bucket
COPY deploy/fly/zoen-start-keycloak /usr/local/bin/zoen-start-keycloak
COPY deploy/fly/policies.json /etc/zoen/policies.json
COPY deploy/fly/realm.template.json /etc/zoen/realm.template.json
COPY deploy/fly/zoen-remint-agent /usr/local/bin/zoen-remint-agent
COPY deploy/fly/bind-inbox.sh /usr/local/bin/zoen-bind-inbox
COPY packages/ontology/fixtures/commercial.zoen.ts /etc/zoen/commercial.zoen.ts
COPY packages/ontology/fixtures/personal.zoen.ts /etc/zoen/personal.zoen.ts
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
