import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings2, Save, CheckCircle2 } from "lucide-react";

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input }     from "@/components/ui/input";
import { Button }    from "@/components/ui/button";
import { Skeleton }  from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import {
  getLeagueSettings, updateLeagueSettings,
  type LeagueSettings, type SeasonRestrictions, type RestrictionSpec,
} from "@/lib/api";
import { RestrictionField } from "@/components/RestrictionField";

const POKEMON_TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
  "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
  "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeagueSettingsPage() {
  const navigate = useNavigate();
  const token    = sessionStorage.getItem("bats_admin_token") ?? "";

  const [settings,  setSettings]  = useState<LeagueSettings | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Basic fields
  const [typeOfMonth,    setTypeOfMonth]    = useState("");
  const [maxTeamSize,    setMaxTeamSize]    = useState<number>(8);
  const [maxTeamChanges, setMaxTeamChanges] = useState<number>(4);

  // Restrictions: keyed map, populated from spec
  const [restrictions, setRestrictions] = useState<SeasonRestrictions>({});

  useEffect(() => {
    getLeagueSettings(token)
      .then((s) => {
        setSettings(s);
        setTypeOfMonth(s.type_of_month);
        setMaxTeamSize(s.max_team_size);
        setMaxTeamChanges(s.max_team_changes);
        setRestrictions(s.restrictions ?? {});
      })
      .catch(() => {
        sessionStorage.removeItem("bats_admin_token");
        navigate("/admin");
      })
      .finally(() => setLoading(false));
  }, [token, navigate]);

  function handleRestrictionChange(key: string, val: unknown) {
    setRestrictions((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateLeagueSettings(token, {
        type_of_month:    typeOfMonth,
        max_team_size:    maxTeamSize,
        max_team_changes: maxTeamChanges,
        restrictions,
      });
      setSettings(updated);
      setRestrictions(updated.restrictions ?? {});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const spec: Record<string, RestrictionSpec> = settings?.restriction_spec ?? {};

  return (
    <div className="flex flex-col gap-8 w-full max-w-xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Configuración de la liga</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Cargando…" : settings
              ? `Temporada activa: ${settings.season_name}`
              : "Sin temporada activa"
            }
          </p>
        </div>
        <Settings2 className="size-5 text-muted-foreground mt-0.5" />
      </div>

      {/* ── Basic rules ─────────────────────────────────────────────────────── */}
      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Equipo y rotaciones</CardTitle>
          <CardDescription className="text-xs">
            Límites estructurales de la temporada.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5 flex flex-col gap-5">
          {loading ? (
            <><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></>
          ) : (
            <>
              {/* Tipo del mes */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="type_of_month" className="text-xs font-medium">Tipo del mes</label>
                <select
                  id="type_of_month"
                  value={typeOfMonth}
                  onChange={(e) => setTypeOfMonth(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {POKEMON_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Tipo de pokémon restringido este mes.</p>
              </div>

              {/* Pokémon por equipo */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="max_team_size" className="text-xs font-medium">Pokémon por equipo</label>
                <Input
                  id="max_team_size"
                  type="number"
                  min={1}
                  max={20}
                  value={maxTeamSize}
                  onChange={(e) => setMaxTeamSize(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground">Pokémon máximos que cada jugador puede registrar.</p>
              </div>

              {/* Rotaciones permitidas */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="max_team_changes" className="text-xs font-medium">Rotaciones permitidas</label>
                <Input
                  id="max_team_changes"
                  type="number"
                  min={0}
                  max={20}
                  value={maxTeamChanges}
                  onChange={(e) => setMaxTeamChanges(Math.max(0, Math.min(20, Number(e.target.value))))}
                  className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground">Número de cambios de alineación activa permitidos por temporada.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Restrictions ────────────────────────────────────────────────────── */}
      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Restricciones de registro</CardTitle>
          <CardDescription className="text-xs">
            Reglas que se validan al registrar un equipo. Se pueden ampliar sin migraciones.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5 flex flex-col gap-5">
          {loading ? (
            <><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-8 w-full" /></>
          ) : Object.keys(spec).length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay restricciones configuradas para esta temporada.</p>
          ) : (
            Object.entries(spec).map(([key, s]) => (
              <RestrictionField
                key={key}
                rkey={key}
                spec={s}
                value={restrictions[key as keyof SeasonRestrictions]}
                onChange={handleRestrictionChange}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Save ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {saved && (
          <div className="flex items-center gap-2 rounded-md bg-emerald-900/20 border border-emerald-800/30 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="size-3.5 shrink-0" />
            Configuración guardada correctamente.
          </div>
        )}
        <Button
          onClick={() => void handleSave()}
          disabled={saving || !settings}
          className="self-end gap-1.5"
          size="sm"
        >
          <Save className="size-3.5" />
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
