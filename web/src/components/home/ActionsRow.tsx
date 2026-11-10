import { Link } from "react-router-dom";
import type { BanStatus, RosterInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ActionsRowProps {
  ban?: BanStatus;
  /** Resultado de /api/ban/me: si puedo votar y, si no, por qué. */
  elig?: { can_vote: boolean; reason?: string | null };
  roster?: RosterInfo;
  /** El jugador aún no registra su equipo (404 de /api/teams/me). */
  noTeam?: boolean;
  className?: string;
}

/** Tres pendientes del entrenador con su progreso, sin cajas: solo líneas finas entre ellos. */
export function ActionsRow({ ban, elig, roster, noTeam, className }: ActionsRowProps) {
  const voted = elig?.reason === "already_voted";
  const canVote = !!elig?.can_vote && !!ban?.voting_open;
  const validation = roster?.validation;
  const errors = validation?.errors.length ?? 0;

  return (
    <ul aria-label="Pendientes" className={cn("grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0", className)}>
      <Item
        ring={ban ? ban.total_voted / Math.max(1, ban.total_authorized) : 0}
        center={ban ? `${ban.total_voted}/${ban.total_authorized}` : "—"}
        title="Fase de bans"
        text={voted ? "Ya votaste" : canVote ? "Falta tu voto" : ban && !ban.voting_open ? "Votación cerrada" : "Sin voto pendiente"}
        action={canVote ? { to: "/bans", label: "Votar" } : undefined}
      />
      <Item
        ring={noTeam ? 0 : validation?.state === "ok" ? 1 : validation?.state === "errors" ? 0.15 : 0}
        center={noTeam ? "—" : validation?.state === "ok" ? "OK" : validation?.state === "errors" ? "!" : "…"}
        title={noTeam ? "Sin equipo" : "Equipo válido"}
        text={noTeam ? "Aún no registras tu equipo" : validation?.state === "ok" ? "Cumple las reglas del mes" : validation?.state === "errors" ? `${errors} ${errors === 1 ? "regla" : "reglas"} por corregir` : "Validación pendiente"}
        action={noTeam ? { to: "/equipo", label: "Registrar" } : errors ? { to: "/equipo", label: "Corregir" } : undefined}
      />
      <Item
        ring={roster && roster.max_rotations > 0 ? roster.rotations_remaining / roster.max_rotations : 0}
        center={roster ? `${roster.rotations_remaining}/${roster.max_rotations}` : "—"}
        title="Rotaciones"
        text={roster ? `Te quedan ${roster.rotations_remaining}` : "Sin equipo registrado"}
      />
    </ul>
  );
}

function Item({ ring, center, title, text, action }: { ring: number; center: string; title: string; text: string; action?: { to: string; label: string } }) {
  const p = Math.round(Math.min(1, Math.max(0, ring)) * 100);
  return (
    <li className="flex items-center gap-3.5 py-4 sm:px-5 sm:first:pl-0">
      <span
        aria-hidden="true"
        className="grid size-16 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(var(--primary) ${p}%, var(--secondary) 0)` }}
      >
        <span className="grid size-[50px] place-items-center rounded-full bg-background text-caption font-semibold tabular">{center}</span>
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-footnote text-muted-foreground">{text}</p>
        {action && (
          <Link to={action.to} className="mt-2 inline-flex rounded-full bg-primary px-4 py-2 text-footnote font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {action.label}
          </Link>
        )}
      </div>
    </li>
  );
}
