import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArchiveMeetingConfirm } from "./ArchiveMeetingConfirm";

describe("ArchiveMeetingConfirm", () => {
  it("asks to archive and explains the meeting leaves the list without deleting", () => {
    const html = renderToStaticMarkup(
      createElement(ArchiveMeetingConfirm, {
        onConfirm: () => {},
        onDismiss: () => {},
      }),
    );
    expect(html).toContain("Archive this meeting?");
    expect(html).toContain("leave your Meetings list");
    expect(html).toContain("nothing is deleted");
    expect(html).toContain(">Archive<");
  });
});
