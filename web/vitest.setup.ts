import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Desmonta el árbol de React entre tests: si no, los componentes montados en un
// `render()` anterior siguen en el DOM y las queries de Testing Library ambiguan.
afterEach(cleanup);
