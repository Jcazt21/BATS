# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Motion

Tokens en `src/styles/tokens.css` (úsalos en vez de valores sueltos):

| Token | Valor | Uso |
| --- | --- | --- |
| `--ease-ios` | `cubic-bezier(0.32, 0.72, 0, 1)` | hojas, popovers, indicadores |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | entradas y hover |
| `--duration-fast` | 120ms | salidas, feedback de press |
| `--duration-base` | 200ms | transiciones por defecto |
| `--duration-slow` | 300ms | máximo para UI |

`src/styles/motion-guard.test.ts` lee el código y falla si reaparece `transition-all`, `ease-in`, `scale(0)`/`zoom-in-0` o `duration-500`+. Las violaciones pendientes están en `EXCEPCIONES` (una por archivo, con su TODO); cada paquete de `PLAN_REDESIGN_2.0.md` borra la suya. Sidebar y admin quedan fuera.

Helpers de test en `src/lib/test-utils.tsx`: `renderWithProviders` y `mockReducedMotion` (+ `restoreMatchMedia` en `afterEach`). Vitest vacía los `.css` importados, así que las guardas de fuente los leen del disco con `src/styles/source.ts`.
