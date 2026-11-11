/** Google Meet extension speaker-tracking — unit tests for the Meet meter detector. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
