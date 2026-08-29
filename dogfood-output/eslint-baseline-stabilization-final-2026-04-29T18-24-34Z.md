# Hermes Workspace — ESLint Baseline Stabilization Report

Generated: 2026-04-29T18:24:34.822Z

## Commands

```bash
pnpm exec eslint . --format json > /tmp/hermes-workspace-eslint-task6-final.json
pnpm exec eslint . --max-warnings=0 > /tmp/hermes-workspace-eslint-task6-final-hard.txt 2>&1
node scripts/parse-eslint-baseline.mjs /tmp/hermes-workspace-eslint-task6-final.json /tmp/hermes-workspace-eslint-task6-final-hard.txt dogfood-output/eslint-baseline-stabilization-final-2026-04-29T18-24-34Z.md dogfood-output/eslint-baseline-stabilization-final-latest.md
```

## Summary

- JSON baseline path: `/tmp/hermes-workspace-eslint-task6-final.json`
- Hard-gate output path: `/tmp/hermes-workspace-eslint-task6-final-hard.txt`
- Hard-gate output lines: 0
- Files with lint messages: 0
- Total errors: 0
- Total warnings: 0
- Config/parser failures: 0
- ESLint ignore-format warnings: 0

## Top 20 rule families

| Count | Severity | Rule |
|---|---|---|

## Top 20 files

| Messages | Errors | Warnings | File |
|---|---|---|---|

## Config/parser failures

None.

## ESLint ignore-format warnings

None.

## Recommended cleanup order

1. Config friction: migrate `.eslintignore`, address JS parser-project failures, and resolve stale `react-hooks/exhaustive-deps` disable comments.
2. Import/type-style families: `import/consistent-type-specifier-style`, `sort-imports`, `import/order`, `import/first`, `@typescript-eslint/consistent-type-imports`, and `import/no-duplicates`.
3. Mechanical syntax families: `@typescript-eslint/array-type`, `prefer-const`, `no-useless-escape`, and `@typescript-eslint/no-unnecessary-type-assertion`.
4. Product-area no-unnecessary-condition cleanup.
5. Warning policy: `no-shadow` and `@typescript-eslint/require-await`.
