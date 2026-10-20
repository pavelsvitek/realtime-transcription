/** Google Meet extension speaker-tracking — static fake Meet page for DEV. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "fake-meet/index.html"));
const port = 47921;

createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(`Fake Google Meet: http://127.0.0.1:${port}/abc-defg-hij`);
});
