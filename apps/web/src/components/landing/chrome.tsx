import Image from "next/image";
import { ListeningEq } from "./mark";
import { cn } from "@/lib/utils";

export function MacTrafficLights({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-[7px]", className)} aria-hidden>
      <span className="size-[12px] rounded-full bg-[#ff5f57]" />
      <span className="size-[12px] rounded-full bg-[#febc2e]" />
      <span className="size-[12px] rounded-full bg-[#28c840]" />
    </div>
  );
}

export function MenuBarPill({ listening }: { listening: boolean }) {
  return (
    <div className="amie-menubar-pill" aria-hidden>
      <Image
        src="/landing/amie-icon.png"
        alt=""
        width={16}
        height={16}
        className="size-4 rounded-[4px]"
      />
      <span>Amie</span>
      {listening ? (
        <>
          <ListeningEq className="text-[#e27888]" />
          <span className="text-[#e27888]">Listening</span>
        </>
      ) : (
        <span className="text-zinc-400">Ready · ⌘N</span>
      )}
    </div>
  );
}
