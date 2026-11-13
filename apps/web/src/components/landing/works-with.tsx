/**
 * Works-with chip: white Google Meet, Zoom and Microsoft Teams marks that sit on
 * the top edge of the hero window. Mirrors "Hero — Logos B · Chip on window" in
 * Paper (page "Landing · Brand colors").
 *
 * Marks: Google Meet and Microsoft Teams from Simple Icons (CC0), the Zoom "Z"
 * from the Iconify "logos" set. All are trademarks of their owners, shown only
 * to say Amie works with them.
 */

const MEET_PATH = "M5.53 2.13 0 7.75h5.53zm.398 0v5.62h7.608v3.65l5.47-4.45c-.014-1.22.031-2.25-.025-3.46-.148-1.09-1.287-1.47-2.236-1.36zM23.1 4.32c-.802.295-1.358.995-2.047 1.49-2.506 2.05-4.982 4.12-7.468 6.19 3.025 2.59 6.04 5.18 9.065 7.76 1.218.671 1.428-.814 1.328-1.64v-13a.828.828 0 0 0-.877-.825zM.038 8.15v7.7h5.53v-7.7zm13.577 8.1H6.008v5.62c3.864-.006 7.737.011 11.58-.009 1.02-.07 1.618-1.12 1.468-2.07v-2.51l-5.47-4.68v3.65zm-13.577 0c.02 1.44-.041 2.88.033 4.31.162.948 1.158 1.43 2.047 1.31h3.464v-5.62z";
const TEAMS_PATH = "M20.625 8.127q-.55 0-1.025-.205-.475-.205-.832-.563-.358-.357-.563-.832Q18 6.053 18 5.502q0-.54.205-1.02t.563-.837q.357-.358.832-.563.474-.205 1.025-.205.54 0 1.02.205t.837.563q.358.357.563.837.205.48.205 1.02 0 .55-.205 1.025-.205.475-.563.832-.357.358-.837.563-.48.205-1.02.205zm0-3.75q-.469 0-.797.328-.328.328-.328.797 0 .469.328.797.328.328.797.328.469 0 .797-.328.328-.328.328-.797 0-.469-.328-.797-.328-.328-.797-.328zM24 10.002v5.578q0 .774-.293 1.46-.293.685-.803 1.194-.51.51-1.195.803-.686.293-1.459.293-.445 0-.908-.105-.463-.106-.85-.329-.293.95-.855 1.729-.563.78-1.319 1.336-.756.557-1.67.861-.914.305-1.898.305-1.148 0-2.162-.398-1.014-.399-1.805-1.102-.79-.703-1.312-1.664t-.674-2.086h-5.8q-.411 0-.704-.293T0 16.881V6.873q0-.41.293-.703t.703-.293h8.59q-.34-.715-.34-1.5 0-.727.275-1.365.276-.639.75-1.114.475-.474 1.114-.75.638-.275 1.365-.275t1.365.275q.639.276 1.114.75.474.475.75 1.114.275.638.275 1.365t-.275 1.365q-.276.639-.75 1.113-.475.475-1.114.75-.638.276-1.365.276-.188 0-.375-.024-.188-.023-.375-.058v1.078h10.875q.469 0 .797.328.328.328.328.797zM12.75 2.373q-.41 0-.78.158-.368.158-.638.434-.27.275-.428.639-.158.363-.158.773 0 .41.158.78.159.368.428.638.27.27.639.428.369.158.779.158.41 0 .773-.158.364-.159.64-.428.274-.27.433-.639.158-.369.158-.779 0-.41-.158-.773-.159-.364-.434-.64-.275-.275-.639-.433-.363-.158-.773-.158zM6.937 9.814h2.25V7.94H2.814v1.875h2.25v6h1.875zm10.313 7.313v-6.75H12v6.504q0 .41-.293.703t-.703.293H8.309q.152.809.556 1.5.405.691.985 1.19.58.497 1.318.779.738.281 1.582.281.926 0 1.746-.352.82-.351 1.436-.966.615-.616.966-1.43.352-.815.352-1.752zm5.25-1.547v-5.203h-3.75v6.855q.305.305.691.452.387.146.809.146.469 0 .879-.176.41-.175.715-.48.304-.305.48-.715t.176-.879Z";
const ZOOM_PATH = "M204.032 207.872H75.008c-8.448 0-16.64-4.608-20.48-12.032c-4.608-8.704-2.816-19.2 4.096-26.112l89.856-89.856H83.968c-17.664 0-32-14.336-32-32h118.784c8.448 0 16.64 4.608 20.48 12.032c4.608 8.704 2.816 19.2-4.096 26.112l-89.6 90.112h74.496c17.664 0 32 14.08 32 31.744";

function MeetMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden>
      <path d={MEET_PATH} fill="#fff" />
    </svg>
  );
}

function ZoomMark() {
  // The Z sits in a 256px box; crop to its bounds so it matches the other marks.
  return (
    <svg viewBox="44 60 168 136" className="h-[18px] w-[22px] shrink-0" aria-hidden>
      <path d={ZOOM_PATH} fill="#fff" />
    </svg>
  );
}

function TeamsMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden>
      <path d={TEAMS_PATH} fill="#fff" />
    </svg>
  );
}

const PLATFORMS = [
  { name: "Google Meet", Mark: MeetMark },
  { name: "Zoom", Mark: ZoomMark },
  { name: "Microsoft Teams", Mark: TeamsMark },
];

export function WorksWith() {
  return (
    <div className="relative z-20 mt-10 flex justify-center px-4 xl:absolute xl:inset-x-0 xl:top-[489px] xl:mt-0 xl:px-0">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-xl py-3 xl:h-11 xl:flex-nowrap xl:gap-5 xl:py-0 bg-raycast-surface px-[22px] shadow-[0_0_0_1px_#FFFFFF24,0_16px_40px_#00000099]">
        <span className="text-[13px] leading-4 text-raycast-mute">Works with</span>
        {PLATFORMS.map(({ name, Mark }) => (
          <div key={name} className="flex items-center gap-5">
            <span className="hidden h-[18px] w-px bg-white/[.14] sm:block" />
            <div className="flex items-center gap-2">
              <Mark />
              <span className="text-sm leading-4 font-medium text-raycast-ink">{name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
