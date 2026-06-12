# Competition Research

Notes on competing products in the live meeting / transcription / AI copilot space. Findings are based on installed macOS app bundle inspection and public product documentation.

| App | Framework | Doc |
| --- | --- | --- |
| Hedy | Flutter (macOS) | [hedy.md](./hedy.md) |
| Jamie | Tauri 2 + Next.js | [jamie.md](./jamie.md) |

## Methodology

For each app we inspect:

1. **App bundle** — `Info.plist`, `Contents/Frameworks/`, `Contents/MacOS/`, embedded assets
2. **Binary analysis** — `file`, `otool -L`, `strings` for framework signatures and module names
3. **Public docs** — product site, pricing, and feature claims (cross-checked against bundle evidence where possible)

Investigation dates: June 2026. Installed versions reflect what was on the local machine at time of analysis.
