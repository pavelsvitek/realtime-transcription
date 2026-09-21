import type { ReactNode } from "react";
import {
  parseSummaryMarkdown,
  type SummaryBlock,
  type SummaryInline,
  type SummaryListItem,
} from "../lib/summary-markdown";

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

function renderItems(items: SummaryListItem[]): ReactNode {
  return (
    <ul className="meeting-summary-list">
      {items.map((item, index) => (
        <li key={index}>
          {renderInline(item.text)}
          {item.children.length > 0 ? renderItems(item.children) : null}
        </li>
      ))}
    </ul>
  );
}

function renderBlock(block: SummaryBlock, index: number): ReactNode {
  switch (block.type) {
    case "h2":
      return (
        <h2 key={index} className="meeting-summary-heading">
          {renderInline(block.text)}
        </h2>
      );
    case "h3":
      return (
        <h3 key={index} className="meeting-summary-subheading">
          {renderInline(block.text)}
        </h3>
      );
    case "list":
      return <div key={index}>{renderItems(block.items)}</div>;
    case "p":
      return (
        <p key={index} className="meeting-summary-paragraph">
          {renderInline(block.text)}
        </p>
      );
  }
}

export function SummaryMarkdown({ markdown }: { markdown: string }) {
  const blocks = parseSummaryMarkdown(markdown);
  return <div className="meeting-summary">{blocks.map(renderBlock)}</div>;
}
