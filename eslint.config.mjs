import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/server.js',
      '**/create-folder-structure.js'
    ]
  },
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // Allow require for server.js (CommonJS)
      '@typescript-eslint/no-require-imports': 'off',
      // Disable explicit function return type for complex composables
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  }
)
