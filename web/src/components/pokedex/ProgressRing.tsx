/**
 * Anillo de progreso de la Pokédex: se llena según descubiertos / total, con el porcentaje y la
 * cifra en el centro. Con `label={false}` (versión chica) muestra solo el porcentaje y un trazo más fino.
 */
export function ProgressRing({ discovered, total, size = 132, label = true }: { discovered: number; total: number; size?: number; label?: boolean }) {
  const stroke = label ? 10 : 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.min(discovered / total, 1) : 0;
  const pctText = `${Math.round(ratio * 100)}%`;
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
      {label ? (
        <span className="absolute flex flex-col items-center leading-tight">
          <span className="font-card-mono text-title2 font-medium leading-none tabular">{pctText}</span>
          <span className="mt-1 text-caption text-muted-foreground tabular">{discovered} / {total}</span>
        </span>
      ) : (
        <span aria-hidden className="absolute font-card-mono text-caption font-semibold tabular">{pctText}</span>
      )}
    </div>
  );
}
