import { defineConfig } from 'vitest/config';

// Tests del motor de Arena. El frontend tiene su propia configuración en web/.
export default defineConfig({
  test: {
    include: ['motor/test/**/*.test.ts'],
  },
});
