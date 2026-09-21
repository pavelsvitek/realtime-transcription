import { describe, expect, it } from "vitest";
import { parseInline, parseSummaryMarkdown } from "./summary-markdown";

describe("parseInline", () => {
  it("keeps bold and italic spans", () => {
    expect(
      parseInline("Stay on _Halifax_ or join **UBS**")
    ).toEqual([
      { type: "text", value: "Stay on " },
      { type: "italic", value: "Halifax" },
      { type: "text", value: " or join " },
      { type: "bold", value: "UBS" },
    ]);
  });
});

describe("parseSummaryMarkdown", () => {
  it("parses two-part headings and nested bullets", () => {
    const blocks = parseSummaryMarkdown(`## Executive Summary

- **Next step:** **Pavel Svitek** will decide today
- Stay on _Halifax_ for now

## Full Summary

### Strategic Project Allocation

- **Status of Current Work**:
    - **Pavel Svitek** is on _Halifax_
        - The pilot could last six months
`);

    expect(blocks).toEqual([
      { type: "h2", text: [{ type: "text", value: "Executive Summary" }] },
      {
        type: "list",
        items: [
          {
            text: [
              { type: "bold", value: "Next step:" },
              { type: "text", value: " " },
              { type: "bold", value: "Pavel Svitek" },
              { type: "text", value: " will decide today" },
            ],
            children: [],
          },
          {
            text: [
              { type: "text", value: "Stay on " },
              { type: "italic", value: "Halifax" },
              { type: "text", value: " for now" },
            ],
            children: [],
          },
        ],
      },
      { type: "h2", text: [{ type: "text", value: "Full Summary" }] },
      {
        type: "h3",
        text: [{ type: "text", value: "Strategic Project Allocation" }],
      },
      {
        type: "list",
        items: [
          {
            text: [{ type: "bold", value: "Status of Current Work" }, { type: "text", value: ":" }],
            children: [
              {
                text: [
                  { type: "bold", value: "Pavel Svitek" },
                  { type: "text", value: " is on " },
                  { type: "italic", value: "Halifax" },
                ],
                children: [
                  {
                    text: [
                      {
                        type: "text",
                        value: "The pilot could last six months",
                      },
                    ],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("still parses a bullet-only summary", () => {
    const blocks = parseSummaryMarkdown(
      "- **Ship** the API\n- Next steps"
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("list");
    if (blocks[0]?.type !== "list") return;
    expect(blocks[0].items).toHaveLength(2);
  });
});
