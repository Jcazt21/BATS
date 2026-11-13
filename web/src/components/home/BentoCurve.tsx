import { useMemo, useState, type CSSProperties } from "react";
import "./BentoCurve.css";

export interface CurvePoint { label: string; value: number }

const W = 100;
const H = 40;
const TOP = 3;
const BOTTOM = 1;

/** Curva suave que no sobrepasa los datos (interpolación monótona cúbica) en un viewBox de 100×40. */
function trazo(values: number[]) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const pts = values.map((v, i) => [
    values.length === 1 ? W / 2 : (i / (values.length - 1)) * W,
    TOP + (1 - (v - low) / range) * (H - TOP - BOTTOM),
  ]);
  if (pts.length === 1) return { pts, line: `M0,${pts[0][1]} L${W},${pts[0][1]}`, area: `M0,${pts[0][1]} L${W},${pts[0][1]} L${W},${H} L0,${H} Z` };
  const slopes = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / (p[0] - pts[i][0]));
  const tan = pts.map((_, i) => (i === 0 ? slopes[0] : i === pts.length - 1 ? slopes[i - 1] : slopes[i - 1] * slopes[i] > 0 ? (slopes[i - 1] + slopes[i]) / 2 : 0));
  slopes.forEach((m, i) => {
    if (m === 0) { tan[i] = 0; tan[i + 1] = 0; return; }
    const a = tan[i] / m, b = tan[i + 1] / m, l = a * a + b * b;
    if (l > 9) { const k = 3 / Math.sqrt(l); tan[i] = k * a * m; tan[i + 1] = k * b * m; }
  });
  let line = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], t = (x1 - x0) / 3;
    line += ` C${(x0 + t).toFixed(2)},${(y0 + tan[i] * t).toFixed(2)} ${(x1 - t).toFixed(2)},${(y1 - tan[i + 1] * t).toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return { pts, line, area: `${line} L${W},${H} L0,${H} Z` };
}

/**
 * Cifra grande + curva de área con el acento del mes. Al pasar el cursor (o el dedo) por la curva,
 * la cifra y la nota pasan a ser las de ese punto. Sin puntos, un texto en su lugar.
 */
export function BentoCurve({ value, note, points, empty, ariaLabel }: {
  value: string; note: string; points: CurvePoint[]; empty: string; ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shape = useMemo(() => (points.length ? trazo(points.map((p) => p.value)) : null), [points]);
  const sel = hover === null ? null : points[hover];

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
    setHover(Math.round(x * (points.length - 1)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="img" aria-label={`${ariaLabel}: ${points.length ? `${points[points.length - 1].value} al ${points[points.length - 1].label}` : "sin datos"}`}>
      <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
        <span className="font-card-mono text-[26px] font-medium leading-none tabular">{sel ? sel.value : value}</span>
        <span className="min-w-0 truncate text-footnote text-muted-foreground">{sel ? sel.label : note}</span>
      </div>
      {!shape ? (
        <p className="mt-4 text-footnote text-muted-foreground">{empty}</p>
      ) : (
        <div className="relative mt-4 min-h-[72px] flex-1 touch-pan-y" onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
            <path className="bento-curve-area" d={shape.area} fill="color-mix(in oklch, var(--primary) 16%, transparent)" />
            <path className="bento-curve-line" d={shape.line} pathLength={1} fill="none" stroke="var(--primary)" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {hover !== null && (
            <>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-primary/35" style={{ left: `${(shape.pts[hover][0] / W) * 100}%` }} />
              <span aria-hidden="true" className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-[3px] ring-card"
                style={{ left: `${(shape.pts[hover][0] / W) * 100}%`, top: `${(shape.pts[hover][1] / H) * 100}%` } as CSSProperties} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
