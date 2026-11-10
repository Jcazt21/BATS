import { Link } from "react-router-dom";

/** Invitación para quien no ha entrado: ocupa el lugar del carnet y el equipo. */
export function GuestHero({ season }: { season?: string }) {
  return (
    <section
      aria-label="Tu estado"
      className="flex min-h-[320px] flex-col items-start justify-between gap-8 overflow-hidden rounded-[var(--radius-card)] p-8 font-card text-white bg-[linear-gradient(165deg,oklch(0.5_0.09_var(--month-h,210)),oklch(0.27_0.05_var(--month-h,210)))]"
    >
      <p className="text-caption uppercase tracking-[.14em] text-white/90">{season ?? "PinchesGueys League"}</p>
      <div className="flex max-w-xl flex-col gap-3">
        <h2 className="text-[clamp(32px,5vw,48px)] font-bold leading-[1.05] tracking-[-0.02em]">Tu carnet de entrenador te espera</h2>
        <p className="text-white/90">Entra para ver tu récord, tu equipo y si te falta votar. Mientras tanto, mira cómo va la liga.</p>
      </div>
      <Link to="/equipo" className="rounded-full bg-white px-5 py-2.5 text-subhead font-semibold text-[oklch(0.27_0.05_218)] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent">
        Entrar
      </Link>
    </section>
  );
}
