import { useState } from "react";
import { ReflectiveCard } from "@/components/ui/reflective-card";
import { initials, num, pct } from "@/lib/format";
import type { PlayerProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface TrainerCardProps {
  username: string;
  /** Etiqueta corta de la temporada ("Temporada 4"). */
  season?: string;
  rank?: number | null;
  totalPlayers?: number;
  profile?: PlayerProfile;
  className?: string;
}

/** oklch (L, C, h°) → "rgb(r, g, b)" sRGB, para teñir el metal con el tipo del mes. */
function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const [r, g, bl] = lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  });
  return [r, g, bl];
}

/** Tinte del metal (`--month-h`) y radio (`--radius-card`), leídos una vez al montar; el tipo del mes casi no cambia. */
function useMonthLook(): { tint: [number, number, number]; radius: number } {
  const [look] = useState(() => {
    const css = getComputedStyle(document.documentElement);
    const h = parseFloat(css.getPropertyValue("--month-h"));
    const radius = parseFloat(css.getPropertyValue("--radius-card"));
    return {
      tint: Number.isFinite(h) ? oklchToRgb(0.82, 0.07, h) : ([255, 255, 255] as [number, number, number]),
      radius: Number.isFinite(radius) ? radius : 28,
    };
  });
  return look;
}

const MONTH_FALLBACK = "linear-gradient(165deg,oklch(0.5 0.09 var(--month-h,210)),oklch(0.27 0.05 var(--month-h,210)))";

/**
 * Carnet del entrenador: 380×485 sobre una placa metálica reflectante teñida con el tipo del mes
 * y el puesto como marca de agua. Sin WebGL2 se ve el degradado del mes.
 * Los datos ya vienen calculados (récord, racha e insignias salen del servidor).
 */
export function TrainerCard({ username, season, rank, totalPlayers, profile, className }: TrainerCardProps) {
  const streak = profile?.streak;
  const { tint, radius } = useMonthLook();
  return (
    <ReflectiveCard
      width="100%"
      height={485}
      radius={radius}
      tint={tint}
      tiltStrength={10}
      className={cn("rounded-[var(--radius-card)] lg:w-[380px] lg:max-w-[380px]", className)}
      style={{ "--rc-base": MONTH_FALLBACK, "--rc-pad": "24px" } as React.CSSProperties}
    >
    <section
      aria-label="Tu carnet"
      className="relative flex h-full w-full flex-col justify-between font-card text-white [container-type:inline-size]"
    >
      {rank != null && (
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-[70px] -left-3.5 select-none text-[420px] font-bold leading-none tracking-[-0.07em] text-white/[.12]">
          #{rank}
        </span>
      )}

      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/15 text-base font-bold">
            {initials(username)}
          </span>
          <span className="truncate text-caption uppercase tracking-[.14em] text-white/90">Entrenador PGL</span>
        </div>
        {season && <span className="shrink-0 text-caption uppercase tracking-[.14em] text-white/90">{season}</span>}
      </header>

      <div className="relative flex min-w-0 flex-col gap-3">
        <h2 className="truncate text-[clamp(36px,17cqw,64px)] font-bold leading-[.9] tracking-[-0.02em]" title={username}>{username}</h2>
        <ul className="flex flex-wrap gap-1.5 text-caption font-bold">
          {rank != null && <li className="rounded-full bg-black/25 px-2.5 py-1">#{rank}{totalPlayers ? ` de ${totalPlayers}` : ""}</li>}
          {streak?.type && streak.length > 0 && (
            <li className="rounded-full bg-black/25 px-2.5 py-1">Racha {streak.type === "win" ? "V" : "D"}{streak.length}</li>
          )}
        </ul>
      </div>

      <dl className="relative grid grid-cols-3 gap-2">
        <Stat value={profile ? num(profile.record.wins) : "—"} label="Victorias" />
        <Stat value={profile ? pct(profile.record.win_rate_pct) : "—"} label="Win rate" />
        <Stat value={profile ? num(profile.mvp.total, 1) : "—"} label="MVP pts" />
      </dl>

      <ul aria-label="Insignias" className="relative flex gap-2.5">
        {(profile?.badges ?? []).map((b) => (
          <li
            key={b.id}
            role="img"
            aria-label={b.earned ? b.label : `${b.label} (bloqueada)`}
            title={b.earned ? b.label : `${b.label} (bloqueada)`}
            className={cn(
              "grid size-12 place-items-center rounded-full text-base font-bold",
              b.earned ? "border border-white/30 bg-white/[.18]" : "border border-dashed border-white/25 text-white/40",
            )}
          >
            {b.glyph}
          </li>
        ))}
      </ul>
    </section>
    </ReflectiveCard>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="font-card-mono text-[30px] font-medium leading-none tabular">{value}</dd>
      <dt className="mt-1 text-caption text-white/90">{label}</dt>
    </div>
  );
}
