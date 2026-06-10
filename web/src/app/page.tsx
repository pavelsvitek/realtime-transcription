import { SessionHeader } from "@/components/session/session-header";
import { SuggestionCard } from "@/components/session/suggestion-card";
import { TranscriptPanel } from "@/components/session/transcript-panel";
import {
  MOCK_CARDS,
  MOCK_TRANSCRIPT,
  SESSION_MODE,
} from "@/lib/mock-session";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col bg-stone-100 text-stone-900">
      <SessionHeader mode={SESSION_MODE} elapsed="09:52" />

      <div className="flex min-h-0 flex-1">
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:grid-rows-2">
          {MOCK_CARDS.map((card) => (
            <SuggestionCard key={card.id} card={card} />
          ))}
        </main>

        <div className="hidden w-[28%] min-w-[280px] max-w-[420px] shrink-0 lg:flex">
          <TranscriptPanel segments={MOCK_TRANSCRIPT} />
        </div>
      </div>
    </div>
  );
}
