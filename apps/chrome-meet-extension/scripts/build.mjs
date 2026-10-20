/** Google Meet extension speaker-tracking — bundle the unpacked DEV or Store extension. */
import * as esbuild from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist");
const store = process.argv.includes("--store");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = pkg.version;
if (typeof version !== "string" || !version) {
  throw new Error("apps/chrome-meet-extension/package.json is missing version");
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const shared = { bundle: true, target: "chrome120", sourcemap: true };
await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/sw.ts")],
  outfile: join(outdir, "sw.js"),
  format: "esm",
});
await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/content/index.ts")],
  outfile: join(outdir, "content.js"),
  format: "iife",
});
await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/popup.ts")],
  outfile: join(outdir, "popup.js"),
  format: "iife",
});

await copyFile(join(root, "src/popup.html"), join(outdir, "popup.html"));

const matches = ["https://meet.google.com/*"];
if (!store) {
  // Omitted port matches every port. The explicit :47921 entries are the fake Meet page.
  matches.push(
    "http://localhost/*",
    "http://127.0.0.1/*",
    "http://localhost:47921/*",
    "http://127.0.0.1:47921/*",
  );
}

const manifest = {
  manifest_version: 3,
  name: "Amie for Google Meet",
  version,
  description: "Speaks remote Google Meet speaker names to Amie (speaker tracking).",
  background: { service_worker: "sw.js", type: "module" },
  content_scripts: [
    {
      matches,
      js: ["content.js"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  host_permissions: ["http://127.0.0.1/*"],
  permissions: ["storage"],
  action: { default_popup: "popup.html" },
};

await writeFile(join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Amie for Google Meet → ${outdir}${store ? " (store matches)" : " (DEV, includes localhost)"}`);
