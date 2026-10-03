import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Fixtures live at `<repo>/tests/transcripts`. Next may start with cwd at
 * `apps/web`, `apps/`, or the repo root depending on how `pnpm` launches it.
 */
export function getTranscriptsDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "tests", "transcripts");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return path.join(process.cwd(), "..", "..", "tests", "transcripts");
}

export function isTranscriptFixture(filename: string): boolean {
  return (
    filename.endsWith(".json") &&
    !filename.endsWith(".schema.json") &&
    !filename.endsWith(".stub-updates.json")
  );
}
