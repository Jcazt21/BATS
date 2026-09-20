import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBans, type ActiveSeasonBansResponse, type BanListEntry } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  Normal:   "bg-zinc-700/60   text-zinc-200",
  Fire:     "bg-orange-900/60 text-orange-300",
  Water:    "bg-blue-900/60   text-blue-300",
  Electric: "bg-yellow-800/60 text-yellow-300",
  Grass:    "bg-green-900/60  text-green-300",
  Ice:      "bg-cyan-900/60   text-cyan-300",
  Fighting: "bg-red-900/60    text-red-300",
  Poison:   "bg-purple-900/60 text-purple-300",
  Ground:   "bg-amber-900/60  text-amber-300",
  Flying:   "bg-indigo-900/60 text-indigo-300",
  Psychic:  "bg-pink-900/60   text-pink-300",
  Bug:      "bg-lime-900/60   text-lime-300",
  Rock:     "bg-stone-700/60  text-stone-300",
  Ghost:    "bg-violet-900/60 text-violet-300",
  Dragon:   "bg-indigo-800/60 text-indigo-200",
  Dark:     "bg-zinc-800/60   text-zinc-300",
  Steel:    "bg-slate-700/60  text-slate-300",
  Fairy:    "bg-rose-900/60   text-rose-300",
};

function BanRow({ ban }: { ban: BanListEntry }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      {ban.sprite_url ? (
        <img src={ban.sprite_url} alt={ban.pokemon_name} className="w-14 h-14 object-contain flex-shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-muted flex-shrink-0" />
      )}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm leading-none">{ban.pokemon_name}</span>
          {ban.national_dex && (
            <span className="text-xs text-muted-foreground">#{String(ban.national_dex).padStart(4, "0")}</span>
          )}
        </div>
        {ban.pokemon_types && (
          <div className="flex gap-1 flex-wrap">
            {ban.pokemon_types.split(" / ").map((t) => (
              <Badge key={t} variant="secondary" className={`text-xs px-1.5 py-0 ${TYPE_COLORS[t] ?? ""}`}>
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BansPage() {
  const navigate = useNavigate();
  const token    = sessionStorage.getItem("bats_admin_token") ?? "";

  const [data,    setData]    = useState<ActiveSeasonBansResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUnauth = useCallback(() => {
    sessionStorage.removeItem("bats_admin_token");
    navigate("/admin");
  }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getBans(token));
    } catch {
      handleUnauth();
    } finally {
      setLoading(false);
    }
  }, [token, handleUnauth]);

  useEffect(() => { void load(); }, [load]);

  const bans     = data?.bans ?? [];
  const progress = data?.progress ?? null;

  return (
    <div className="flex flex-col gap-4 max-w-2xl w-full mx-auto">

      {/* Season header */}
      <div className="flex items-center justify-between">
        <div>
          {data?.season ? (
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{data.season.season_name}</h2>
              <Badge className="text-xs px-1.5 py-0 bg-emerald-900/60 text-emerald-300 border-0">Activa</Badge>
              <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${TYPE_COLORS[data.season.type_of_month] ?? ""}`}>
                {data.season.type_of_month}
              </Badge>
            </div>
          ) : (
            <h2 className="text-lg font-semibold text-muted-foreground">Sin temporada activa</h2>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.season
              ? "Cada jugador banea 1 pokémon de forma anónima."
              : "Activa una temporada desde la página de Temporadas."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : "↻"}
        </Button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/60 bg-muted/20">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Jugadores que han baneado</span>
              <span className="text-xs font-semibold tabular-nums">
                {progress.voted} / {progress.total}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: progress.total > 0 ? `${(progress.voted / progress.total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ban list */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Pokémon baneados</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {bans.length === 0
              ? "Ningún jugador ha registrado su ban aún."
              : `${bans.length} pokémon baneado${bans.length !== 1 ? "s" : ""} esta temporada`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>
          ) : bans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin bans registrados.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {bans.map((b) => <BanRow key={b.pokemon_name} ban={b} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
