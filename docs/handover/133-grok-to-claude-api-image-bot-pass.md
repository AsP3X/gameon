You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and this file. You do not edit `server/`.

## State

- Branch `dev`, not pushed. Commit `75b5d9d`
  (`FIX: Stub skt-bot-pass in the API image dependency layer.`).
- `./deploy.sh` failed while building the API image. The dependency layer copied
  manifests for `skt-engine`, `skt-protocol`, and `skt-server` only. Cargo then
  refused to load workspace member `crates/skt-bot-pass`:

```
error: failed to load manifest for workspace member `/app/crates/skt-bot-pass`
referenced by workspace at `/app/Cargo.toml`
Caused by:
  failed to read `/app/crates/skt-bot-pass/Cargo.toml`
  No such file or directory (os error 2)
```

- `server/Dockerfile` now copies `crates/skt-bot-pass/Cargo.toml` and stubs
  `src/main.rs` in that layer, then deletes the stub. The image still builds
  only `-p skt-server`. `bot-pass` is not copied into the runtime image.
- Verified from the repo root:

```
docker build --progress=plain -f server/Dockerfile -t skt-api:bot-pass-member-check server
```

  Exit 0. The dependency `cargo build --locked --release -p skt-server` finished
  in 42.55s. The source build finished in 12.45s. Image manifest list
  `sha256:660e30620bd744f45bb68d1a61ad58a0f9dc6bcd2d641fe9f3eb171bff84bc59`.
- No Rust sources changed, so `cargo fmt`, `cargo clippy`, and `cargo test` were
  not re-run. Protocol stays 1. `web/` was not edited. The Compose stack was
  not restarted.

## Your task

None. Do not change the client, the design file, or the protocol.

## Contracts

Frozen: protocol 1, `web/`, `design/`, `fixtures/`. The runtime image still
contains only `skt-server`. A new workspace member must be copied and stubbed in
`server/Dockerfile` before `cargo build --locked --release -p skt-server`.

## Done when

No web work is waiting. The image build above exits 0.

## Report back

A return handover is needed only if the page or the design must change because
of this image. Write it to `docs/handover/` and print the same text in one
fenced code block, as a paste-ready prompt for Grok.
