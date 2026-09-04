"use client";
import type { TrustLevel } from "@/lib/score";

// Badge backgrounds stay the frozen level colors (VAL-WEB-010 asserts the
// bg-* classes). Text colors are chosen per level so the pair passes WCAG AA
// (>=4.5:1) in BOTH themes — white-on-yellow and white-on-green fail, so
// safe/caution use near-black text while risky keeps white:
//   safe    #16a34a on #09090b -> ~6.4:1
//   caution #eab308 on #09090b -> ~11:1
//   risky   #ffffff on #dc2626 -> ~4.8:1
const STYLES: Record<TrustLevel, string> = {
  safe: "bg-green-600 text-zinc-950",
  caution: "bg-yellow-500 text-zinc-950",
  risky: "bg-red-600 text-white",
};

export function TrustBadge({
  trust,
  level,
}: {
  trust: number;
  level: TrustLevel;
}) {
  return (
    <div
      role="status"
      aria-label={`Trust level ${level}, score ${trust} of 100`}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ${STYLES[level]}`}
    >
      <span className="text-sm font-bold" aria-hidden="true">
        {level.toUpperCase()}
      </span>
      <span className="text-sm" aria-hidden="true">
        {trust}/100
      </span>
    </div>
  );
}
