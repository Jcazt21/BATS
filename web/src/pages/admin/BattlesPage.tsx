import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Swords } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  getBattles, deleteBattle, getBattleDetails,
  type BattleEntry, type BattleDetailEntry,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPokemonSprite(species: string): string {
  const name = species
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://img.pokemondb.net/sprites/home/normal/${name}.png`;
}

const FORM_CHANGERS = [
  "Urshifu", "Palafin", "Ogerpon", "Terapagos", "Zamazenta",
  "Zacian", "Darmanitan", "Ursaluna",
];

function mergeTeam(team: BattleDetailEntry[]): BattleDetailEntry[] {
  const merged: Record<string, BattleDetailEntry> = {};
  for (const mon of team) {
    let base = mon.species;
    for (const fc of FORM_CHANGERS) {
      if (base.startsWith(fc)) { base = fc; break; }
    }
    if (!merged[base]) {
      merged[base] = { ...mon };
    } else {
      merged[base].kills += mon.kills;
      merged[base].mvp_score = Number(merged[base].mvp_score) + Number(mon.mvp_score);
      if (!mon.survived) merged[base].survived = false;
      if (mon.final_hit) merged[base].final_hit = true;
      if (mon.species.length > merged[base].species.length) merged[base].species = mon.species;
    }
  }
  return Object.values(merged).sort((a, b) => Number(b.mvp_score) - Number(a.mvp_score));
}

// ── Battle Detail Dialog ──────────────────────────────────────────────────────

function BattleDetailDialog({
  battle,
  onClose,
}: {
  battle: BattleEntry | null;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<BattleDetailEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!battle) return;
    setLoading(true);
    setDetails([]);
    getBattleDetails(battle.battle_id)
      .then(setDetails)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [battle]);

  if (!battle) return null;

  const p1Team = mergeTeam(details.filter((d) => d.player === battle.p1_username));
  const p2Team = mergeTeam(details.filter((d) => d.player === battle.p2_username));

  const allMons = [...p1Team, ...p2Team];
  const maxMvp = Math.max(...allMons.map((m) => Number(m.mvp_score)), 0);

  function TeamColumn({
    username,
    team,
    won,
  }: {
    username: string;
    team: BattleDetailEntry[];
    won: boolean;
  }) {
    return (
      <div className="flex flex-col space-y-3 min-w-0">
        <div className="flex flex-col border-b pb-2">
          <h3 className={`font-bold text-xl ${won ? "text-emerald-500" : "text-red-500"}`}>
            {username}
          </h3>
          <span className={`text-xs uppercase tracking-widest font-semibold mt-0.5 ${won ? "text-emerald-600/70" : "text-red-600/70"}`}>
            {won ? "Winner" : "Derrotado"}
          </span>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {team.map((mon) => {
              const isMvp = Number(mon.mvp_score) === maxMvp && maxMvp > 0;
              return (
                <div
                  key={mon.species}
                  className={`flex items-center justify-between p-2 rounded-md border transition-all ${
                    isMvp ? "border-yellow-500/50 shadow-sm shadow-yellow-500/10" : ""
                  } ${!mon.survived ? "opacity-60 bg-muted/50" : "bg-card"}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={getPokemonSprite(mon.species)}
                      alt={mon.species}
                      className={`h-10 w-10 shrink-0 object-contain drop-shadow-sm ${
                        !mon.survived ? "grayscale opacity-75" : ""
                      }`}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className={`font-medium truncate ${!mon.survived ? "line-through decoration-muted-foreground" : ""}`}>
                      {mon.species}
                    </span>
                  </div>
                  <div className="text-xs flex flex-col items-end shrink-0 ml-2">
                    <span className={isMvp ? "font-bold text-yellow-500" : "font-semibold text-foreground"}>
                      MVP: {Number(mon.mvp_score).toFixed(0)}
                    </span>
                    <span className="text-muted-foreground">KOs: {mon.kills}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const p1Won = battle.winner === battle.p1_username;
  const p2Won = battle.winner === battle.p2_username;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[800px] w-[95vw]">
        <DialogHeader>
          <DialogTitle>Detalles de Batalla</DialogTitle>
          <DialogDescription>
            {battle.p1_username} vs {battle.p2_username} · {battle.total_turns} turnos ·{" "}
            {battle.battle_date
              ? new Date(battle.battle_date).toLocaleDateString("es-MX", {
                  day: "2-digit", month: "short", year: "numeric",
                })
              : "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <TeamColumn username={battle.p1_username} team={p1Team} won={p1Won} />
          <TeamColumn username={battle.p2_username} team={p2Team} won={p2Won} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BattlesPage() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("bats_admin_token") ?? "";

  const [battles, setBattles]         = useState<BattleEntry[]>([]);
  const [loading, setLoading]         = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [selectedBattle, setSelected] = useState<BattleEntry | null>(null);

  const handleUnauth = useCallback(() => {
    sessionStorage.removeItem("bats_admin_token");
    navigate("/admin");
  }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBattles(await getBattles(token));
    } catch {
      handleUnauth();
    } finally {
      setLoading(false);
    }
  }, [token, handleUnauth]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = useCallback(async (battleId: string) => {
    setDeleting(battleId);
    setError(null);
    try {
      await deleteBattle(token, battleId);
      setBattles(prev => prev.filter(b => b.battle_id !== battleId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al borrar");
    } finally {
      setDeleting(null);
    }
  }, [token]);

  return (
    <div className="flex flex-col gap-4 max-w-3xl w-full mx-auto">
      <BattleDetailDialog
        battle={selectedBattle}
        onClose={() => setSelected(null)}
      />

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Batallas registradas</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {loading
              ? "Cargando…"
              : battles.length === 0
              ? "No hay batallas registradas."
              : `${battles.length} batalla${battles.length !== 1 ? "s" : ""} — haz clic para ver el detalle.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {error && (
            <p className="text-sm text-red-500 px-4 py-2">{error}</p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
          ) : battles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin batallas registradas.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {battles.map((b) => (
                <div
                  key={b.battle_id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setSelected(b)}
                >
                  {/* Icono */}
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted flex-shrink-0">
                    <Swords className="size-4 text-muted-foreground" />
                  </div>

                  {/* Info */}
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm leading-none">
                        {b.p1_username}
                        <span className="font-normal text-muted-foreground mx-1">vs</span>
                        {b.p2_username}
                      </span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {b.format_name}
                      </Badge>
                      {b.end_type !== "normal" && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-amber-900/40 text-amber-300">
                          {b.end_type}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {b.battle_date
                          ? new Date(b.battle_date).toLocaleDateString("es", {
                              day: "2-digit", month: "short", year: "numeric",
                            })
                          : "—"}
                      </span>
                      <span>{b.total_turns} turnos</span>
                      {b.winner && (
                        <span className="text-green-400">
                          Ganó: {b.winner}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Borrar */}
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          disabled={deleting === b.battle_id}
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    >
                      <Trash2 className="size-4" />
                    </AlertDialogTrigger>

                    <AlertDialogContent size="sm">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Borrar esta batalla?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará <strong>{b.p1_username} vs {b.p2_username}</strong> del{" "}
                          {b.battle_date
                            ? new Date(b.battle_date).toLocaleDateString("es")
                            : "—"}
                          . Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void handleDelete(b.battle_id)}
                        >
                          Borrar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        variant="outline"
        size="sm"
        className="self-center text-muted-foreground"
        onClick={() => void load()}
        disabled={loading}
      >
        {loading ? "Actualizando…" : "↻ Actualizar"}
      </Button>
    </div>
  );
}
