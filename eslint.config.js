import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
  { ignores: ['dist/**', 'offline-dist/**', 'frontend-dist/**', 'worker/index.js', 'deploy/sites/**', 'node_modules/**', 'evidence/**', 'benchmark-private/**', 'pages-dist/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { URL: 'readonly', Request: 'readonly', Buffer: 'readonly', console: 'readonly', process: 'readonly' } } },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules } },
);
