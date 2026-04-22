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
      // Calibrated thresholds — updated 2026-04-22 after Task 3 (customers-extended).
      //
      // Initial measured values (pre-Task 3): lines=88.39%, functions=79.31%, branches=39.43%, statements=88.39%
      // Post-Task 3 measured values (80 tests): lines=89.52%, functions=79.31%, branches=42.46%, statements=89.52%
      //
      // Calibration rule: if actual exceeds threshold by 10+ points, raise to (actual - 5).
      // - lines: 89.52% actual, was 65% threshold (gap=24.5) → raised to 84
      // - functions: 79.31% actual, was 45% threshold (gap=34.3) → raised to 74
      // - branches: 42.46% actual, 35% threshold (gap=7.5) → no change (< 10 pts)
      // - statements: 89.52% actual, was 65% threshold (gap=24.5) → raised to 84
      // ---------------------------------------------------------------------------
      thresholds: {
        lines: 84,
        functions: 74,
        branches: 35,
        statements: 84,
      },
    },
  },
});
