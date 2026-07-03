import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Local git worktrees under .worktrees/ carry their own copies of the
    // test files; without this, vitest double-counts every test.
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
});
