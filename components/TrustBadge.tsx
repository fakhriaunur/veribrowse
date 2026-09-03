"use client";
import type { TrustLevel } from "@/lib/score";

export function TrustBadge({
  trust,
  level,
}: {
  trust: number;
  level: TrustLevel;
}) {
  const color =
    level === "safe"
      ? "bg-green-600"
      : level === "caution"
        ? "bg-yellow-500"
        : "bg-red-600";
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-white ${color}`}
    >
      <span className="text-sm font-bold">{level.toUpperCase()}</span>
      <span className="text-sm">{trust}/100</span>
    </div>
  );
}
