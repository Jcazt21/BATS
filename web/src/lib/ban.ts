/**
 * Umbral del Ban Radar: win rate por encima del cual un pokémon es candidato a ban.
 * Lo fija el servidor en la vista `mv_ban_candidates` (bats_core/api/routes/ban.py); aquí solo
 * se muestra, así que si cambia allí hay que cambiarlo aquí, en un único sitio.
 */
export const BAN_RADAR_THRESHOLD_PCT = 70;
