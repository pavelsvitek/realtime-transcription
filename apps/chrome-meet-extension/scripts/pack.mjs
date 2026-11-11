/** Google Meet extension speaker-tracking — zip the Store-ready dist/ for Chrome Web Store upload. */
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const release = join(root, "release");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = pkg.version;
if (typeof version !== "string" || !version) {
  throw new Error("apps/chrome-meet-extension/package.json is missing version");
}

const build = spawnSync(process.execPath, [join(root, "scripts/build.mjs"), "--store"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
if (manifest.version !== version) {
  throw new Error(`dist/manifest.json version ${manifest.version} !== package.json ${version}`);
}

const matches = (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []);
const localhostMatches = matches.filter((match) => /localhost|127\.0\.0\.1/.test(match));
if (localhostMatches.length > 0) {
  throw new Error(
    `prod content_scripts still match localhost (use --store): ${localhostMatches.join(", ")}`,
  );
}

const zipName = `amie-for-google-meet-v${version}.zip`;
await mkdir(release, { recursive: true });
const zipPath = join(release, zipName);
await rm(zipPath, { force: true });

const zip = spawnSync("zip", ["-r", "-X", "-q", zipPath, ".", "-x", "*.DS_Store"], {
  cwd: dist,
  encoding: "utf8",
});
if (zip.status !== 0) {
  const py = spawnSync(
    "python3",
    [
      "-c",
      "import os, sys, zipfile\nroot, out = sys.argv[1], sys.argv[2]\nwith zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:\n    for dirpath, _, files in os.walk(root):\n        for name in files:\n            if name == '.DS_Store':\n                continue\n            full = os.path.join(dirpath, name)\n            z.write(full, os.path.relpath(full, root))\n",
      dist,
      zipPath,
    ],
    { encoding: "utf8" },
  );
  if (py.status !== 0) {
    throw new Error((zip.stderr || py.stderr || "failed to zip dist/").trim());
  }
}

console.log(`Amie for Google Meet Store zip → ${zipPath}`);
