import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom no trae matchMedia: sin esto cualquier componente que lo consulte (Meter, ResponsiveSheet,
// useMediaQuery…) revienta en tests. Un test que necesite otro valor usa `mockReducedMotion` o stubGlobal.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// Desmonta el árbol de React entre tests: si no, los componentes montados en un
// `render()` anterior siguen en el DOM y las queries de Testing Library ambiguan.
afterEach(cleanup);
