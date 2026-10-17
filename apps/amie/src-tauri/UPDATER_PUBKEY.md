# Updater public key

`tauri.conf.json` → `plugins.updater.pubkey` holds the real minisign public key used by `tauri-plugin-updater`.

A convenience copy of the same public key lives at the repo root as `app.pub.key`. The config value is the source of truth for the app.

The matching **private** key must never be committed. Store it only as the GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` (plus an encrypted offline backup). Local files such as `app.priv.key` / `*.priv.key` are gitignored.

Losing the private key bricks updates for already-shipped clients until they manually install a build with a new pubkey.

See `apps/amie/README.md` → **Check for Updates**.
