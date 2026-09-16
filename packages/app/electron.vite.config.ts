import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    // Core is TypeScript source (workspace package), so it must be bundled,
    // not externalized like regular node_modules deps.
    plugins: [externalizeDepsPlugin({ exclude: ['@storagewaiter/core'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
