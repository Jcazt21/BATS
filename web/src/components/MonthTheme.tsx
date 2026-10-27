import { useEffect } from "react";
import { useActiveSeason } from "@/lib/queries";
import { aplicarMes, guardarMes, mesDeTipo } from "@/lib/month";

/**
 * Acento de la app = tipo del mes de la temporada activa. No renderiza nada. Sin datos
 * (cargando o error) conserva lo que haya; con temporada sin tipo válido vuelve a la laca.
 * Sin transición: cambia ~1 vez al mes.
 */
export function MonthTheme() {
  const { data } = useActiveSeason();
  const cargada = data !== undefined;
  const tipo = mesDeTipo(data?.type_of_month);

  useEffect(() => {
    if (!cargada) return;
    aplicarMes(tipo);
    guardarMes(tipo);
  }, [cargada, tipo]);

  useEffect(() => () => aplicarMes(null), []);
  return null;
}
