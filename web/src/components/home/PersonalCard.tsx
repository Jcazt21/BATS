import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { BanStatus, LeaderboardEntry } from "@/lib/api";
import { ApiError } from "@/lib/http";
import { useEligibility, useMe, useRoster } from "@/lib/queries";
import { useSession } from "@/lib/session";

function Fila({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-caption text-muted-foreground">{label}</dt>
        <dd className="text-subhead">{children}</dd>
      </div>
      {action}
    </div>
  );
}

/** "¿Qué hago ahora?": tu récord, el estado de tu equipo y si te falta votar. Sin sesión, invita a entrar. */
export function PersonalCard({ leaderboard, ban }: { leaderboard: LeaderboardEntry[] | undefined; ban: BanStatus | undefined }) {
  const { session } = useSession();
  const me = useMe();
  const roster = useRoster();
  const elig = useEligibility();

  if (!session) {
    return (
      <section aria-label="Tu estado" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
        <p className="text-subhead text-muted-foreground">Entra para ver tu récord, tu equipo y si te falta votar.</p>
        <Link to="/equipo" className={buttonVariants({ size: "sm" })}>Entrar</Link>
      </section>
    );
  }

  const cargando = me.isPending || roster.isPending || elig.isPending;
  const record = leaderboard?.find((p) => p.username === me.data?.username);
  const sinEquipo = roster.isError && roster.error instanceof ApiError && roster.error.status === 404;

  return (
    <section aria-label="Tu estado" className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
      {cargando ? <LoadingState rows={1} className="-m-2" /> : (
        <dl className="grid gap-x-6 gap-y-1 md:grid-cols-3">
          <Fila label="Tu récord">{record ? `${record.wins} V · ${record.losses} D` : "Sin batallas aún"}</Fila>

          <Fila label="Tu equipo"
            action={sinEquipo ? <Link to="/equipo" className={buttonVariants({ size: "sm", variant: "secondary" })}>Registrar equipo</Link> : undefined}>
            {sinEquipo ? "Aún no registras tu equipo"
              : roster.isError || !roster.data ? "No se pudo cargar tu equipo"
              : (
                <span className="flex flex-wrap items-center gap-2">
                  {roster.data.pool.length}/{roster.data.max_team_size} pokémon
                  {roster.data.validation.state === "ok" && <Badge variant="success">Válido</Badge>}
                  {roster.data.validation.state === "errors" && <Badge variant="destructive">{roster.data.validation.errors.length} {roster.data.validation.errors.length === 1 ? "error" : "errores"}</Badge>}
                  {roster.data.validation.state === "pending" && <Badge variant="secondary">Pendiente</Badge>}
                </span>
              )}
          </Fila>

          <Fila label="Fase de bans"
            action={elig.data?.can_vote && ban?.voting_open ? <Link to="/bans" className={buttonVariants({ size: "sm", variant: "secondary" })}>Votar</Link> : undefined}>
            {ban && !ban.voting_open ? "Votación cerrada"
              : elig.data?.can_vote ? "Tienes un voto pendiente"
              : elig.data?.reason === "already_voted" ? "Ya votaste"
              : "No participas en esta votación"}
          </Fila>
        </dl>
      )}
    </section>
  );
}
