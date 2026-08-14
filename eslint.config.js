import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Edge Functions are Deno, not browser TypeScript — they have their own
  // globals and remote (jsr:/https:) imports that this config cannot resolve.
  globalIgnores(['dist', 'supabase/functions/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Surfaces genuinely unused values while allowing the `_`-prefix
      // convention for deliberately ignored destructured fields.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // The router exports only lazy route components and the router instance;
    // context modules pair a Provider with its hook, which is the standard
    // shape. Neither is a Fast Refresh hazard worth restructuring for.
    files: [
      'src/app/router.tsx',
      'src/app/guards.tsx',
      'src/contexts/**/*.tsx',
      'src/components/ui/Toast.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
