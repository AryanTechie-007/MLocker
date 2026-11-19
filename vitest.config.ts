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
    env: {
      DATABASE_URL: `file:${path.resolve(__dirname, 'prisma/dev.db')}`,
      NEXTAUTH_SECRET: 'test-secret-for-security-regression-tests-only',
      NEXTAUTH_URL: 'http://localhost:3000',
    },
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
  },
});
