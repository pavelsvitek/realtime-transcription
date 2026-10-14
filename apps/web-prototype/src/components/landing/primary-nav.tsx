import Image from "next/image";

export function PrimaryNav() {
  return (
    <nav className="relative z-20 flex h-14 w-full shrink-0 items-center justify-between border-b border-raycast-hairline-soft px-12">
      <a href="#top" className="flex items-center gap-2.5">
        <Image
          src="/amie-icon.png"
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-md"
        />
        <span className="text-base leading-[22px] font-semibold text-raycast-ink">
          Amie
        </span>
      </a>
      <div className="flex items-center gap-7">
        <a
          href="#word-by-word"
          className="text-base leading-[22px] font-medium tracking-[0.014em] text-raycast-body"
        >
          How it works
        </a>
        <a
          href="#local-mcp"
          className="text-base leading-[22px] font-medium tracking-[0.014em] text-raycast-body"
        >
          Privacy
        </a>
        <a
          href="#download"
          className="flex h-9 items-center justify-center rounded-md bg-raycast-primary px-4 text-base leading-[22px] font-semibold tracking-[0.014em] text-raycast-on-primary"
        >
          Download
        </a>
      </div>
    </nav>
  );
}
