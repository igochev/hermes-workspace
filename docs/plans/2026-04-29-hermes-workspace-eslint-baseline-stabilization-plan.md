# Hermes Workspace — ESLint Baseline Stabilization Plan

> **For Hermes:** Use `test-driven-development` and `systematic-debugging` where practical. This is a quality/stabilization cycle after the TypeScript baseline was made green at commit `840a67e`; do not add product features. Builder should execute task-by-task, update `docs/handoff/current-slice-status.md` after each completed task, and stop for Main/CEO review if a lint fix would require product-behavior changes instead of mechanical cleanup.

## 1. CEO decision / why this is next

The TypeScript Baseline Stabilization package is accepted and committed at `840a67e`:

- `pnpm exec tsc --noEmit --pretty false` exits `0`.
- `pnpm vitest run` passes: 79 files / 509 tests.
- `pnpm build` passes with existing Vite chunk/dynamic-import warnings.
- Service/root smoke and live Executions fallback browser smoke pass.
- Independent review found no security, product, or merge blockers.

The next trust gate is repo-wide ESLint. Main/CEO ran:

```bash
pnpm exec eslint . --max-warnings=0 > /tmp/hermes-workspace-eslint-baseline-after-tsc.txt 2>&1
```

Result: exit `1`, 1,721 output lines, 249 files with lint output. This means `tsc` is now a hard gate again, but ESLint is still too noisy to use as an autonomous merge gate.

CEO decision: before another product feature cycle, run **ESLint Baseline Stabilization** so future Builder slices can rely on both typecheck and lint as hard gates.

## 2. Current ESLint baseline snapshot

Raw output captured by Main/CEO:

- File: `/tmp/hermes-workspace-eslint-baseline-after-tsc.txt`
- Command: `pnpm exec eslint . --max-warnings=0`
- Exit: `1`
- Output lines: `1,721`
- Files with lint output: `249`

Top rule families parsed from the baseline:

| Count | Severity | Rule |
|---:|---|---|
| 311 | error | `@typescript-eslint/no-unnecessary-condition` |
| 286 | error | `@typescript-eslint/array-type` |
| 125 | error | `import/consistent-type-specifier-style` |
| 109 | error | `sort-imports` |
| 95 | error | `import/order` |
| 83 | error | `import/first` |
| 69 | warning | `no-shadow` |
| 51 | warning | `@typescript-eslint/require-await` |
| 23 | error | `no-useless-escape` |
| 19 | error | `@typescript-eslint/no-unnecessary-type-assertion` |
| 11 | error | `react-hooks/exhaustive-deps` missing rule/plugin references |
| 9 | error | `prefer-const` |
| 7 | error | `@typescript-eslint/consistent-type-imports` |
| 4 | error | `import/no-duplicates` |

Immediate config/friction issues observed before source-code cleanup:

- `.eslintignore` warning: ignored file is no longer supported by this ESLint version; ignores should live in `eslint.config.js`.
- Parse errors for JS files not included in `parserOptions.project`:
  - `public/sw.js`
  - `scripts/generate-pwa-icons.js`
  - `server-entry.js`
- Some files still contain inline `react-hooks/exhaustive-deps` disable comments, but that rule is not registered in the current ESLint setup.

Top error files in the baseline:

```text
src/screens/chat/chat-screen.tsx — 70
src/screens/gateway/conductor.tsx — 39
src/screens/gateway/hooks/use-conductor-gateway.ts — 39
src/screens/gateway/components/hub-utils.tsx — 35
src/screens/gateway/components/run-console.tsx — 27
src/screens/gateway/components/agent-output-panel.tsx — 23
src/server/work-item-launch.ts — 23
src/stores/mission-store.ts — 23
src/components/agent-view/agent-view-panel.tsx — 22
src/screens/gateway/hooks/use-mission-orchestrator.ts — 22
src/screens/chat/components/chat-message-list.tsx — 19
src/screens/agents/hooks/use-operations.ts — 18
src/routes/settings/index.tsx — 17
src/screens/gateway/components/cost-analytics.tsx — 16
src/screens/gateway/components/hub-constants.tsx — 16
src/routes/api/send-stream.ts — 15
```

## 3. Non-negotiables

- No product features in this cycle.
- No broad rule weakening just to make the command green. If a rule is wrong for this repo, document the reason and scope the config change narrowly.
- Prefer mechanical safe fixes over behavior changes.
- Do not silence `@typescript-eslint/no-unnecessary-condition` by adding fake nullability or `as any`.
- Do not change runtime behavior when fixing imports, array type syntax, duplicate imports, `prefer-const`, or type-only import style.
- Preserve TypeScript green status: `pnpm exec tsc --noEmit --pretty false` must remain exit `0` after each task family.
- Preserve all Mission Control safety invariants:
  - true partial-update safety for `/api/work-items/$workItemId` PATCH;
  - Scheduled Jobs vs Executions terminology;
  - Morning Review remains read-only;
  - single-lane autonomy remains default; no hidden parallel worktrees.
