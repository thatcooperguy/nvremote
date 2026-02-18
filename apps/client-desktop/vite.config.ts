import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: path.resolve(__dirname, 'src/main/main.ts'),
        onstart(args) {
          args.startup(['.']).catch((err: Error) => {
            console.error('Failed to start Electron:', err.message);
          });
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: ['electron', 'electron-store', 'bufferutil', 'utf-8-validate'],
            },
          },
        },
      },
      {
        entry: path.resolve(__dirname, 'src/main/preload.ts'),
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/preload'),
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
  // Use relative paths ('./') so assets resolve correctly when loaded
  // from file:// in production Electron builds. The default '/' would
  // produce absolute paths like /assets/index.js which resolve to the
  // filesystem root under file:// — causing a blank window.
  base: './',
  root: 'src/renderer',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
