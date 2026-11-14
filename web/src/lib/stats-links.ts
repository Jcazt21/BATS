import type { SeasonChoice } from "@/components/app/SeasonSelect";

/** Ficha de estadísticas de una especie, con la misma temporada que la lista de origen ("active" = la activa). */
export const fichaHref = (species: string, temporada: SeasonChoice = "active") =>
  `/stats/pokemon/${encodeURIComponent(species)}${temporada === "active" ? "" : `?temporada=${temporada}`}`;
