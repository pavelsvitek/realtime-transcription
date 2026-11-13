import type { ReactNode } from "react";
import {
  parseSummaryMarkdown,
  type SummaryBlock,
  type SummaryInline,
  type SummaryListItem,
} from "../lib/summary-markdown";
import { cn } from "../lib/cn";

function renderInline(parts: SummaryInline[]): ReactNode[] {
  return parts.map((part, index) => {
    if (part.type === "bold") {
      return <strong key={index}>{part.value}</strong>;
    }
    if (part.type === "italic") {
      return <em key={index}>{part.value}</em>;
    }
    return <span key={index}>{part.value}</span>;
  });
}

function renderItems(items: SummaryListItem[], nested = false): ReactNode {
  return (
    <ul
      className={cn(
        "flex list-disc flex-col gap-3 pl-[18px]",
        nested && "mt-2 list-[circle] gap-2",
      )}
    >
      {items.map((item, index) => (
        <li key={index}>
          {renderInline(item.text)}
          {item.children.length > 0 ? renderItems(item.children, true) : null}
        </li>
      ))}
    </ul>
  );
}

function renderBlock(block: SummaryBlock, index: number): ReactNode {
  switch (block.type) {
    case "h2":
      return (
        <h2 key={index} className="mb-3 text-[16px] font-semibold not-first:mt-7">
          {renderInline(block.text)}
        </h2>
      );
    case "h3":
      return (
        <h3 key={index} className="mt-[22px] mb-2.5 text-[14px] font-semibold">
          {renderInline(block.text)}
        </h3>
      );
    case "list":
      return <div key={index}>{renderItems(block.items)}</div>;
    case "p":
      return (
        <p key={index} className="mb-3">
          {renderInline(block.text)}
        </p>
      );
  }
}

export function SummaryMarkdown({ markdown }: { markdown: string }) {
  const blocks = parseSummaryMarkdown(markdown);
  return (
    <div className="text-[14px] leading-[1.55] text-text-primary">
      {blocks.map(renderBlock)}
    </div>
  );
}
