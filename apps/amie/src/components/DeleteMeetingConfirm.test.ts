import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeleteMeetingConfirm } from "./DeleteMeetingConfirm";

describe("DeleteMeetingConfirm", () => {
  it("asks to delete permanently and warns it cannot be undone", () => {
    const html = renderToStaticMarkup(
      createElement(DeleteMeetingConfirm, {
        onConfirm: () => {},
        onDismiss: () => {},
      }),
    );
    expect(html).toContain("Delete this meeting permanently?");
    expect(html).toContain("cannot be undone");
    expect(html).toContain("archive instead");
    expect(html).toContain(">Delete<");
  });
});
