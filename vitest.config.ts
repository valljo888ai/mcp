import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ is excluded from tsconfig.json — Vitest needs its own include pattern.
    include: ["e2e/**/*.test.ts"],

    // isolate: true ensures the session singleton (src/lib/session.ts) resets
    // cleanly between test files. gate.test.ts requires an uninitialized session.
    isolate: true,

    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "dist/**", "e2e/**"],
      reporter: ["text", "lcov", "html"],

      // ---------------------------------------------------------------------------
      // Conservative thresholds — set before first measurement (2026-04-22).
      //
      // CALIBRATION NOTE: After Tasks 3 and 4 add new tests, run
      // `npm run test:coverage` and check actual percentages. If any actual
      // metric exceeds its threshold by 10+ points, raise it to (actual - 5)
      // and update this comment with measured values and date.
      // ---------------------------------------------------------------------------
      thresholds: {
        lines: 65,
        functions: 45,
        branches: 55,
        statements: 65,
      },
    },
  },
});
