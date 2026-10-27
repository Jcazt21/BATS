import { cn } from "@/lib/utils";
import { hueIndex, initials } from "@/lib/format";

const TONES = [
  "bg-chart-1/15 text-foreground", "bg-chart-2/15 text-chart-2", "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4", "bg-chart-5/15 text-chart-5", "bg-chart-6/15 text-chart-6",
];

/** Avatar con iniciales y un tono estable por nombre. */
export function PlayerAvatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-footnote font-semibold", TONES[hueIndex(name)], className)}
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}
