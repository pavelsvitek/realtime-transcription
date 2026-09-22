import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShortMeetingNotice } from "./ShortMeetingNotice";

describe("ShortMeetingNotice", () => {
  it("says a short meeting is not summarized automatically and can be generated later", () => {
    const html = renderToStaticMarkup(
      createElement(ShortMeetingNotice, { onDismiss: () => {} }),
    );
    expect(html).toContain("shorter than 5 minutes");
    expect(html).toContain("will not be summarized automatically");
    expect(html).toContain("generate the summary yourself");
    expect(html).toContain(">OK<");
  });
});
