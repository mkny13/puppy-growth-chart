import { describe, it, expect } from 'vitest';
import { resolveConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Mahler canary: the Vite build must target THIS checkout (the assigned
// worktree), never another copy of the repo, and must keep the Pages base path.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('vite targets this checkout', () => {
  it('resolves its root and entry inside the checkout running the tests', async () => {
    const cfg = await resolveConfig({ root: repoRoot }, 'build');
    expect(cfg.root).toBe(repoRoot);
    expect(resolve(cfg.root, 'index.html').startsWith(repoRoot)).toBe(true);
  });
  it('keeps the GitHub Pages base path for builds and / for dev', async () => {
    expect((await resolveConfig({ root: repoRoot }, 'build')).base).toBe('/puppy-growth-chart/');
    expect((await resolveConfig({ root: repoRoot }, 'serve')).base).toBe('/');
  });
});
