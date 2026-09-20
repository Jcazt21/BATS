import { useState, useEffect } from "react";
import { UsernameStep } from "@/components/ban/UsernameStep";
import { SearchStep }   from "@/components/ban/SearchStep";
import { ConfirmDialog } from "@/components/ban/ConfirmDialog";
import { SuccessStep }  from "@/components/ban/SuccessStep";
import { loadAllPokemon, type PokeResult } from "@/lib/pokeapi";
import { submitBan } from "@/lib/api";

type Step = "username" | "search" | "success";

export function BanPage() {
  const [step, setStep]               = useState<Step>("username");
  const [username, setUsername]       = useState("");
  const [selected, setSelected]       = useState<PokeResult | null>(null);
  const [confirming, setConfirming]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-cargar lista de Pokémon en background al montar
  useEffect(() => { void loadAllPokemon(); }, []);

  function handleUsernameSuccess(user: string) {
    setUsername(user);
    setStep("search");
  }

  function handleSelect(pokemon: PokeResult) {
    setSelected(pokemon);
    setSubmitError(null);
    setConfirming(true);
  }

  function handleCancelConfirm() {
    setConfirming(false);
    setSelected(null);
  }

  async function handleConfirm() {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitBan({
        username,
        pokemon_name:  selected.displayName,
        pokemon_types: selected.types,
        sprite_url:    selected.sprite,
        national_dex:  selected.id,
      });
      setConfirming(false);
      setStep("success");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Error desconocido");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-4 py-12 bg-background">
      {/* Header mínimo — estilo Apple */}
      <header className="mb-10 text-center">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-1">
          PinchesGueys League
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Ban Phase
        </h1>
      </header>

      {/* Paso actual */}
      {step === "username" && (
        <UsernameStep onSuccess={handleUsernameSuccess} />
      )}

      {step === "search" && (
        <SearchStep onSelect={handleSelect} />
      )}

      {step === "success" && selected && (
        <SuccessStep pokemon={selected} />
      )}

      {/* Error de submit (fuera del diálogo) */}
      {submitError && (
        <p className="mt-4 text-sm text-destructive text-center max-w-xs">
          {submitError}
        </p>
      )}

      {/* Diálogo de confirmación */}
      {selected && (
        <ConfirmDialog
          pokemon={selected}
          open={confirming}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
          loading={submitting}
        />
      )}
    </main>
  );
}
