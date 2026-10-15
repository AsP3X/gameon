# Release build of skt-server. The runtime image has no toolchain and no shell secrets.

FROM rust:1-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates/skt-engine/Cargo.toml crates/skt-engine/Cargo.toml
COPY crates/skt-protocol/Cargo.toml crates/skt-protocol/Cargo.toml
COPY crates/skt-server/Cargo.toml crates/skt-server/Cargo.toml
COPY crates/skt-bot-pass/Cargo.toml crates/skt-bot-pass/Cargo.toml
COPY crates/ocho-engine/Cargo.toml crates/ocho-engine/Cargo.toml
COPY crates/ocho-server/Cargo.toml crates/ocho-server/Cargo.toml

# Compile dependencies before the real sources, so a source-only change keeps this layer.
# Cargo loads every workspace member before it builds one package. Stub each member
# here. skt-bot-pass is a terminal binary and is not part of this image.
RUN mkdir -p crates/skt-engine/src crates/skt-protocol/src crates/skt-server/src crates/skt-bot-pass/src \
        crates/ocho-engine/src crates/ocho-server/src \
    && echo 'fn main() {}' > crates/skt-server/src/main.rs \
    && echo 'fn main() {}' > crates/skt-server/src/game_main.rs \
    && echo 'fn main() {}' > crates/skt-bot-pass/src/main.rs \
    && echo 'fn main() {}' > crates/ocho-server/src/main.rs \
    && echo '' > crates/skt-engine/src/lib.rs \
    && echo '' > crates/skt-protocol/src/lib.rs \
    && echo '' > crates/skt-server/src/lib.rs \
    && echo '' > crates/ocho-engine/src/lib.rs \
    && cargo build --locked --release -p skt-server --bin skt-server \
    && rm -rf crates/skt-engine/src crates/skt-protocol/src crates/skt-server/src crates/skt-bot-pass/src \
        crates/ocho-engine/src crates/ocho-server/src

COPY crates crates
# sqlx::migrate! embeds these files at compile time. The path in store.rs is
# relative to crates/skt-server, which resolves to /app/migrations/postgres.
COPY migrations migrations

# The dependency layer is newer than these sources, so cargo would keep the empty crates.
RUN find crates -name '*.rs' -exec touch {} + \
    && cargo build --locked --release -p skt-server --bin skt-server

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home skt

COPY --from=builder /app/target/release/skt-server /usr/local/bin/skt-server

USER skt

ENV HOST=0.0.0.0
ENV PORT=8080
ENV RUST_LOG=info

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
    CMD curl -fsS http://127.0.0.1:8080/api/v1/health >/dev/null || exit 1

CMD ["skt-server"]
