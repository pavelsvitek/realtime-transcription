import { forwardRef } from "react";
import {
  LiveMeetingButton,
  type LiveMeetingButtonProps,
} from "./LiveMeetingButton";

/** Idle confirm CTA. Live start/listen uses `LiveMeetingButton`. */
export const StartMeetingButton = forwardRef<
  HTMLButtonElement,
  Pick<LiveMeetingButtonProps, "onClick" | "disabled" | "className">
>(function StartMeetingButton(props, ref) {
  return <LiveMeetingButton ref={ref} {...props} />;
});
