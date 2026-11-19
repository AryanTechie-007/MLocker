import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
  },
});
