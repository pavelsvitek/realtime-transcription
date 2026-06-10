import type { TranscriptSegment } from "@/lib/mock-session";

type TranscriptPanelProps = {
  segments: TranscriptSegment[];
};

export function TranscriptPanel({ segments }: TranscriptPanelProps) {
  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-stone-200 bg-stone-50/50">
      <header className="border-b border-stone-200 px-4 py-3">
        <h2 className="text-sm font-medium text-stone-800">Transcript</h2>
        <p className="mt-0.5 text-xs text-stone-500">Supporting context</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ol className="space-y-4">
          {segments.map((segment) => (
            <li key={segment.id} className="text-sm">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-medium text-stone-800">{segment.speaker}</span>
                <span className="text-xs text-stone-400">{segment.time}</span>
              </div>
              <p className="leading-relaxed text-stone-600">{segment.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
