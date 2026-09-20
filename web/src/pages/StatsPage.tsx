import { useEffect, useState, useCallback, useRef } from "react";
import {
  getLeagueSummary, getMvpTop5, getPickRate, getLeaderboard, adminLogin, resetBattleData,
  getPublicSeasons,
  type LeagueSummary, type MvpEntry, type PickRateEntry, type LeaderboardEntry, type PublicSeasonEntry,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { Skeleton } from "@/components/ui/skeleton";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  Trash2, Loader2, Swords, Users, Clock, Trophy,
  BarChart2, List,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type SortDir = "asc" | "desc";
type PickRateRow = PickRateEntry & { viability_score: number };

// ── Viability Score ───────────────────────────────────────────────────────────
// score = usage_pct × (win_rate_pct / 50)
// Pokémon con 80% uso y 60% WR → 96 (dominante)
// Pokémon con 80% uso y 50% WR → 80 (popular, neutro)
// Pokémon con 80% uso y 40% WR → 64 (popular pero pierde)
function calcViability(usage: number, wr: number) {
  return Math.round(usage * (wr / 50) * 10) / 10;
}

type Tier = "S" | "A" | "B";
function getTier(score: number): Tier {
  if (score >= 70) return "S";
  if (score >= 45) return "A";
  return "B";
}
const TIER_STYLES: Record<Tier, string> = {
  S: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  A: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  B: "bg-slate-500/15 text-slate-400 border border-slate-500/30",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const MEDALS = ["🥇", "🥈", "🥉"];

function getPokemonSprite(species: string): string {
  const name = species
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://img.pokemondb.net/sprites/home/normal/${name}.png`;
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
function KpiCards({ data, loading }: { data: LeagueSummary | null; loading: boolean }) {
  const cards = [
    { label: "Batallas jugadas", value: data?.total_battles ?? 0,                        icon: Swords, color: "text-blue-400",    bg: "bg-blue-400/10"    },
    { label: "Jugadores activos", value: data?.total_players ?? 0,                        icon: Users,  color: "text-purple-400",  bg: "bg-purple-400/10"  },
    { label: "Turnos promedio",   value: data?.avg_turns ? data.avg_turns.toFixed(1) : "—", icon: Clock,  color: "text-yellow-400",  bg: "bg-yellow-400/10"  },
    { label: "Mejor win rate",    value: data?.top_win_rate ? `${data.top_win_rate}%` : "—", icon: Trophy, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <Card key={label} className="border-border/60">
          <CardContent className="pt-5 pb-4 px-5 flex items-center gap-3">
            <div className={`${bg} ${color} p-2 rounded-lg shrink-0`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              {loading
                ? <Skeleton className="h-7 w-16 mb-1" />
                : <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
              }
              <p className="text-xs text-muted-foreground truncate">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────
function SortHead({
  label, col, active, dir, onClick, className,
}: {
  label: string; col: string; active: string; dir: SortDir;
  onClick: (col: string) => void; className?: string;
}) {
  const isActive = active === col;
  return (
    <TableHead
      className={`cursor-pointer select-none bg-card hover:bg-muted/50 transition-colors ${className ?? ""}`}
      onClick={() => onClick(col)}
    >
      <span className="flex items-center gap-1 whitespace-nowrap">
        {label}
        {isActive
          ? dir === "desc"
            ? <ChevronDown className="h-3.5 w-3.5 text-primary" />
            : <ChevronUp   className="h-3.5 w-3.5 text-primary" />
          : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40" />
        }
      </span>
    </TableHead>
  );
}

// ── Sort hook ─────────────────────────────────────────────────────────────────
function useSortedData<T>(data: T[], defaultCol: keyof T, defaultDir: SortDir = "desc", tiebreaker?: keyof T) {
  const [col, setCol] = useState<keyof T>(defaultCol);
  const [dir, setDir] = useState<SortDir>(defaultDir);

  const toggle = useCallback((newCol: string) => {
    setCol((prev) => {
      if ((prev as string) === newCol) {
        setDir((d) => (d === "desc" ? "asc" : "desc"));
        return prev;
      }
      setDir("desc");
      return newCol as keyof T;
    });
  }, []);

  const sorted = [...data].sort((a, b) => {
    const av = a[col], bv = b[col];
    let cmp = typeof av === "string" && typeof bv === "string"
      ? av.localeCompare(bv)
      : Number(av) - Number(bv);

    // Si hay empate y tenemos un tiebreaker, lo evaluamos
    if (cmp === 0 && tiebreaker) {
      const at = a[tiebreaker], bt = b[tiebreaker];
      const tieCmp = typeof at === "string" && typeof bt === "string"
        ? at.localeCompare(bt)
        : Number(at) - Number(bt);
      // El tiebreaker suele mantener la dirección de "descendente es mejor" para valores numéricos
      cmp = tieCmp; 
    }

    return dir === "asc" ? cmp : -cmp;
  });

  return { sorted, col: col as string, dir, toggle };
}

// ── Table skeleton ────────────────────────────────────────────────────────────
function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full max-w-24" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── MVP score bar ─────────────────────────────────────────────────────────────
function MvpBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums font-semibold text-sm shrink-0">{Number(score).toFixed(0)}</span>
    </div>
  );
}

// ── Win rate bar ──────────────────────────────────────────────────────────────
function WinRateBar({ pct }: { pct: number }) {
  const color = pct >= 60 ? "bg-emerald-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-500";
  const text  = pct >= 60 ? "text-emerald-400" : pct >= 45 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className={`tabular-nums text-sm font-medium ${text}`}>{pct}%</span>
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────
function UsageBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-sm tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ── Viability badge ───────────────────────────────────────────────────────────
function ViabilityBadge({ score }: { score: number }) {
  const tier = getTier(score);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${TIER_STYLES[tier]}`}>
      <span className="text-[10px] font-bold opacity-60">{tier}</span>
      {score.toFixed(1)}
    </span>
  );
}

// ── MVP Table ─────────────────────────────────────────────────────────────────
function MvpTable({ data, loading, error }: { data: MvpEntry[]; loading: boolean; error: string | null }) {
  const { sorted, col, dir, toggle } = useSortedData<MvpEntry>(data, "total_mvp_score");
  const maxScore = Math.max(...data.map((e) => Number(e.total_mvp_score)), 0);

  return (
    <div className="overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 [&_tr]:border-b">
          <TableRow>
            <TableHead className="w-8 pl-6 bg-card">#</TableHead>
            <SortHead label="Pokémon"      col="species"         active={col} dir={dir} onClick={toggle} />
            <SortHead label="Jugador"      col="player"          active={col} dir={dir} onClick={toggle} />
            <SortHead label="Batallas"     col="battles_played"  active={col} dir={dir} onClick={toggle} />
            <SortHead label="Kills"        col="total_kills"     active={col} dir={dir} onClick={toggle} />
            <SortHead label="Último golpe" col="final_hits"      active={col} dir={dir} onClick={toggle} />
            <SortHead label="MVP Score"    col="total_mvp_score" active={col} dir={dir} onClick={toggle} className="pr-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <TableRow><TableCell colSpan={7} className="text-center text-destructive py-8">{error}</TableCell></TableRow>
          ) : loading ? (
            <TableSkeleton cols={7} />
          ) : sorted.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin datos aún</TableCell></TableRow>
          ) : (
            sorted.map((entry, i) => (
              <TableRow key={`${entry.species}-${entry.player}`} className="group">
                <TableCell className="pl-6 text-muted-foreground text-xs">
                  {MEDALS[i] ?? <span className="text-muted-foreground">#{i + 1}</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <img src={getPokemonSprite(entry.species)} alt={entry.species} className="h-8 w-8 object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }} />
                    <span className="font-medium text-sm">{entry.species}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{entry.player}</TableCell>
                <TableCell className="tabular-nums text-sm text-center">{entry.battles_played}</TableCell>
                <TableCell className="tabular-nums text-sm text-center">{entry.total_kills}</TableCell>
                <TableCell className="tabular-nums text-sm text-center">{entry.final_hits}</TableCell>
                <TableCell className="pr-6"><MvpBar score={Number(entry.total_mvp_score)} max={maxScore} /></TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Leaderboard Table ─────────────────────────────────────────────────────────
function LeaderboardTable({ data, loading, error }: { data: LeaderboardEntry[]; loading: boolean; error: string | null }) {
  type LCol = keyof Pick<LeaderboardEntry, "username" | "total_battles" | "wins" | "losses" | "total_survivors">;
  
  // Usamos total_survivors como tiebreaker cuando hay empate en victorias
  const { sorted, col, dir, toggle } = useSortedData<LeaderboardEntry>(data, "wins" as LCol, "desc", "total_survivors" as LCol);

  return (
    <div className="overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 [&_tr]:border-b">
          <TableRow>
            <TableHead className="w-8 pl-6 bg-card">#</TableHead>
            <SortHead label="Trainer"       col="username"        active={col} dir={dir} onClick={toggle} />
            <SortHead label="Battles"      col="total_battles"   active={col} dir={dir} onClick={toggle} />
            <SortHead label="W"             col="wins"            active={col} dir={dir} onClick={toggle} />
            <SortHead label="L"             col="losses"          active={col} dir={dir} onClick={toggle} />
            <SortHead label="Survivors" col="total_survivors" active={col} dir={dir} onClick={toggle} className="pr-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <TableRow><TableCell colSpan={6} className="text-center text-destructive py-8">{error}</TableCell></TableRow>
          ) : loading ? (
            <TableSkeleton cols={6} />
          ) : sorted.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin datos aún</TableCell></TableRow>
          ) : (
            sorted.map((entry, i) => (
              <TableRow key={entry.username} className="group">
                <TableCell className="pl-6 text-muted-foreground text-xs">
                  {MEDALS[i] ?? <span className="text-muted-foreground">#{i + 1}</span>}
                </TableCell>
                <TableCell className="font-medium text-sm">{entry.username}</TableCell>
                <TableCell className="tabular-nums text-sm text-center text-muted-foreground">{entry.total_battles}</TableCell>
                <TableCell className="tabular-nums text-sm text-center text-emerald-400 font-semibold">{entry.wins}</TableCell>
                <TableCell className="tabular-nums text-sm text-center text-red-400 font-semibold">{entry.losses}</TableCell>
                <TableCell className="tabular-nums text-sm text-center text-sky-400 font-semibold pr-6">{entry.total_survivors}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Pick Rate — Gráfico de barras horizontales ────────────────────────────────
function PickRateChart({ data, loading }: { data: PickRateRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2 w-full" />
            </div>
            <Skeleton className="h-2 w-20 shrink-0" />
          </div>
        ))}
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Sin datos aún
      </div>
    );
  }

  const sorted    = [...data].sort((a, b) => b.viability_score - a.viability_score);
  const maxUsage  = Math.max(...sorted.map((r) => Number(r.usage_pct)), 1);

  return (
    <div className="overflow-y-auto px-4 pb-4">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 px-9 py-2 border-b mb-1 sticky top-0 bg-card z-10">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">Pokémon</span>
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">Uso</span>
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
          Win Rate <span className="normal-case font-normal opacity-60">(50% = neutro)</span>
        </span>
      </div>

      {sorted.map((row, i) => {
        const usage  = Number(row.usage_pct);
        const wr     = Number(row.win_rate_pct);
        const wrAbove50 = wr >= 50;
        // Win rate diverging bar: delta from 50%, mapped to 0-100% of half-bar
        const wrDelta = Math.abs(wr - 50) / 50; // 0..1

        return (
          <div
            key={row.species}
            className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 items-center py-2.5 px-1 rounded-lg hover:bg-muted/30 transition-colors"
          >
            {/* ── Pokémon info ── */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-muted-foreground tabular-nums w-4 shrink-0 text-right">{i + 1}</span>
              <img
                src={getPokemonSprite(row.species)}
                alt={row.species}
                className="h-8 w-8 object-contain shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate leading-tight">{row.species}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{row.battles_used}b</span>
              </div>
              <ViabilityBadge score={row.viability_score} />
            </div>

            {/* ── Usage bar ── */}
            <div className="flex flex-col gap-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500/70 transition-all"
                  style={{ width: `${(usage / maxUsage) * 100}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">{usage}%</span>
            </div>

            {/* ── Win rate diverging bar ── */}
            <div className="flex flex-col gap-1">
              {/* Bar: two halves split at center (50%) */}
              <div className="flex h-2 rounded-full overflow-hidden bg-muted gap-px">
                {/* Left half: fills right→left when WR < 50 */}
                <div className="flex-1 flex items-center justify-end overflow-hidden rounded-l-full">
                  {!wrAbove50 && (
                    <div
                      className="h-full bg-red-500 transition-all rounded-l-full"
                      style={{ width: `${wrDelta * 100}%` }}
                    />
                  )}
                </div>
                {/* Center divider */}
                <div className="w-px bg-border/60 shrink-0" />
                {/* Right half: fills left→right when WR > 50 */}
                <div className="flex-1 flex items-center justify-start overflow-hidden rounded-r-full">
                  {wrAbove50 && (
                    <div
                      className="h-full bg-emerald-500 transition-all rounded-r-full"
                      style={{ width: `${wrDelta * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <span className={`text-[10px] tabular-nums font-medium ${
                wr >= 60 ? "text-emerald-400" :
                wr >= 50 ? "text-yellow-400" :
                           "text-red-400"
              }`}>{wr}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pick Rate — Tabla ─────────────────────────────────────────────────────────
function PickRateTable({ data, loading, error }: { data: PickRateRow[]; loading: boolean; error: string | null }) {
  const { sorted, col, dir, toggle } = useSortedData<PickRateRow>(data, "viability_score");

  return (
    <div className="overflow-y-auto flex-1 min-h-0">
      <Table>
        <TableHeader className="sticky top-0 z-10 [&_tr]:border-b">
          <TableRow>
            <TableHead className="w-8 pl-6 bg-card">#</TableHead>
            <SortHead label="Pokémon"  col="species"          active={col} dir={dir} onClick={toggle} />
            <SortHead label="Uso"      col="usage_pct"        active={col} dir={dir} onClick={toggle} />
            <SortHead label="Win Rate" col="win_rate_pct"     active={col} dir={dir} onClick={toggle} />
            <SortHead label="Score"    col="viability_score"  active={col} dir={dir} onClick={toggle} className="text-right pr-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <TableRow><TableCell colSpan={5} className="text-center text-destructive py-8">{error}</TableCell></TableRow>
          ) : loading ? (
            <TableSkeleton cols={5} />
          ) : sorted.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin datos aún</TableCell></TableRow>
          ) : (
            sorted.map((row, i) => (
              <TableRow key={row.species} className="group">
                <TableCell className="pl-6 text-muted-foreground text-xs">
                  {MEDALS[i] ?? <span className="text-muted-foreground">#{i + 1}</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <img
                      src={getPokemonSprite(row.species)}
                      alt={row.species}
                      className="h-8 w-8 object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm leading-tight">{row.species}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{row.battles_used} batallas</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><UsageBar pct={Number(row.usage_pct)} /></TableCell>
                <TableCell><WinRateBar pct={Number(row.win_rate_pct)} /></TableCell>
                <TableCell className="pr-6 text-right">
                  <ViabilityBadge score={row.viability_score} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Reset DB Modal ────────────────────────────────────────────────────────────
function ResetDbModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = await adminLogin(password);
      await resetBattleData(token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-destructive flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Limpiar base de datos
          </h3>
          <p className="text-xs text-muted-foreground">
            Se borrarán <strong>todas las batallas</strong>, jugadores, Pokémon y estadísticas.
            Esta acción no se puede deshacer.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            ref={inputRef}
            type="password"
            placeholder="Contraseña de admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" variant="destructive" size="sm" disabled={loading || !password}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Limpiar DB"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Season selector ───────────────────────────────────────────────────────────
function SeasonSelector({
  seasons, selected, onChange,
}: {
  seasons: PublicSeasonEntry[];
  selected: number | undefined;
  onChange: (id: number | undefined) => void;
}) {
  const active = seasons.find((s) => s.is_active);
  return (
    <select
      value={selected ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="h-8 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-[160px]"
    >
      <option value="">Todas las temporadas</option>
      {seasons.map((s) => (
        <option key={s.season_id} value={s.season_id}>
          {s.season_name}{s.is_active ? " ●" : ""}
        </option>
      ))}
      {!selected && active && (
        <option disabled style={{ fontSize: "11px", color: "#666" }}>
          — activa: {active.season_name}
        </option>
      )}
    </select>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function StatsPage({ showAdminControls = false }: { showAdminControls?: boolean }) {
  const [summary,     setSummary]     = useState<LeagueSummary | null>(null);
  const [mvp,         setMvp]         = useState<MvpEntry[]>([]);
  const [pickRate,    setPickRate]     = useState<PickRateEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [sumLoading,  setSumLoading]  = useState(true);
  const [mvpLoading,  setMvpLoading]  = useState(true);
  const [pickLoading, setPickLoading] = useState(true);
  const [lbLoading,   setLbLoading]   = useState(true);
  const [mvpError,    setMvpError]    = useState<string | null>(null);
  const [pickError,   setPickError]   = useState<string | null>(null);
  const [lbError,     setLbError]     = useState<string | null>(null);
  const [showReset,   setShowReset]   = useState(false);

  // Season filter
  const [seasons,    setSeasons]    = useState<PublicSeasonEntry[]>([]);
  const [seasonId,   setSeasonId]   = useState<number | undefined>(undefined);

  useEffect(() => {
    getPublicSeasons().then((s) => {
      setSeasons(s);
      const active = s.find((x) => x.is_active);
      if (active) setSeasonId(active.season_id);
    }).catch(() => {});
  }, []);

  const loadData = useCallback((sid: number | undefined) => {
    setSumLoading(true); setMvpLoading(true); setPickLoading(true); setLbLoading(true);
    setMvpError(null); setPickError(null); setLbError(null);

    getLeagueSummary(sid).then(setSummary).catch(() => {}).finally(() => setSumLoading(false));
    getMvpTop5(sid).then(setMvp).catch((e: Error) => setMvpError(e.message)).finally(() => setMvpLoading(false));
    getPickRate(sid).then(setPickRate).catch((e: Error) => setPickError(e.message)).finally(() => setPickLoading(false));
    getLeaderboard(sid).then(setLeaderboard).catch((e: Error) => setLbError(e.message)).finally(() => setLbLoading(false));
  }, []);

  // Load data whenever the active season changes (including initial load after seasons fetch)
  useEffect(() => { loadData(seasonId); }, [seasonId, loadData]);

  // Augment pick rate data with computed viability score
  const pickRateRows: PickRateRow[] = pickRate.map((row) => ({
    ...row,
    viability_score: calcViability(Number(row.usage_pct), Number(row.win_rate_pct)),
  }));

  const inner = (
    <div className={showAdminControls ? "h-full flex flex-col gap-6" : "flex flex-col gap-6 w-full max-w-5xl mx-auto px-4 py-8 pb-16"}>
      {showAdminControls && showReset && (
        <ResetDbModal
          onClose={() => setShowReset(false)}
          onSuccess={() => { setShowReset(false); loadData(seasonId); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Stats · Liga</h2>
          <p className="text-sm text-muted-foreground">
            {seasonId
              ? `Temporada: ${seasons.find((s) => s.season_id === seasonId)?.season_name ?? "…"}`
              : "Todas las temporadas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeasonSelector seasons={seasons} selected={seasonId} onChange={setSeasonId} />
          {showAdminControls && (
            <Button
              variant="ghost" size="sm"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowReset(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Limpiar DB
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCards data={summary} loading={sumLoading} />

      {/* Tables */}
      <div className="grid gap-6 md:grid-cols-2 flex-1 min-h-0">

        {/* MVP Top 5 + Leaderboard apilados */}
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top 5 MVP</CardTitle>
              <p className="text-xs text-muted-foreground">Pokémon con mayor puntaje MVP acumulado en la liga</p>
            </CardHeader>
            <CardContent className="p-0">
              <MvpTable data={mvp} loading={mvpLoading} error={mvpError} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Leaderboard</CardTitle>
              <p className="text-xs text-muted-foreground">Clasificación de jugadores por victorias</p>
            </CardHeader>
            <CardContent className="p-0">
              <LeaderboardTable data={leaderboard} loading={lbLoading} error={lbError} />
            </CardContent>
          </Card>
        </div>

        {/* Pick Rate — con scatter + tabla */}
        <Card className="overflow-hidden flex flex-col min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base">Pick Rate</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Uso vs. Win Rate · Score = uso × (WR / 50)
            </p>
          </CardHeader>

          <CardContent className="p-0 flex flex-col flex-1 min-h-0">
            {pickError ? (
              <div className="flex items-center justify-center py-12 text-destructive text-sm">{pickError}</div>
            ) : (
              <Tabs defaultValue="scatter" className="flex flex-col flex-1 min-h-0">
                {/* Segmented control — HIG style */}
                <div className="px-4 pb-3 pt-1 shrink-0">
                  <TabsList className="h-7">
                    <TabsTrigger value="scatter" className="gap-1.5 text-xs">
                      <BarChart2 className="h-3 w-3" /> Gráfico
                    </TabsTrigger>
                    <TabsTrigger value="lista" className="gap-1.5 text-xs">
                      <List className="h-3 w-3" /> Lista
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="scatter" className="m-0 flex-1 min-h-0 overflow-y-auto">
                  <PickRateChart data={pickRateRows} loading={pickLoading} />
                </TabsContent>

                <TabsContent value="lista" className="m-0 flex-1 min-h-0 flex flex-col overflow-hidden">
                  <PickRateTable data={pickRateRows} loading={pickLoading} error={null} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );

  return showAdminControls
    ? inner
    : <div className="min-h-screen bg-background">{inner}</div>;
}
