//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'vite.config.ts',
      'public/sw.js',
      'scripts/generate-pwa-icons.js',
      'server-entry.js',
    ],
  },
]
