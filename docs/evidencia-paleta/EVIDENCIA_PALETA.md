# Evidencia — paleta "Tipo del mes vivo"

Plan: [PLAN_PALETA.md](../../PLAN_PALETA.md). Lecturas hechas con `getComputedStyle` en Claude in Chrome (localhost:5173).

## Antes (F0) — paleta Apple HIG, commit 5c5a029

| Token | Claro | Oscuro |
|---|---|---|
| `--primary` | oklch(0.55 0.2 258) | oklch(0.7 0.16 255) |
| `--background` | oklch(0.968 0.003 264) | oklch(0.13 0.004 264) |
| `--card` | oklch(1 0 0) | oklch(0.185 0.005 264) |
| `--foreground` | oklch(0.2 0.01 264) | oklch(0.97 0.003 264) |

Home (escritorio, claro): fondo gris-azulado, tarjeta de bienvenida y botón "Entrar" en azul sistema.
Línea base de pruebas: `npx vitest run` → 440 pasan. (Capturas: se vieron en la conversación; no se guardaron como archivo.)

## Después (F1–F5, rama `redesign-2.0`)

| Token | Claro | Oscuro |
|---|---|---|
| `--background` | oklch(0.962 0.012 85) | oklch(0.16 0.012 50) |
| `--card` | oklch(0.985 0.007 85) | oklch(0.205 0.014 50) |
| `--foreground` | oklch(0.22 0.03 45) | oklch(0.95 0.012 85) |
| `--primary` (sin mes) | oklch(0.5 0.18 27) laca | oklch(0.72 0.18 27) |
| `--primary` (mes `ice`) | oklch(0.55 0.08 210) | oklch(0.8 0.08 210) |

### Contraste leído en vivo (canvas → sRGB, WCAG)
| Tema | Mes | texto/primary | primary/fondo | primary/card |
|---|---|---|---|---|
| claro | laca | 6.6 | 5.91 | 6.33 |
| claro | ice | 4.7 | 4.21 | 4.51 |
| claro | fire | 4.64 | 4.16 | 4.45 |
| claro | grass | 4.74 | 4.24 | 4.54 |
| claro | electric | 4.59 | 4.11 | 4.4 |
| claro | dark | 10.95 | 9.81 | 10.5 |
| oscuro | laca / ice / fire / grass / electric | 7.16 / 10.65 / 6.77 / 7.75 / 10.42 | = texto/primary | ≥ 6.28 |

Los 18 tipos × 2 temas se verifican en `web/src/styles/tokens.test.ts` (texto/acento ≥ 4.5, acento/fondo y /card ≥ 3).

### Comprobado en el navegador (Claude in Chrome, 1280 px)
- ✅ Carga en frío: `<html data-month-type="ice">` lo pone `MonthTheme` desde la temporada activa (API real) y queda en `localStorage`; botón primario en turquesa hielo (oscuro).
- ✅ Claro + `fire`: fondo papel cálido, botón primario naranja-rojo, textos legibles.
- ✅ Home y Stats en claro y oscuro con fondos cálidos (no gris-azulado). Consola sin errores ni avisos.

### Desviaciones del plan y límites
- **No verificable con la extensión:** viewport 390 px (`resize_window` no cambió el viewport de la pestaña), `prefers-contrast`/`reduced-transparency`, foco con Tab, GIFs. Las capturas se vieron en la conversación y no se guardaron como archivo. La matriz completa de F6 (Equipo, Pokédex, Bans, Jugador, Blog × viewports) **queda pendiente de revisión manual** (encaja con P12).
- **Acento claro del mes:** L/C del acento no son los del `--type-*`: con `primary/fondo ≥ 3` los tipos luminosos (eléctrico, hada, hielo…) quedan más oscuros que su etiqueta; en claro solo `ground` usa texto tinta, el resto texto blanco; en oscuro todos usan tinta.
- **chart-2 ya no es laca** (la laca es `chart-1` por defecto): 2 oro, 3 brasa, 4 glaciar, 5 uva, 6 verde LCD (≥50 % de win rate).
- **Avatar tono 1:** las iniciales usan `text-foreground` (el acento del mes no garantiza 4.5:1 sobre su propio tinte `/15`).
- `--ring` es ahora el acento opaco (antes alfa .55) para cumplir ≥ 3:1 en foco.
- `impeccable detect` no se ejecutó.

## Pilar de luz como fondo de Inicio (añadido después de F5)
`HomePillar` + `LightPillar` (React Bits, portado a TS). Oscuro + movimiento + WebGL2 + puntero fino; si no, degradado estático con el acento. Chunk aparte (~5.5 kB gzip).
- ✅ Comprobado en Chrome (Apple M5) con `ice`, `fire` y `electric`: el pilar y el acento cambian con el mes; texto legible sobre el efecto; sin rectángulo de fondo.
- Bugs que salieron en la verificación (ambos con test): StrictMode dejaba el contexto WebGL perdido (pilar en blanco + icono de canvas roto) y un `mix-blend-mode: screen` dentro de un grupo enmascarado pintaba un rectángulo negro.
- Fondo fijo a pantalla completa (`fixed inset-0 -z-10`, se atenúa hacia abajo), calidad `low`. Medido en Chrome/Apple M5: 120 FPS con scroll; texto de secciones legible.
- No medido: gamas bajas, móvil y claro (no se monta por diseño).
