# Developer instructions

## WhisperKit bridge (Swift)

The desktop app runs the **release** helper binary at:

```text
tauri-app/whisperkit-helper/.build/release/whisperkit-bridge
```

After **any** change under `tauri-app/whisperkit-helper/` (including `Sources/WhisperkitCore/` and `Sources/WhisperkitBridge/`), rebuild release and restart the app:

```bash
cd tauri-app/whisperkit-helper
swift build -c release --product whisperkit-bridge
swift test
```

Then restart `pnpm tauri dev` (or relaunch the packaged app).

`swift build` without `-c release` only updates the debug binary, which the app does **not** use by default.

Optional debug override:

```bash
export WHISPERKIT_BRIDGE_PATH="$PWD/tauri-app/whisperkit-helper/.build/debug/whisperkit-bridge"
```

## Frontend / Rust tests

```bash
cd tauri-app
pnpm test          # transcript timeline reducer (Vitest)
cd src-tauri && cargo test
```

## Golden / E2E transcription

See [tauri-app/README.md](../tauri-app/README.md#golden-transcript-evaluation).

After bridge changes, rebuild release **before** running `pnpm test:golden:e2e`.
