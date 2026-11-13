"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders a fixed-size design (`width` px wide) and scales it down to fit the
 * space its parent gives it, never up. Used for the product windows on the
 * landing page, which are drawn at desktop size. Pass `height` when the design
 * has a fixed height; otherwise the height is measured.
 *
 * It stays invisible until measured so the first paint is never an unscaled,
 * clipped window.
 */
export function FitStage({
  width,
  height,
  className = "",
  children,
}: {
  width: number;
  height?: number;
  className?: string;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(height ?? 0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      setScale(Math.min(1, outer.clientWidth / width));
      if (height == null) setMeasuredHeight(inner.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [width, height]);

  const s = scale ?? 1;
  const h = height ?? measuredHeight;

  return (
    <div
      ref={outerRef}
      className={`relative w-full overflow-hidden ${
        scale === null ? "invisible" : ""
      } ${className}`}
      style={{ maxWidth: width, height: h * s }}
    >
      <div
        ref={innerRef}
        className="absolute top-0 left-0 origin-top-left"
        style={{ width, transform: `scale(${s})` }}
      >
        {children}
      </div>
    </div>
  );
}
