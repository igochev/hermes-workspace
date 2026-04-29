# Hermes Workspace — ESLint Baseline Stabilization Report

Generated: 2026-04-29T16:08:29.853Z

## Commands

```bash
pnpm exec eslint . --format json > /tmp/hermes-workspace-eslint-baseline.json
pnpm exec eslint . --max-warnings=0 > /tmp/hermes-workspace-eslint-baseline-hard.txt 2>&1
node scripts/parse-eslint-baseline.mjs /tmp/hermes-workspace-eslint-baseline.json /tmp/hermes-workspace-eslint-baseline-hard.txt dogfood-output/eslint-baseline-stabilization-2026-04-29T16-07-08Z.md dogfood-output/eslint-baseline-stabilization-latest.md
```

## Summary

- JSON baseline path: `/tmp/hermes-workspace-eslint-baseline.json`
- Hard-gate output path: `/tmp/hermes-workspace-eslint-baseline-hard.txt`
- Hard-gate output lines: 1722
- Files with lint messages: 249
- Total errors: 1092
- Total warnings: 122
- Config/parser failures: 5
- ESLint ignore-format warnings: 1

## Top 20 rule families

| Count | Severity | Rule |
|---|---|---|
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
| 11 | error | `react-hooks/exhaustive-deps` |
| 9 | error | `prefer-const` |
| 7 | error | `@typescript-eslint/consistent-type-imports` |
| 4 | error | `import/no-duplicates` |
| 3 | error | `<parser/config>` |
| 2 | warning | `<parser/config>` |
| 2 | error | `import/newline-after-import` |
| 2 | error | `react/no-danger` |
| 1 | error | `@typescript-eslint/naming-convention` |
| 1 | error | `no-constant-condition` |

## Top 20 files

| Messages | Errors | Warnings | File |
|---|---|---|---|
| 75 | 70 | 5 | `src/screens/chat/chat-screen.tsx` |
| 39 | 39 | 0 | `src/screens/gateway/conductor.tsx` |
| 39 | 39 | 0 | `src/screens/gateway/hooks/use-conductor-gateway.ts` |
| 35 | 35 | 0 | `src/screens/gateway/components/hub-utils.tsx` |
| 28 | 19 | 9 | `src/screens/chat/components/chat-message-list.tsx` |
| 27 | 27 | 0 | `src/screens/gateway/components/run-console.tsx` |
| 24 | 22 | 2 | `src/components/agent-view/agent-view-panel.tsx` |
| 23 | 23 | 0 | `src/screens/gateway/components/agent-output-panel.tsx` |
| 23 | 23 | 0 | `src/server/work-item-launch.ts` |
| 23 | 23 | 0 | `src/stores/mission-store.ts` |
| 22 | 22 | 0 | `src/screens/gateway/hooks/use-mission-orchestrator.ts` |
| 18 | 15 | 3 | `src/routes/api/send-stream.ts` |
| 18 | 18 | 0 | `src/screens/agents/hooks/use-operations.ts` |
| 18 | 7 | 11 | `src/screens/chat/components/chat-composer.tsx` |
| 17 | 17 | 0 | `src/routes/settings/index.tsx` |
| 16 | 16 | 0 | `src/screens/gateway/components/cost-analytics.tsx` |
| 16 | 16 | 0 | `src/screens/gateway/components/hub-constants.tsx` |
| 16 | 13 | 3 | `src/server/work-item-execution.test.ts` |
| 14 | 1 | 13 | `src/components/terminal/terminal-workspace.tsx` |
| 13 | 12 | 1 | `src/screens/chat/components/chat-sidebar.tsx` |

## Config/parser failures

| Severity | File | Location | Message |
|---|---|---|---|
| error | `public/sw.js` | ?:? | Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser.<br>The file was not found in any of the provided project(s): public/sw.js |
| error | `scripts/generate-pwa-icons.js` | ?:? | Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser.<br>The file was not found in any of the provided project(s): scripts/generate-pwa-icons.js |
| error | `server-entry.js` | ?:? | Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser.<br>The file was not found in any of the provided project(s): server-entry.js |
| warning | `src/server/gateway.ts` | 768:3 | Unused eslint-disable directive (no problems were reported from 'no-var'). |
| warning | `src/server/gateway.ts` | 770:3 | Unused eslint-disable directive (no problems were reported from 'no-var'). |

## ESLint ignore-format warnings

- (node:1903602) ESLintIgnoreWarning: The ".eslintignore" file is no longer supported. Switch to using the "ignores" property in "eslint.config.js": https://eslint.org/docs/latest/use/configure/migration-guide#ignore-files

## Recommended cleanup order

1. Config friction: migrate `.eslintignore`, address JS parser-project failures, and resolve stale `react-hooks/exhaustive-deps` disable comments.
2. Import/type-style families: `import/consistent-type-specifier-style`, `sort-imports`, `import/order`, `import/first`, `@typescript-eslint/consistent-type-imports`, and `import/no-duplicates`.
3. Mechanical syntax families: `@typescript-eslint/array-type`, `prefer-const`, `no-useless-escape`, and `@typescript-eslint/no-unnecessary-type-assertion`.
4. Product-area no-unnecessary-condition cleanup.
5. Warning policy: `no-shadow` and `@typescript-eslint/require-await`.
