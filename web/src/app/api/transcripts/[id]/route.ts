import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getTranscriptsDir } from "@/lib/transcripts-path";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid transcript id" }, { status: 400 });
  }

  const dir = getTranscriptsDir();
  const fixturePath = path.join(dir, `${id}.json`);

  let fixtureRaw: string;
  try {
    fixtureRaw = await readFile(fixturePath, "utf-8");
  } catch {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const fixture = JSON.parse(fixtureRaw);

  let stubUpdates = { triggers: [] as unknown[] };
  const stubPath = path.join(dir, `${id}.stub-updates.json`);
  try {
    const stubRaw = await readFile(stubPath, "utf-8");
    stubUpdates = JSON.parse(stubRaw);
  } catch {
    // optional sidecar
  }

  return NextResponse.json({ fixture, stubUpdates });
}
