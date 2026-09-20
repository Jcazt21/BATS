import { useEffect, useState } from "react";
import {
  getBotSummary, getBotPokemon, getBotBattles, getBotBattleDetails,
  type BotSummaryEntry, type BotPokemonEntry, type BotBattleEntry, type BattleDetailEntry
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Swords, Sword, TrendingUp, Clock, Shield, Zap } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPokemonSprite(species: string): string {
  const name = species
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://img.pokemondb.net/sprites/home/normal/${name}.png`;
}

function resultBadge(won: boolean) {
  return won
    ? <Badge className="bg-emerald-500/20 text-emerald-400 border-0">Victoria</Badge>
    : <Badge className="bg-red-500/20 text-red-400 border-0">Derrota</Badge>;
}

function winRateBadge(pct: number) {
  if (pct >= 60) return <span className="font-semibold text-emerald-400">{pct}%</span>;
  if (pct >= 40) return <span className="font-semibold text-yellow-400">{pct}%</span>;
  return <span className="font-semibold text-red-400">{pct}%</span>;
}

// ── Summary KPI Cards ─────────────────────────────────────────────────────────

function SummaryCards({
  data, pokemon, loading,
}: {
  data: BotSummaryEntry[]; pokemon: BotPokemonEntry[]; loading: boolean;
}) {
  const totalBattles = data.reduce((s, r) => s + r.total_battles, 0);
  const totalKos     = pokemon.reduce((s, r) => s + r.total_kills, 0);
  const avgKos       = totalBattles > 0 ? (totalKos / totalBattles).toFixed(1) : "—";
  const avgTurns     = data.length
    ? (data.reduce((s, r) => s + Number(r.avg_turns), 0) / data.length).toFixed(1)
    : "—";

  const cards = [
    { label: "Batallas vs Bot",  value: totalBattles,    icon: Swords,     color: "text-blue-400"   },
    { label: "KOs Totales",      value: totalKos,        icon: Sword,      color: "text-red-400"    },
    { label: "Avg KOs / Batalla",value: avgKos,          icon: TrendingUp, color: "text-yellow-400" },
    { label: "Promedio Turnos",  value: avgTurns,        icon: Clock,      color: "text-purple-400" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <Card key={label}>
          <CardContent className="pt-5 pb-4 px-5 flex items-center gap-3">
            <div className={`${color} shrink-0`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              {loading
                ? <Skeleton className="h-6 w-12 mb-1" />
                : <p className="text-xl font-bold tabular-nums">{value}</p>
              }
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Player Summary Table ──────────────────────────────────────────────────────

function PlayerSummaryTable({ data, loading }: { data: BotSummaryEntry[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" /> Jugadores vs PGL-Bot
        </CardTitle>
        <p className="text-xs text-muted-foreground">Rendimiento acumulado en práctica</p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Jugador</TableHead>
              <TableHead className="text-center">Batallas</TableHead>
              <TableHead className="text-center">W</TableHead>
              <TableHead className="text-center">L</TableHead>
              <TableHead className="text-center">Win Rate</TableHead>
              <TableHead className="text-center pr-6">Avg Turnos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Sin batallas vs bot aún
                </TableCell>
              </TableRow>
            ) : data.map((r) => (
              <TableRow key={r.username}>
                <TableCell className="pl-6 font-medium">{r.username}</TableCell>
                <TableCell className="text-center tabular-nums">{r.total_battles}</TableCell>
                <TableCell className="text-center tabular-nums text-emerald-400">{r.wins}</TableCell>
                <TableCell className="text-center tabular-nums text-red-400">{r.losses}</TableCell>
                <TableCell className="text-center">{winRateBadge(Number(r.win_rate_pct))}</TableCell>
                <TableCell className="text-center tabular-nums pr-6">{Number(r.avg_turns).toFixed(1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Pokémon Performance Table ─────────────────────────────────────────────────

function BotPokemonTable({ data, loading }: { data: BotPokemonEntry[]; loading: boolean }) {
  return (
    <Card className="flex flex-col min-h-0">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" /> Pokémon en práctica
        </CardTitle>
        <p className="text-xs text-muted-foreground">Top 30 por MVP Score acumulado vs bot</p>
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 [&_tr]:border-b">
            <TableRow>
              <TableHead className="w-8 pl-6 bg-card">#</TableHead>
              <TableHead className="bg-card">Pokémon</TableHead>
              <TableHead className="bg-card">Jugador</TableHead>
              <TableHead className="text-center bg-card">Usos</TableHead>
              <TableHead className="text-center bg-card">Kills</TableHead>
              <TableHead className="text-center bg-card">Survival</TableHead>
              <TableHead className="text-center bg-card">Final Hit</TableHead>
              <TableHead className="text-center bg-card pr-6">MVP Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Sin datos aún
                </TableCell>
              </TableRow>
            ) : data.map((r, i) => (
              <TableRow key={`${r.species}-${r.username}`}>
                <TableCell className="pl-6 text-muted-foreground text-xs">{i + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <img
                      src={getPokemonSprite(r.species)}
                      alt={r.species}
                      className="h-8 w-8 object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="font-medium text-sm">{r.species}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.username}</TableCell>
                <TableCell className="text-center tabular-nums text-sm">{r.times_used}</TableCell>
                <TableCell className="text-center tabular-nums text-sm">{r.total_kills}</TableCell>
                <TableCell className="text-center">
                  <span className={Number(r.survival_pct) >= 50 ? "text-emerald-400 text-sm" : "text-red-400 text-sm"}>
                    {r.survival_pct}%
                  </span>
                </TableCell>
                <TableCell className="text-center tabular-nums text-sm">{r.final_hits}</TableCell>
                <TableCell className="text-center tabular-nums font-semibold pr-6">
                  {Number(r.total_mvp_score).toFixed(0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Battle History ────────────────────────────────────────────────────────────

function BattleHistoryTable({ data, loading }: { data: BotBattleEntry[]; loading: boolean }) {
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [details, setDetails] = useState<BattleDetailEntry[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const handleOpenDetails = (id: string) => {
    setSelectedBattleId(id);
    setDetailsLoading(true);
    getBotBattleDetails(id)
      .then(setDetails)
      .catch((e) => console.error(e))
      .finally(() => setDetailsLoading(false));
  };

  const botUsername = "PGL-Bot";

  const mergeTeam = (team: BattleDetailEntry[]) => {
    const merged: Record<string, BattleDetailEntry> = {};
    const formChangers = ["Urshifu", "Palafin", "Ogerpon", "Terapagos", "Zamazenta", "Zacian", "Darmanitan", "Ursaluna"];
    for (const mon of team) {
      let base = mon.species;
      for (const fc of formChangers) {
        if (base.startsWith(fc)) {
          base = fc;
          break;
        }
      }
      if (!merged[base]) {
        merged[base] = { ...mon };
      } else {
        merged[base].kills += mon.kills;
        merged[base].mvp_score = Number(merged[base].mvp_score) + Number(mon.mvp_score);
        if (!mon.survived) merged[base].survived = false;
        if (mon.final_hit) merged[base].final_hit = true;
        // Keep the form name (usually the longer one) for better sprite matching
        if (mon.species.length > merged[base].species.length) {
          merged[base].species = mon.species;
        }
      }
    }
    return Object.values(merged).sort((a,b) => Number(b.mvp_score) - Number(a.mvp_score));
  };

  const rawHuman = details.filter(d => d.player !== botUsername);
  const rawBot = details.filter(d => d.player === botUsername);

  const humanTeam = mergeTeam(rawHuman);
  const botTeam = mergeTeam(rawBot);
  const humanName = humanTeam.length > 0 ? humanTeam[0].player : "Jugador";
  const selectedBattle = data.find(b => b.battle_id === selectedBattleId);
  const humanWon = selectedBattle?.player_won ?? false;

  const allMons = [...humanTeam, ...botTeam];
  const maxMvp = Math.max(...allMons.map(m => Number(m.mvp_score)), 0);
  const isMatchMvp = (mon: BattleDetailEntry) => Number(mon.mvp_score) === maxMvp && maxMvp > 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> Historial de Batallas
          </CardTitle>
          <p className="text-xs text-muted-foreground">Últimas 50 batallas vs PGL-Bot</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Batalla</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Turnos</TableHead>
                <TableHead className="text-center">Tipo</TableHead>
                <TableHead className="text-center pr-6">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Sin batallas registradas
                  </TableCell>
                </TableRow>
              ) : data.map((r) => {
                const num = r.battle_id.match(/-(\d+)$/)?.[1];
                return (
                <TableRow 
                  key={r.battle_id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleOpenDetails(r.battle_id)}
                >
                  <TableCell className="pl-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{r.player} vs PGL-Bot</span>
                      {num && <span className="text-xs text-muted-foreground">#{num}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.battle_date ? new Date(r.battle_date).toLocaleDateString("es-MX") : "—"}
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">{r.turns}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs capitalize">{r.end_type}</Badge>
                  </TableCell>
                  <TableCell className="text-center pr-6">{resultBadge(r.player_won)}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedBattleId} onOpenChange={(o) => (!o && setSelectedBattleId(null))}>
        <DialogContent className="sm:max-w-[800px] w-[95vw]">
          <DialogHeader>
            <DialogTitle>Detalles de Batalla</DialogTitle>
            <DialogDescription>
              {humanName} vs PGL-Bot
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            {/* Human Team */}
            <div className="flex flex-col space-y-3 min-w-0">
              <div className="flex flex-col border-b pb-2">
                <h3 className={`font-bold text-xl ${humanWon ? 'text-emerald-500' : 'text-red-500'}`}>{humanName}</h3>
                <span className={`text-xs uppercase tracking-widest font-semibold mt-0.5 ${humanWon ? 'text-emerald-600/70' : 'text-red-600/70'}`}>
                  {humanWon ? 'Winner' : 'Derrotado'}
                </span>
              </div>
              {detailsLoading ? (
                <div className="space-y-2">
                  {Array.from({length: 6}).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {humanTeam.map((mon) => (
                    <div 
                      key={mon.species} 
                      className={`flex items-center justify-between p-2 rounded-md border transition-all ${
                        isMatchMvp(mon) ? 'border-yellow-500/50 shadow-sm shadow-yellow-500/10' : ''
                      } ${!mon.survived ? 'opacity-60 bg-muted/50' : 'bg-card'}`}
                    >
                       <div className="flex items-center gap-3 min-w-0 flex-1">
                         <img 
                           src={getPokemonSprite(mon.species)} 
                           alt={mon.species} 
                           className={`h-10 w-10 shrink-0 object-contain drop-shadow-sm transition-all ${
                             !mon.survived ? 'grayscale opacity-75' : ''
                           }`}
                           onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                         />
                         <span className={`font-medium truncate ${!mon.survived ? 'line-through decoration-muted-foreground' : ''}`}>
                           {mon.species}
                         </span>
                       </div>
                       <div className="text-xs flex flex-col items-end shrink-0 ml-2">
                         <span className={isMatchMvp(mon) ? "font-bold text-yellow-500" : "font-semibold text-foreground"}>
                           MVP: {Number(mon.mvp_score).toFixed(0)}
                         </span>
                         <span className="text-muted-foreground">KOs: {mon.kills}</span>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bot Team */}
            <div className="flex flex-col space-y-3 min-w-0">
              <div className="flex flex-col border-b pb-2">
                <h3 className={`font-bold text-xl ${!humanWon ? 'text-emerald-500' : 'text-red-500'}`}>PGL-Bot</h3>
                <span className={`text-xs uppercase tracking-widest font-semibold mt-0.5 ${!humanWon ? 'text-emerald-600/70' : 'text-red-600/70'}`}>
                  {!humanWon ? 'Winner' : 'Derrotado'}
                </span>
              </div>
              {detailsLoading ? (
                <div className="space-y-2">
                  {Array.from({length: 6}).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {botTeam.map((mon) => (
                    <div 
                      key={mon.species} 
                      className={`flex items-center justify-between p-2 rounded-md border transition-all ${
                        isMatchMvp(mon) ? 'border-yellow-500/50 shadow-sm shadow-yellow-500/10' : ''
                      } ${!mon.survived ? 'opacity-60 bg-muted/50' : 'bg-card'}`}
                    >
                       <div className="flex items-center gap-3 min-w-0 flex-1">
                         <img 
                           src={getPokemonSprite(mon.species)} 
                           alt={mon.species} 
                           className={`h-10 w-10 shrink-0 object-contain drop-shadow-sm transition-all ${
                             !mon.survived ? 'grayscale opacity-75' : ''
                           }`}
                           onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                         />
                         <span className={`font-medium truncate ${!mon.survived ? 'line-through decoration-muted-foreground' : ''}`}>
                           {mon.species}
                         </span>
                       </div>
                       <div className="text-xs flex flex-col items-end shrink-0 ml-2">
                         <span className={isMatchMvp(mon) ? "font-bold text-yellow-500" : "font-semibold text-foreground"}>
                           MVP: {Number(mon.mvp_score).toFixed(0)}
                         </span>
                         <span className="text-muted-foreground">KOs: {mon.kills}</span>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function StatsBotPage() {
  const [summary, setSummary]   = useState<BotSummaryEntry[]>([]);
  const [pokemon, setPokemon]   = useState<BotPokemonEntry[]>([]);
  const [battles, setBattles]   = useState<BotBattleEntry[]>([]);
  const [loadingS, setLoadingS] = useState(true);
  const [loadingP, setLoadingP] = useState(true);
  const [loadingB, setLoadingB] = useState(true);

  useEffect(() => {
    getBotSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoadingS(false));

    getBotPokemon()
      .then(setPokemon)
      .catch(() => {})
      .finally(() => setLoadingP(false));

    getBotBattles()
      .then(setBattles)
      .catch(() => {})
      .finally(() => setLoadingB(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Stats · Bot</h2>
        <p className="text-sm text-muted-foreground">
          Práctica contra PGL-Bot — laboratorio para afinar estrategias
        </p>
      </div>

      <SummaryCards data={summary} pokemon={pokemon} loading={loadingS || loadingP} />

      <div className="grid gap-6 md:grid-cols-2">
        <PlayerSummaryTable data={summary} loading={loadingS} />
        <BattleHistoryTable data={battles} loading={loadingB} />
      </div>

      <BotPokemonTable data={pokemon} loading={loadingP} />
    </div>
  );
}
