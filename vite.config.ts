import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { FRONTEND_DIRECTORY } from './shared/build-paths.js';
export default defineConfig({ plugins: [react()], build: { outDir: FRONTEND_DIRECTORY }, server: { host: '127.0.0.1' } });
