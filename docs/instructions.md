# Developer instructions

## Nemotron bridge (Swift)

The desktop app runs the **release** helper binary at:

```text
apps/amie/nemotron-helper/.build/release/nemotron-bridge
```

After any helper change, rebuild release and restart the app:

```bash
cd apps/amie/nemotron-helper
swift build -c release --product nemotron-bridge
swift test
```

Then restart `pnpm tauri dev` (or relaunch the packaged app).

`swift build` without `-c release` only updates the debug binary, which the app does **not** use by default.

Optional debug override:

```bash
export NEMOTRON_BRIDGE_PATH="$PWD/apps/amie/nemotron-helper/.build/debug/nemotron-bridge"
```

## Frontend / Rust tests

```bash
cd apps/amie
pnpm test          # transcript timeline reducer (Vitest)
cd src-tauri && cargo test
```

## Golden / E2E transcription

See [apps/amie/README.md](../apps/amie/README.md#golden-transcript-evaluation).

After bridge changes, rebuild release **before** running `pnpm test:golden:e2e`.
