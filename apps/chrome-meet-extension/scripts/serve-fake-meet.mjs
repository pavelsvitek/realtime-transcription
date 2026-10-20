/** Google Meet extension speaker-tracking — static fake Meet page for DEV. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "fake-meet/index.html"));
const port = 47921;
const meetingPath = "/abc-defg-hij";

createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname === "/") {
    response.writeHead(302, { location: meetingPath });
    response.end();
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(`Fake Google Meet: http://127.0.0.1:${port}${meetingPath}`);
});
