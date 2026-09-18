import path from "path";

export function getTranscriptsDir(): string {
  return path.join(process.cwd(), "..", "tests", "transcripts");
}

export function isTranscriptFixture(filename: string): boolean {
  return (
    filename.endsWith(".json") &&
    !filename.endsWith(".schema.json") &&
    !filename.endsWith(".stub-updates.json")
  );
}
