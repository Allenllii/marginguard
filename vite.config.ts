import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { FRONTEND_DIRECTORY } from './shared/build-paths.js';
// Runtime credentials belong to the backend; frontend tooling must not load
// local environment files. https://vite.dev/config/shared-options#envdir
export default defineConfig({ envDir: false, plugins: [react()], build: { outDir: FRONTEND_DIRECTORY }, server: { host: '127.0.0.1' } });
