import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Meter } from "@/components/app/Meter";
import MagicBento, { type MagicBentoItem } from "@/components/effects/MagicBento";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { DexStatus } from "@/lib/dex/collection";
import type { CellPlayerStats } from "@/lib/dex/player-stats";
import type { Species } from "@/lib/dex/snapshot";
import { num, pct } from "@/lib/format";
import { ApiError } from "@/lib/http";
import type { usePokemonStatsEntry } from "@/lib/queries";
import { cn } from "@/lib/utils";

const STAT_LABELS: [string, string][] = [
  ["hp", "PS"],
  ["atk", "Ataque"],
  ["def", "Defensa"],
  ["spa", "At. Esp."],
  ["spd", "Def. Esp."],
  ["spe", "Velocidad"],
];

type LeagueStatsQuery = ReturnType<typeof usePokemonStatsEntry>;

interface EntryBentoProps {
  species: Species;
  cellStatus: DexStatus;
  playerStats: CellPlayerStats;
  playerStatsLoading: boolean;
  leagueStats: LeagueStatsQuery;
  isOwn: boolean;
  wide: boolean;
}

function LeagueSummaryLine({ stats }: { stats: LeagueStatsQuery }) {
  if (stats.isPending) return <Skeleton className="mt-1 h-4 w-44" />;
  if (stats.isError) {
    const notFound = stats.error instanceof ApiError && stats.error.status === 404;
    return (
      <p className="mt-0.5 text-footnote text-muted-foreground">
        {notFound ? "Todavía sin estadísticas de torneo." : "No se pudieron cargar las estadísticas."}
      </p>
    );
  }
  const s = stats.data;
  return (
    <p className="mt-0.5 font-card-mono text-footnote tabular">
      <span>{pct(s.pick_pct, 1)}</span>{" "}
      <span className="text-muted-foreground">pick ·</span>{" "}
      <span>{pct(s.win_rate_pct, 1)}</span>{" "}
      <span className="text-muted-foreground">WR ·</span>{" "}
      <span>{num(s.avg_mvp, 2)}</span>{" "}
      <span className="text-muted-foreground">MVP medio</span>
    </p>
  );
}

function BaseStatsBars({ species }: { species: Species }) {
  return (
    <ul className="grid grid-cols-1 gap-x-3 gap-y-1 min-[360px]:grid-flow-col min-[360px]:grid-cols-2 min-[360px]:grid-rows-3">
      {STAT_LABELS.map(([key, label]) => {
        const val = species.baseStats[key] ?? 0;
        return (
          <li key={key} className="grid grid-cols-[3.75rem_2rem_1fr] items-center gap-1.5 text-caption">
            <span className="truncate text-muted-foreground">{label}</span>
            <span className="text-right font-card-mono tabular">{species.baseStats[key] ?? "—"}</span>
            <Meter value={val} max={255} label={`${label}: ${val}`} />
          </li>
        );
      })}
    </ul>
  );
}

function playerTiles(
  playerStats: CellPlayerStats,
  loading: boolean,
  cellStatus: DexStatus,
  isOwn: boolean,
): MagicBentoItem[] {
  if (loading) {
    return [
      {
        id: "player-loading",
        label: "Estadísticas del jugador",
        colSpan: 3,
        content: <Skeleton className="h-9 w-full" />,
      },
    ];
  }

  if (playerStats.kind === "used") {
    const kpi = (id: string, label: string, value: string): MagicBentoItem => ({
      id,
      label,
      colSpan: 1,
      className: "ring-1 ring-primary/40 shadow-sm",
      content: (
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="truncate text-caption text-muted-foreground">{label}</p>
          <p className="mt-0.5 font-card-mono text-title3 font-semibold leading-tight tabular">{value}</p>
        </div>
      ),
    });
    return [
      kpi("kills", isOwn ? "Tus KOs" : "Sus KOs", num(playerStats.kills)),
      kpi("mvp", isOwn ? "Tu MVP" : "Su MVP", num(playerStats.mvp, 2)),
      kpi("battles", isOwn ? "Tus batallas" : "Sus batallas", num(playerStats.battles)),
    ];
  }

  if (playerStats.kind === "faced") {
    const { battles, killsAgainst, wins } = playerStats;
    const veces = battles === 1 ? "vez" : "veces";
    const kos = killsAgainst === 1 ? "KO" : "KOs";
    const text = isOwn
      ? `Lo enfrentaste ${battles} ${veces} · te hizo ${killsAgainst} ${kos} · le ganaste ${wins}`
      : `Lo enfrentó ${battles} ${veces} · le hizo ${killsAgainst} ${kos} · le ganó ${wins}`;
    return [
      {
        id: "player-faced",
        label: "Solo enfrentado",
        colSpan: 3,
        className: "ring-1 ring-primary/25",
        content: (
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Solo enfrentado</p>
            <p className="mt-0.5 text-footnote text-foreground">{text}</p>
          </div>
        ),
      },
    ];
  }

  return [
    {
      id: "player-empty",
      label: cellStatus === "evolution" ? "Por evolución" : "Sin batallas",
      colSpan: 3,
      content: (
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            {cellStatus === "evolution" ? "Por evolución" : isOwn ? "Tus batallas" : "Sus batallas"}
          </p>
          <p className="mt-0.5 text-footnote text-muted-foreground">Sin batallas todavía</p>
        </div>
      ),
    },
  ];
}

/**
 * Mosaicos bento de la ficha del pokémon: cifras del jugador (3 casos),
 * resumen en la liga en una línea y stats base en 2 columnas (plegable en teléfono).
 */
export function EntryBento({
  species,
  cellStatus,
  playerStats,
  playerStatsLoading,
  leagueStats,
  isOwn,
  wide,
}: EntryBentoProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const items: MagicBentoItem[] = [
    ...playerTiles(playerStats, playerStatsLoading, cellStatus, isOwn),
    {
      id: "league-summary",
      label: "En la liga",
      colSpan: 3,
      content: (
        <div className="min-w-0">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">En la liga</p>
          <LeagueSummaryLine stats={leagueStats} />
        </div>
      ),
    },
    {
      id: "base-stats",
      label: "Stats base",
      colSpan: 3,
      content: wide ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Stats base</p>
          <BaseStatsBars species={species} />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col">
          <button
            type="button"
            aria-expanded={statsOpen}
            onClick={() => setStatsOpen((open) => !open)}
            className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg text-left text-caption font-medium uppercase tracking-wide text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>Stats base</span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0",
                statsOpen && "rotate-180",
                !reduceMotion && "transition-transform duration-200",
              )}
              aria-hidden="true"
            />
          </button>
          {statsOpen && (
            <div className="pt-1.5">
              <BaseStatsBars species={species} />
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <MagicBento
      items={items}
      columns={3}
      minColumns={3}
      rowHeight={48}
      gap={8}
      radius={14}
      role="group"
      aria-label="Estadísticas de la ficha"
      className="[&_.magic-bento__content]:px-3.5 [&_.magic-bento__content]:py-2.5"
    />
  );
}
