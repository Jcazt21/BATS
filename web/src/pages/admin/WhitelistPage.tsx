import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UserRoundPlus, Users, CheckCircle2, Clock, Trash2, ChevronDown } from "lucide-react";

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input }     from "@/components/ui/input";
import { Button }    from "@/components/ui/button";
import { Badge }     from "@/components/ui/badge";
import { Skeleton }  from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  getSeasons, getSeasonWhitelist, addSeasonWhitelist, removeSeasonWhitelist,
  type WhitelistPlayer, type SeasonEntry,
} from "@/lib/api";

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, loading }: {
  label: string; value: number; icon: React.ElementType; loading: boolean;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col gap-3 px-5 py-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          <Icon className="size-4 text-muted-foreground/60" />
        </div>
        {loading
          ? <Skeleton className="h-8 w-12" />
          : <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function WhitelistPage() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("bats_admin_token") ?? "";

  const [seasons,     setSeasons]     = useState<SeasonEntry[]>([]);
  const [season,      setSeason]      = useState<SeasonEntry | null>(null);
  const [players,     setPlayers]     = useState<WhitelistPlayer[]>([]);
  const [loadingWL,   setLoadingWL]   = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [adding,      setAdding]      = useState(false);
  const [addError,    setAddError]    = useState<string | null>(null);
  const [toRemove,    setToRemove]    = useState<WhitelistPlayer | null>(null);
  const [removing,    setRemoving]    = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleUnauth = useCallback(() => {
    sessionStorage.removeItem("bats_admin_token");
    navigate("/admin");
  }, [navigate]);

  // Load seasons on mount, pre-select the active one
  useEffect(() => {
    getSeasons(token)
      .then((list) => {
        setSeasons(list);
        const active = list.find((s) => s.is_active) ?? list[0] ?? null;
        setSeason(active);
      })
      .catch(handleUnauth);
  }, [token, handleUnauth]);

  // Reload whitelist whenever the selected season changes
  const loadWhitelist = useCallback(async (s: SeasonEntry | null) => {
    if (!s) return;
    setLoadingWL(true);
    setPlayers([]);
    try {
      setPlayers(await getSeasonWhitelist(token, s.season_id));
    } catch (e) {
      if (e instanceof Error && e.message === "No autorizado") handleUnauth();
    } finally {
      setLoadingWL(false);
    }
  }, [token, handleUnauth]);

  useEffect(() => { void loadWhitelist(season); }, [season, loadWhitelist]);

  async function handleAdd() {
    if (!season) return;
    const username = newUsername.trim();
    if (!username) return;
    setAdding(true);
    setAddError(null);
    try {
      await addSeasonWhitelist(token, season.season_id, username.toLowerCase());
      setNewUsername("");
      await loadWhitelist(season);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveConfirm() {
    if (!toRemove || !season) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeSeasonWhitelist(token, season.season_id, toRemove.voter_hash);
      setToRemove(null);
      await loadWhitelist(season);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setRemoving(false);
    }
  }

  const votedCount   = players.filter((p) => p.voted).length;
  const pendingCount = players.length - votedCount;

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Whitelist</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jugadores habilitados para votar en los bans por temporada.
          </p>
        </div>

        {/* Season selector */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="outline" size="sm" className="gap-2 min-w-[160px] justify-between" />
          }>
            <span className="truncate">
              {season ? season.season_name : "Seleccionar temporada"}
            </span>
            {season?.is_active && (
              <Badge className="text-[10px] px-1.5 py-0 bg-emerald-900/60 text-emerald-300 border-0 shrink-0">
                Activa
              </Badge>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {seasons.map((s) => (
              <DropdownMenuItem
                key={s.season_id}
                onClick={() => setSeason(s)}
                className="flex items-center justify-between gap-3"
              >
                <span>{s.season_name}</span>
                {s.is_active && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-emerald-900/60 text-emerald-300 border-0">
                    Activa
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* No season selected */}
      {!season && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Users className="size-9 opacity-20" />
          <p className="text-sm">Selecciona una temporada para gestionar su whitelist.</p>
        </div>
      )}

      {season && (
        <>
          {/* ── Stats ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Registrados" value={players.length} icon={Users}       loading={loadingWL} />
            <StatCard label="Votaron"     value={votedCount}     icon={CheckCircle2} loading={loadingWL} />
            <StatCard label="Pendientes"  value={pendingCount}   icon={Clock}        loading={loadingWL} />
          </div>

          {/* ── Agregar jugador ─────────────────────────────────────────────── */}
          <Card className="shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <UserRoundPlus className="size-4 text-muted-foreground" />
                Agregar jugador
              </CardTitle>
              <CardDescription className="text-xs">
                Username exacto de Pokémon Showdown — se agrega a <strong>{season.season_name}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <div className="flex gap-2">
                <Input
                  placeholder="Username de PS"
                  value={newUsername}
                  onChange={(e) => { setNewUsername(e.target.value); setAddError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
                  disabled={adding}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 h-9 text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => void handleAdd()}
                  disabled={!newUsername.trim() || adding}
                  className="shrink-0"
                >
                  {adding ? "Agregando…" : "Agregar"}
                </Button>
              </div>
              {addError && <p className="text-xs text-destructive">{addError}</p>}
            </CardContent>
          </Card>

          {/* ── Tabla ──────────────────────────────────────────────────────── */}
          <Card className="shadow-none overflow-hidden">
            <CardHeader className="pb-0 px-6 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Jugadores — {season.season_name}
                </CardTitle>
                {!loadingWL && players.length > 0 && (
                  <Badge variant="secondary" className="text-xs font-normal tabular-nums">
                    {players.length}
                  </Badge>
                )}
              </div>
              {!loadingWL && (
                <CardDescription className="text-xs mt-0.5">
                  {votedCount} de {players.length} han votado
                </CardDescription>
              )}
            </CardHeader>

            <Separator className="mt-4" />

            <CardContent className="p-0">
              {loadingWL ? (
                <div className="flex flex-col divide-y divide-border">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-6 py-3.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                      <Skeleton className="h-7 w-16 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : players.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                  <Users className="size-9 opacity-20" />
                  <p className="text-sm">Sin jugadores en {season.season_name}.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6 text-xs font-medium">Username</TableHead>
                      <TableHead className="text-center w-32 text-xs font-medium">Estado</TableHead>
                      <TableHead className="w-28 pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {players.map((p) => (
                      <TableRow key={p.voter_hash} className="group transition-colors">
                        <TableCell className="pl-6 py-3 font-medium text-sm">{p.username}</TableCell>
                        <TableCell className="py-3 text-center">
                          {p.voted ? (
                            <Badge variant="secondary" className="gap-1 text-xs font-normal">
                              <CheckCircle2 className="size-3 text-emerald-500" />Votó
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
                              <Clock className="size-3" />Pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3 pr-4 text-right">
                          <Button
                            variant="ghost" size="sm"
                            disabled={p.voted}
                            onClick={() => { setRemoveError(null); setToRemove(p); }}
                            className="h-7 gap-1.5 px-2.5 text-xs opacity-0 group-hover:opacity-100 disabled:opacity-0 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                          >
                            <Trash2 className="size-3" />Eliminar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Confirm remove ────────────────────────────────────────────────── */}
      <AlertDialog open={!!toRemove} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {toRemove?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará del whitelist de <strong>{season?.season_name}</strong> y no podrá votar.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && <p className="text-sm text-destructive px-1">{removeError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleRemoveConfirm()}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
