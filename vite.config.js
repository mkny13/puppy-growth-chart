import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` only applies to production builds so dev/preview stay at /
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/puppy-growth-chart/' : '/',
}));
