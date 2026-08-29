#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { basename } from 'node:path'

const [, , jsonPath, hardPath, reportPath, aliasPath] = process.argv

if (!jsonPath || !hardPath || !reportPath || !aliasPath) {
  console.error(
    'Usage: node scripts/parse-eslint-baseline.mjs <eslint-json> <hard-gate-output> <report-path> <alias-path>',
  )
  process.exit(1)
}

const jsonRaw = readFileSync(jsonPath, 'utf8')
const hardRaw = readFileSync(hardPath, 'utf8')
const results = JSON.parse(jsonRaw)

const severityName = (severity) => (severity === 2 ? 'error' : severity === 1 ? 'warning' : 'off')
const relPath = (filePath) => filePath.replace(`${process.cwd()}/`, '')

const ruleCounts = new Map()
const fileCounts = []
const configFailures = []
let totalErrors = 0
let totalWarnings = 0
let filesWithMessages = 0

for (const result of results) {
  const messages = result.messages ?? []
  if (messages.length === 0) continue

  const file = relPath(result.filePath)
  filesWithMessages += 1
  totalErrors += result.errorCount ?? messages.filter((message) => message.severity === 2).length
  totalWarnings += result.warningCount ?? messages.filter((message) => message.severity === 1).length
  fileCounts.push({
    file,
    errors: result.errorCount ?? 0,
    warnings: result.warningCount ?? 0,
    total: messages.length,
  })

  for (const message of messages) {
    const severity = severityName(message.severity)
    const ruleId = message.ruleId ?? '<parser/config>'
    const key = `${severity}\t${ruleId}`
    const current = ruleCounts.get(key) ?? { severity, ruleId, count: 0 }
    current.count += 1
    ruleCounts.set(key, current)

    if (!message.ruleId || message.fatal) {
      configFailures.push({
        file,
        severity,
        message: message.message,
        line: message.line,
        column: message.column,
      })
    }
  }
}

const eslintIgnoreWarnings = hardRaw
  .split('\n')
  .filter((line) => line.includes('ESLintIgnoreWarning') || line.includes('".eslintignore" file is no longer supported'))

const hardLines = hardRaw.length === 0 ? 0 : hardRaw.split('\n').length
const topRules = [...ruleCounts.values()].sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId))
const topFiles = fileCounts.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file))

const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')

const table = (headers, rows) => {
  const separator = headers.map(() => '---').join('|')
  return [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `|${separator}|`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n')
}

const generatedAt = new Date().toISOString()
const report = `# Hermes Workspace — ESLint Baseline Stabilization Report

Generated: ${generatedAt}

## Commands

\`\`\`bash
pnpm exec eslint . --format json > ${jsonPath}
pnpm exec eslint . --max-warnings=0 > ${hardPath} 2>&1
node scripts/parse-eslint-baseline.mjs ${jsonPath} ${hardPath} ${reportPath} ${aliasPath}
\`\`\`

## Summary

- JSON baseline path: \`${jsonPath}\`
- Hard-gate output path: \`${hardPath}\`
- Hard-gate output lines: ${hardLines}
- Files with lint messages: ${filesWithMessages}
- Total errors: ${totalErrors}
- Total warnings: ${totalWarnings}
- Config/parser failures: ${configFailures.length}
- ESLint ignore-format warnings: ${eslintIgnoreWarnings.length}

## Top 20 rule families

${table(['Count', 'Severity', 'Rule'], topRules.slice(0, 20).map((rule) => [String(rule.count), rule.severity, `\`${rule.ruleId}\``]))}

## Top 20 files

${table(
  ['Messages', 'Errors', 'Warnings', 'File'],
  topFiles.slice(0, 20).map((file) => [String(file.total), String(file.errors), String(file.warnings), `\`${file.file}\``]),
)}

## Config/parser failures

${
  configFailures.length === 0
    ? 'None.'
    : table(
        ['Severity', 'File', 'Location', 'Message'],
        configFailures.map((failure) => [
          failure.severity,
          `\`${failure.file}\``,
          `${failure.line ?? '?'}:${failure.column ?? '?'}`,
          failure.message.replaceAll('|', '\\|'),
        ]),
      )
}

## ESLint ignore-format warnings

${eslintIgnoreWarnings.length === 0 ? 'None.' : eslintIgnoreWarnings.map((line) => `- ${line}`).join('\n')}

## Recommended cleanup order

1. Config friction: migrate \`.eslintignore\`, address JS parser-project failures, and resolve stale \`react-hooks/exhaustive-deps\` disable comments.
2. Import/type-style families: \`import/consistent-type-specifier-style\`, \`sort-imports\`, \`import/order\`, \`import/first\`, \`@typescript-eslint/consistent-type-imports\`, and \`import/no-duplicates\`.
3. Mechanical syntax families: \`@typescript-eslint/array-type\`, \`prefer-const\`, \`no-useless-escape\`, and \`@typescript-eslint/no-unnecessary-type-assertion\`.
4. Product-area no-unnecessary-condition cleanup.
5. Warning policy: \`no-shadow\` and \`@typescript-eslint/require-await\`.
`

writeFileSync(reportPath, report)
copyFileSync(reportPath, aliasPath)

console.log(
  JSON.stringify(
    {
      reportPath,
      aliasPath,
      filesWithMessages,
      totalErrors,
      totalWarnings,
      configFailures: configFailures.length,
      eslintIgnoreWarnings: eslintIgnoreWarnings.length,
      topRules: topRules.slice(0, 5),
      topFiles: topFiles.slice(0, 5),
    },
    null,
    2,
  ),
)
