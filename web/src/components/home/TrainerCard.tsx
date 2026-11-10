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

/**
 * Carnet del entrenador: 380×485, degradado del tipo del mes y el puesto como marca de agua.
 * Los datos ya vienen calculados (récord, racha e insignias salen del servidor).
 */
export function TrainerCard({ username, season, rank, totalPlayers, profile, className }: TrainerCardProps) {
  const streak = profile?.streak;
  return (
    <section
      aria-label="Tu carnet"
      className={cn(
        "relative flex h-[485px] w-full flex-col justify-between overflow-hidden rounded-[var(--radius-card)] p-6 font-card text-white lg:w-[380px] [container-type:inline-size]",
        "bg-[linear-gradient(165deg,oklch(0.5_0.09_var(--month-h,210)),oklch(0.27_0.05_var(--month-h,210)))]",
        className,
      )}
    >
      {rank != null && (
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-[70px] -left-3.5 select-none text-[420px] font-bold leading-none tracking-[-0.07em] text-white/[.08]">
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
