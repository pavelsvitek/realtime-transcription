export type SummaryInline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string };

export type SummaryListItem = {
  text: SummaryInline[];
  children: SummaryListItem[];
};

export type SummaryBlock =
  | { type: "h2"; text: SummaryInline[] }
  | { type: "h3"; text: SummaryInline[] }
  | { type: "list"; items: SummaryListItem[] }
  | { type: "p"; text: SummaryInline[] };

const BULLET_RE = /^(\s*)[-*•]\s+(.*)$/;

export function parseInline(text: string): SummaryInline[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_\n]+_)/g).filter((part) => part.length > 0);
  return parts.map((part) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return { type: "bold", value: bold[1] ?? "" };
    }
    const italic = part.match(/^_([^_]+)_$/);
    if (italic) {
      return { type: "italic", value: italic[1] ?? "" };
    }
    return { type: "text", value: part };
  });
}

function parseBullet(line: string): { indent: number; text: string } | null {
  const match = line.match(BULLET_RE);
  if (!match) return null;
  return {
    indent: match[1]?.length ?? 0,
    text: match[2] ?? "",
  };
}

function parseList(
  lines: string[],
  start: number,
): { items: SummaryListItem[]; next: number } {
  const roots: SummaryListItem[] = [];
  const stack: { indent: number; items: SummaryListItem[] }[] = [
    { indent: -1, items: roots },
  ];

  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      const nextLine = lines[i + 1] ?? "";
      if (parseBullet(nextLine)) {
        i += 1;
        continue;
      }
      break;
    }

    const bullet = parseBullet(line);
    if (!bullet) break;

    const item: SummaryListItem = {
      text: parseInline(bullet.text),
      children: [],
    };

    while (stack.length > 1 && bullet.indent <= (stack[stack.length - 1]?.indent ?? -1)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    parent?.items.push(item);
    stack.push({ indent: bullet.indent, items: item.children });
    i += 1;
  }

  return { items: roots, next: i };
}

export function parseSummaryMarkdown(src: string): SummaryBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: SummaryBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      i += 1;
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      blocks.push({ type: "h3", text: parseInline(h3[1] ?? "") });
      i += 1;
      continue;
    }

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      blocks.push({ type: "h2", text: parseInline(h2[1] ?? "") });
      i += 1;
      continue;
    }

    if (parseBullet(line)) {
      const { items, next } = parseList(lines, i);
      if (items.length > 0) {
        blocks.push({ type: "list", items });
      }
      i = next;
      continue;
    }

    blocks.push({ type: "p", text: parseInline(line.trim()) });
    i += 1;
  }

  return blocks;
}