- Keep final lint evidence durable under `dogfood-output/`.

## 4. Implementation tasks

### Task 1 — Create a durable ESLint baseline report and parser

Files:

- Create: `dogfood-output/eslint-baseline-stabilization-YYYY-MM-DDTHH-MM-SSZ.md`
- Update alias: `dogfood-output/eslint-baseline-stabilization-latest.md`
- Optional helper: `scripts/parse-eslint-baseline.mjs` or a one-off documented command if no script is needed
- Update: `docs/handoff/current-slice-status.md`

Steps:

1. Run JSON-formatted lint baseline without `--max-warnings=0` first so warnings and errors are counted separately:

```bash
pnpm exec eslint . --format json > /tmp/hermes-workspace-eslint-baseline.json
```

2. Run the hard gate too:

```bash
pnpm exec eslint . --max-warnings=0 > /tmp/hermes-workspace-eslint-baseline-hard.txt 2>&1
```

3. Parse counts by severity, rule, and file. Record:
   - total files with messages;
   - total errors;
   - total warnings;
   - top 20 rules;
   - top 20 files;
   - config-level failures separately from source-code failures.
4. Write the durable report and update the alias.
5. Update handoff with the report path and next task.

Acceptance:

- Report exists and gives Builder an exact error-family order.
- The report distinguishes config/parser failures from source lint errors.
- No source behavior changed in this task.

### Task 2 — Fix ESLint configuration friction before source cleanup

Likely files:

- `eslint.config.js`
- `.eslintignore` (possibly remove after migrating ignores)
- `package.json` only if an existing plugin dependency is missing and already intended by inline comments
- Source files only for stale inline disables if config says the rule is intentionally absent

Objective: make `pnpm exec eslint .` run as a trustworthy repository command instead of failing on unsupported ignore format, JS parser-project mismatch, or missing rule references.

Steps:

1. Inspect current `eslint.config.js`, `.eslintignore`, `package.json`, and the 11 `react-hooks/exhaustive-deps` disable references.
2. Choose the narrowest safe fix:
   - migrate `.eslintignore` patterns into `eslint.config.js` `ignores`, or remove `.eslintignore` only after patterns are represented;
   - either add a JS-file override for `public/sw.js`, `scripts/generate-pwa-icons.js`, `server-entry.js`, or explicitly ignore generated/runtime JS files if they are not TypeScript source gate inputs;
   - for `react-hooks/exhaustive-deps`, either install/configure the intended plugin if already present in project direction, or remove stale disable comments when the rule is not active.
3. Run:

```bash
pnpm exec eslint . --format json > /tmp/hermes-workspace-eslint-after-config.json
pnpm exec eslint . --max-warnings=0 > /tmp/hermes-workspace-eslint-after-config-hard.txt 2>&1
pnpm exec tsc --noEmit --pretty false
```

Acceptance:

- No parser-project errors for the three JS files.
- No `Definition for rule 'react-hooks/exhaustive-deps' was not found` errors.
- `.eslintignore` warning is gone or explicitly classified if impossible to remove safely.
- `tsc --noEmit` remains green.

### Task 3 — Mechanical import/type-style cleanup

Likely error families:

- `import/consistent-type-specifier-style`
- `@typescript-eslint/consistent-type-imports`
- `import/first`
- `import/no-duplicates`
- `import/order`
- `sort-imports`

Objective: reduce the largest safe formatting/style families without changing behavior.

Steps:

1. Run ESLint with `--fix` only for import/style rules if the config supports it, but inspect the diff before keeping it:

```bash
pnpm exec eslint . --fix --rule '@typescript-eslint/no-unnecessary-condition: off' --rule '@typescript-eslint/array-type: off' --rule '@typescript-eslint/no-unnecessary-type-assertion: off' --rule 'no-useless-escape: off' --rule 'prefer-const: off'
```

If this command is too broad or the rule override syntax does not behave as expected, revert and fix by file groups from the baseline report.

2. Keep only mechanical changes:
   - import statements moved/reordered;
   - duplicate imports merged;
   - inline type specifiers split to top-level type imports;
   - type-only imports converted where unambiguous.
3. Do not keep changes that alter runtime code, hook dependencies, component state, or data flow.
4. Verify:

```bash
pnpm exec eslint . --format json > /tmp/hermes-workspace-eslint-after-imports.json
pnpm exec tsc --noEmit --pretty false
pnpm vitest run
```

Acceptance:

- Import/type-style error families are reduced to zero or remaining exceptions are explicitly listed with reasons.
- `tsc` and full tests remain green.

### Task 4 — Mechanical syntax cleanup

Likely error families:

