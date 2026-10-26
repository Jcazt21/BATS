import { ApiError, errorMessage } from "@/lib/http";

/**
 * Traduce los códigos de regla de bats_core/rules.py::check_team y de los
 * endpoints de equipo (HTTP 422, `detail` = código como "missing_color:red")
 * a mensajes legibles en español.
 */

/** Une los nombres separados por coma en una lista legible. */
function names(rest: string): string {
  return rest
    .split(",")
    .map((s) => s.trim())
    .join(", ");
}

/** Devuelve el mensaje en español para un código de regla, o null si no se reconoce. */
export function describeRuleCode(code: string): string | null {
  const idx = code.indexOf(":");
  const prefix = idx < 0 ? code : code.slice(0, idx);
  const rest = idx < 0 ? "" : code.slice(idx + 1);

  switch (prefix) {
    case "missing_color":
      return `Te falta un pokémon de color ${rest}.`;
    case "missing_generation":
      return `Te falta un pokémon de la generación ${rest}.`;
    case "missing_egg_group":
      return `Te falta un pokémon del Egg Group ${rest}.`;
    case "missing_type":
      return `Te falta un pokémon de tipo ${rest}.`;
    case "item_clause":
      return `Hay objetos repetidos: ${names(rest)}.`;
    case "not_legal":
      return `No son legales en la liga: ${names(rest)}.`;
    case "ultra_beast":
      return `Las Ultra Beasts no están permitidas: ${names(rest)}.`;
    case "banned":
      return `Hay pokémon baneados en tu equipo: ${names(rest)}.`;
    case "max_paradox":
      return maxMessage(rest, "Paradox");
    case "max_pseudo_legendary":
      return maxMessage(rest, "pseudo-legendarios");
    case "max_restricted":
      return maxMessage(rest, "legendarios restringidos");
    case "unknown_species":
      return `No reconocemos estas especies: ${names(rest)}.`;
    case "species_mismatch":
      return "No se puede cambiar la especie al editar un set: usa Reemplazar.";
    case "registration_closed":
      return "El registro está cerrado: ya no se pueden hacer cambios.";
    case "roster_locked":
      return "Tu equipo está bloqueado: ya no se pueden hacer cambios.";
    case "not_in_whitelist":
      return "Tu cuenta no está en esta temporada. Habla con el administrador.";
    default:
      return null;
  }
}

/** Mensaje para los límites máximos; `rest` tiene la forma "llevas/máximo". */
function maxMessage(rest: string, label: string): string {
  const [count, max] = rest.split("/");
  return `Llevas ${count} ${label} y el máximo es ${max}.`;
}

/** Mensaje presentable para un error de guardado de equipo. */
export function teamErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status < 500) {
    const translated = describeRuleCode(e.detail);
    if (translated !== null) return translated;
  }
  return errorMessage(e);
}
