# PLACEHOLDER — replace before first Release

`tauri.conf.json` → `plugins.updater.pubkey` is a **placeholder** minisign public key.

The matching private key was generated once to produce a valid config string and then **destroyed**. It was never committed and must not be reconstructed from this tree.

Before any client can trust a GitHub Release update artifact:

1. Run `pnpm tauri signer generate -w ~/.tauri/amie.key` (from `apps/amie`).
2. Replace `plugins.updater.pubkey` with the new **public** key contents.
3. Store the private key only as GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` (+ encrypted offline backup).

See `apps/amie/README.md` → **Check for Updates**.
