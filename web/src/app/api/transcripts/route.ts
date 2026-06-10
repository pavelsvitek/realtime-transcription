import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getTranscriptsDir, isTranscriptFixture } from "@/lib/transcripts-path";

export async function GET() {
  const dir = getTranscriptsDir();
  const files = await readdir(dir);
  const items = [];

  for (const file of files) {
    if (!isTranscriptFixture(file)) continue;

    const id = path.basename(file, ".json");
    const raw = await readFile(path.join(dir, file), "utf-8");
    const fixture = JSON.parse(raw) as {
      meta: { title: string; duration_ms: number };
    };

    items.push({
      id,
      title: fixture.meta.title,
      durationMs: fixture.meta.duration_ms,
    });
  }

  items.sort((a, b) => a.title.localeCompare(b.title));
  return NextResponse.json(items);
}
