/** Anillo de progreso de la Pokédex: se llena según descubiertos / total, con la cifra en el centro. */
export function ProgressRing({ discovered, total, size = 132 }: { discovered: number; total: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.min(discovered / total, 1) : 0;
  return (
    <div
      role="img"
      aria-label={`${discovered} de ${total} descubiertos`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)}
          className="stroke-primary transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-tight">
        <span className="text-title3 font-semibold tabular">{discovered}</span>
        <span className="text-footnote text-muted-foreground tabular">/ {total}</span>
      </span>
    </div>
  );
}
