import { useState } from "react";
import { cn } from "@/lib/utils";
import "./BentoBars.css";

export interface BarDatum { label: string; value: number; text: string }

/**
 * Cifra grande + barras (una por dato). La más alta va con el acento del mes; al pasar el cursor
 * o enfocar una barra, la cifra cambia por la de esa barra. Sin datos, un texto en su lugar.
 */
export function BentoBars({ value, note, bars, empty, ariaLabel }: {
  value: string; note: string; bars: BarDatum[]; empty: string; ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peak = bars.length ? bars.reduce((m, b, i) => (b.value > bars[m].value ? i : m), 0) : -1;
  const sel = hover === null ? null : bars[hover];

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="img" aria-label={`${ariaLabel}: ${bars.map((b) => `${b.label} ${b.text}`).join(", ") || "sin datos"}`}>
      <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
        <span className="font-card-mono text-[26px] font-medium leading-none tabular">{sel ? sel.text : value}</span>
        <span className="min-w-0 truncate text-footnote text-muted-foreground">{sel ? sel.label : note}</span>
      </div>
      {bars.length === 0 ? (
        <p className="mt-4 text-footnote text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-4 flex min-h-[72px] flex-1 items-end gap-1.5" onPointerLeave={() => setHover(null)}>
          {bars.map((b, i) => (
            <span
              key={`${b.label}-${i}`}
              aria-hidden="true"
              onPointerEnter={() => setHover(i)}
              className={cn("bento-bar min-h-1 flex-1 rounded-t-md rounded-b-sm transition-colors duration-150",
                i === peak ? "bg-primary" : "bg-secondary hover:bg-primary/40")}
              style={{ height: `${(b.value / max) * 100}%`, "--i": i } as React.CSSProperties}
            />
          ))}
        </div>
      )}
    </div>
  );
}
