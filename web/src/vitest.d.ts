// Amplía `expect` de vitest con los matchers de jest-dom (toBeInTheDocument, etc.)
// para los tests bajo src/. El runtime se registra en vitest.setup.ts.
import "@testing-library/jest-dom/vitest";
