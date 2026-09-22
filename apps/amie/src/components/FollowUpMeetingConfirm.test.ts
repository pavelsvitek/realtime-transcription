import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FollowUpMeetingConfirm } from "./FollowUpMeetingConfirm";

describe("FollowUpMeetingConfirm", () => {
  it("asks to create a follow-up and says it copies context and summary", () => {
    const html = renderToStaticMarkup(
      createElement(FollowUpMeetingConfirm, {
        onConfirm: () => {},
        onDismiss: () => {},
      }),
    );
    expect(html).toContain("Do you want to create a follow-up meeting?");
    expect(html).toContain("copy the Context and Summary of this meeting");
    expect(html).toContain("into the new meeting");
    expect(html).toContain(">Create follow-up<");
  });
});
