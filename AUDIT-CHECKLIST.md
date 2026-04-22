# AUDIT-CHECKLIST — slam-mcp

Pre-merge testing audit for the `slam-mcp` standalone npm package.
No Obsidian Brain dependency. No pnpm workspaces. Run from the project root.

---

## Project Facts

| Item | Value |
|------|-------|
| Package manager | npm |
| Test command | `npm test` |
| Coverage command | `npm run test:coverage` |
| Test framework | Vitest 3 + @vitest/coverage-v8 |
| Test style | e2e only (in-memory MCP server + fixture SQLite DB) |
| Config file | `vitest.config.ts` |
| Covered source | `src/**/*.ts` |
| Test files | `e2e/**/*.test.ts` |

---

## Gate Definitions

### T1 — Coverage Thresholds

Run `npm run test:coverage`. Thresholds are configured in `vitest.config.ts`.

| Metric | Threshold |
|--------|-----------|
| Lines | ≥ 65% |
| Functions | ≥ 45% |
| Branches | ≥ 35% |
| Statements | ≥ 65% |

**T1 PASS:** All four metrics meet or exceed their threshold (Vitest exits 0).
**T1 FAIL:** Any metric falls below threshold (Vitest exits non-zero with threshold error lines).

**Calibration rule:** If any actual metric exceeds its threshold by 10+ points, raise that
threshold to (actual − 5) in `vitest.config.ts` and record the calibration in Audit History.
Initial measurement on 2026-04-22: lines=88.41%, functions=79.31%, branches=39.32%, statements=88.41%.
Branches threshold set to 35 (actual - 5). Lines/functions/statements left conservative for growth room.

### T2 — Skip Discipline

```bash
grep -rn "it\.skip\|test\.skip\|describe\.skip" e2e/
```

**T2 PASS:** Zero results, OR every result has an inline comment explaining why.
**T2 FAIL:** Any skip without an explanation comment and without prior Audit History approval.
**Grandfathered skips:** None at project inception.

### T3 — New Modules Without Tests

```bash
git diff <last-baseline-tag>...HEAD --name-only | grep "^src/.*\.ts$"
```

For each new `.ts` file in `src/tools/` or `src/lib/`:

**T3 PASS:** Every new tool file is exercised by at least one `e2e/scenarios/*.test.ts`.
Pure infrastructure files (barrels, type-only) are exempt.
**T3 FAIL:** A new `src/tools/*.ts` has no e2e scenario and is not documented in Tech Debt below.

---

## Pre-Merge Checklist

### 1. Tests pass

```bash
npm test
```

- [ ] Tests: ___ passed / ___ failed / ___ skipped

### 2. Coverage (T1)

```bash
npm run test:coverage
```

- [ ] Lines: ___% (≥ 65%)
- [ ] Functions: ___% (≥ 45%)
- [ ] Branches: ___% (≥ 35%)
- [ ] Statements: ___% (≥ 65%)
- [ ] T1: PASS / FAIL

### 3. Skip discipline (T2)

```bash
grep -rn "it\.skip\|test\.skip\|describe\.skip" e2e/
```

- [ ] Skips found: ___
- [ ] T2: PASS / FAIL

### 4. New modules (T3)

```bash
git diff <last-baseline>...HEAD --name-only | grep "^src/.*\.ts$"
```

- [ ] New tool files: ___
- [ ] All exercised or documented: YES / NO
- [ ] T3: PASS / FAIL

### 5. Type check

```bash
npm run typecheck
```

- [ ] TypeScript: PASS / FAIL

### 6. Build

```bash
npm run build
```

- [ ] Build: PASS / FAIL

---

## Tech Debt — Documented Coverage Gaps

_T3 exemptions. Each entry must include date added and rationale._

| Tool / Module | Date Added | Rationale |
|---------------|------------|-----------|
| _(none at inception)_ | — | — |

---

## Findings Taxonomy

| Bucket | Use When |
|--------|----------|
| **Prevented** | An existing test caught a regression before merge |
| **Regression** | A previously-passing test is now failing |
| **New Category** | A gap not covered by any existing checklist item |
| **Deeper** | A gap that is a symptom of an architectural issue |

Known gaps in Tech Debt → **Deeper**. New failures not previously tracked → **New Category**.

---

## Audit History

_Append a row after every audit. Never delete or modify existing rows._

| Date | Baseline / Branch | Summary | Verdict |
|------|-------------------|---------|---------|
| 2026-04-22 | inception (pre-baseline) | Checklist created. T1/T2/T3 gates defined. Initial measurement: lines=88.41%, functions=79.31%, branches=39.32%, statements=88.41%. Branches threshold set to 35 (actual−5). | — initial entry — |
