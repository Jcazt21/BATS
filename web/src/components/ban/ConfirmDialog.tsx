import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import type { PokeResult } from "@/lib/pokeapi";

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

interface Props {
  pokemon: PokeResult;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({ pokemon, open, onConfirm, onCancel, loading }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-xs">
        <AlertDialogHeader className="items-center text-center gap-2">
          <img
            src={pokemon.sprite}
            alt={pokemon.displayName}
            className="w-24 h-24 object-contain mx-auto"
          />

          <AlertDialogTitle className="text-lg font-semibold tracking-tight">
            ¿Banear a {pokemon.displayName}?
          </AlertDialogTitle>

          <div className="flex gap-1.5 justify-center flex-wrap">
            {pokemon.types.split(" / ").map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className={`text-xs px-2 ${TYPE_COLORS[t] ?? ""}`}
              >
                {t}
              </Badge>
            ))}
          </div>

          <AlertDialogDescription className="text-sm text-muted-foreground">
            Esta acción no se puede deshacer. Solo puedes registrar un ban.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Registrando…" : "Confirmar ban"}
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={onCancel}
            disabled={loading}
            className="w-full mt-0"
          >
            Cancelar
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
