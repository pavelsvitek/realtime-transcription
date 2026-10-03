import { BEATS } from "./copy";
import { cn } from "@/lib/utils";

export function Beats({
  className,
  numbered = false,
}: {
  className?: string;
  numbered?: boolean;
}) {
  return (
    <ol
      className={cn(
        "grid gap-8 sm:grid-cols-3",
        className,
      )}
    >
      {BEATS.map((beat, index) => (
        <li key={beat.key} className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-amie uppercase">
            {numbered ? `0${index + 1}  ${beat.title}` : beat.title}
          </p>
          <p className="text-[15px] leading-6 text-[color:var(--amie-ink)]">
            {beat.body}
          </p>
        </li>
      ))}
    </ol>
  );
}
