# Arena · pendientes de las fases 0 y 1 (a cargo del dueño)

Actualizado: 2026-11-17. El avance oficial vive en `PLAN_BATALLAS_NATIVAS.md` (sección "Estado de la ejecución").

## Fase 0 · Cimientos (fusionada a `main` el 2026-11-16)

El código está completo. Falta la puerta **[HUMANO]**:

- [ ] **F0.8 · Entornos.**
  - [ ] Crear el proyecto Supabase `bats-staging` (opcional, recomendado) y las variables *Preview* de Vercel apuntando a él.
  - [ ] Definir `BATS_ARENA_MODE=off` en Vercel.
  - [ ] Definir `BATS_MOTOR_TOKEN` en Vercel.
- [ ] **Comparar el bundle de `api/index`** con el de producción actual (en el preview pesó 78,39 MB). No debe haber crecido.
- [ ] **`GET /api/motor/health` en producción** tras el despliegue: debe responder `ok: true`. Anotar en la Bitácora del plan el arranque en frío, el caliente y el tamaño de cada función (`api/motor` pesó 2,98 MB en el preview).
- [ ] Comprobar que el sitio sigue igual (inicio, stats, equipo, login) y que `/api/health` responde.
- [ ] Marcar la puerta de la fase 0 en la tabla de estado del plan.

## Fase 1 · Núcleo del motor (PR #10, abierto, sin fusionar)

El código (F1.1 a F1.13) está completo y verificado: 193 tests, las 13 doradas y la propiedad con 200 batallas (`MOTOR_PROPIEDAD=200`, 575 s).

- [ ] **Ver una batalla de principio a fin:** `npm run motor:partida -- --seed 7` y confirmar que se lee bien. Es el punto **[HUMANO]** de la puerta.
- [ ] **Revisar y fusionar el PR #10** (https://github.com/Jcazt21/BATS/pull/10) con **merge commit** (`--no-ff`), no squash.
- [ ] **Marcar la puerta de la fase 1** en la tabla de estado del plan (hoy está en 🟡).

## Decisiones abiertas que salieron de la fase 1

Detalle en la Bitácora del plan (entrada del 2026-11-17).

- [ ] **Equipos reales vs reglas del plan (antes de la fase 3, decisión A1).** 9 de los 26 equipos de las doradas incumplen la Item Clause o "un solo restringido" con la cadena de reglas del apéndice A (por ejemplo, Zacian + Volcanion en dorada-03/04/05 p2). Decidir si la liga los permitió por otra vía o si las reglas del plan son más estrictas que las reales.
- [ ] **Posición de `|-message|X forfeited.` respecto de `|win|`.** Lo puse después; no había logs de PS en disco para confirmarlo. Si tienes un log real de rendición, compara el orden.
- [ ] **Fase 2:** no verificar el `logHash` (ni rejugar) las batallas en `finished` o `aborted`, porque el mensaje añadido a mano de rendición/inactividad entra en el hash y un rejuego no lo produce.

## Cosas sueltas

- `web/package-lock.json` está modificado en el árbol de trabajo desde antes de empezar la fase 1. No lo toqué; decide si se commitea o se descarta.
- SSH a GitHub no funciona: la clave `~/.ssh/id_ed25519` no está registrada en la cuenta (el push por HTTPS sí funcionó el 2026-11-17).
