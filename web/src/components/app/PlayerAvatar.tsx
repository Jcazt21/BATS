import { trainerPath } from "@/lib/api";
import { cn } from "@/lib/utils";
import { hueIndex, initials } from "@/lib/format";

const TONES = [
  "bg-chart-1/15 text-foreground", "bg-chart-2/15 text-chart-2", "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4", "bg-chart-5/15 text-chart-5", "bg-chart-6/15 text-chart-6",
];

/** Avatar con iniciales y un tono estable por nombre; con `trainer` (id de sprite de Showdown) muestra ese sprite. */
export function PlayerAvatar({ name, size = 36, trainer, className }: { name: string; size?: number; trainer?: string | null; className?: string }) {
  if (trainer) {
    return (
      <img
        src={trainerPath(trainer)}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full bg-muted object-cover object-top [image-rendering:pixelated]", className)}
        style={{ width: size, height: size }}
      />
    );
  }
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