- `@typescript-eslint/array-type`
- `prefer-const`
- `no-useless-escape`
- `@typescript-eslint/no-unnecessary-type-assertion`

Objective: fix syntax-level errors that should not change product behavior.

Steps:

1. Apply `--fix` narrowly where safe:

```bash
pnpm exec eslint . --fix --rule '@typescript-eslint/no-unnecessary-condition: off' --rule 'import/order: off' --rule 'sort-imports: off'
```

2. Inspect the diff. Keep only:
   - `Type[]` → `Array<Type>` conversions required by the repo rule;
   - `let` → `const` where reassignment does not happen;
   - unnecessary escapes removed from string/regex literals without changing matching semantics;
   - no-op type assertions removed when TypeScript agrees.
3. Run focused tests for any touched runtime-heavy areas; if broad files are touched, run full tests.
4. Verify:

```bash
pnpm exec eslint . --format json > /tmp/hermes-workspace-eslint-after-syntax.json
pnpm exec tsc --noEmit --pretty false
pnpm vitest run
```

Acceptance:

- These mechanical syntax families are zero or explicitly classified.
- `tsc` and full tests remain green.

### Task 5 — No-unnecessary-condition cleanup by product area

Primary family:

- `@typescript-eslint/no-unnecessary-condition` — 311 errors in Main's baseline.

Objective: clear unnecessary optional chains/conditionals without weakening types or changing behavior.

Order:

1. Mission Control server/work-item core:
   - `src/server/work-item-launch.ts`
   - `src/server/work-item-planning.ts`
   - `src/server/hermes-job-output.ts`
   - `src/server/attention-queue.ts`
   - adjacent tests if touched
2. Chat/session/operator shell:
   - `src/screens/chat/chat-screen.tsx`
   - `src/screens/chat/components/chat-message-list.tsx`
   - `src/screens/chat/components/chat-sidebar.tsx`
3. Legacy gateway/agent-swarm surfaces:
   - `src/screens/gateway/**`
   - `src/components/agent-view/**`
   - `src/stores/mission-store.ts`
4. Settings/terminal/remaining UI components.

Steps per file group:

1. Read the types around each lint error.
2. Remove optional chains or conditionals only when the type guarantees non-null.
3. If runtime data can actually be null despite the type, fix the type/model contract instead of silencing the lint rule.
4. Add or update tests only when a conditional removal touches product-visible branching.
5. Run targeted tests for touched areas, then:

```bash
pnpm exec eslint <touched-files>
pnpm exec tsc --noEmit --pretty false
```

Acceptance:

- `no-unnecessary-condition` errors are zero, or any remaining items are documented as needing a type-contract decision from Main/CEO.
- No `as any` or fake-nullability workaround is introduced.

### Task 6 — Warning policy and final hard gate

Remaining likely warnings:

- `no-shadow`
- `@typescript-eslint/require-await`

Objective: decide and enforce whether warnings should block autonomous merge readiness.

Steps:

1. Inspect remaining warnings after Tasks 2–5.
2. Fix warnings mechanically where safe:
   - rename inner variables for `no-shadow`;
   - remove `async` where no await is needed, unless framework/API requires async function shape.
3. If a framework route handler intentionally stays async without await, prefer a narrow inline explanation over broad rule disabling.
4. Run final gates:

```bash
pnpm exec eslint . --max-warnings=0
pnpm exec tsc --noEmit --pretty false
pnpm vitest run
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke-eslint-stabilization.html
```

Live browser smoke:

- `/dashboard` renders Mission Control / Morning Review surfaces.
- `/projects` renders project links.
- `/executions?jobId=missing&workItemId=some-id` still shows project-context warning and no invalid `/work-items/some-id` link.

Final report:

- Write `dogfood-output/eslint-baseline-stabilization-final-YYYY-MM-DDTHH-MM-SSZ.md`.
- Update alias `dogfood-output/eslint-baseline-stabilization-final-latest.md`.
- Update `docs/handoff/current-slice-status.md` with PASS/FAIL and exact remaining blockers.

Acceptance:

1. `pnpm exec eslint . --max-warnings=0` exits `0`.
2. `pnpm exec tsc --noEmit --pretty false` exits `0`.
3. Full tests pass.
4. Build passes.
5. `git diff --check` passes.
6. Service/root smoke passes.
7. Browser smoke confirms Dashboard, Projects, and Executions fallback remain healthy.
8. Durable final report and handoff are updated.

## 5. Stop/escalation rules

Builder should stop and ask Main/CEO for review if:

- clearing a lint error requires changing product behavior, not just removing redundant code;
- a rule appears incompatible with project architecture and would require config policy changes;
- `pnpm exec tsc --noEmit --pretty false` becomes red after a lint cleanup;
- full tests reveal a behavior regression;
- the diff becomes too broad to review safely in one cycle.

## 6. Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, then this active plan, and start with Task 1.
