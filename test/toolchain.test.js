import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Why this test exists:
// eslint-plugin-react@7.37.5 (npm `latest` as of 2026-10-08) declares a peer
// dependency range of `eslint ^3 || ^4 || ... || ^9.7` — it does NOT support
// ESLint 10. The project runs ESLint 10.12.0, so package.json carries an
// `overrides` entry (`"eslint-plugin-react": { "eslint": "$eslint" }`) that
// forces the plugin to accept the installed ESLint. The override works (the
// plugin's rules run), but it also masks the incompatibility: if the plugin
// ever publishes a release whose peer range covers ESLint 10, the override
// becomes unnecessary and should be removed, otherwise future upgrades can
// silently ship a broken dependency tree.
//
// This test makes that cleanup self-triggering: it reads package.json and the
// installed plugin's metadata (read-only, no network) and fails — with a
// message telling the reader to remove the override — as soon as the plugin's
// peer range covers the project's ESLint. Until then it passes, so the
// override is not removed prematurely.
describe('eslint-plugin-react peer range vs project ESLint', () => {
  it('fails once eslint-plugin-react supports the project ESLint, prompting removal of the overrides entry', async () => {
    const pkg = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
    const override = pkg?.overrides?.['eslint-plugin-react']?.eslint;

    if (!override) {
      // No override present — nothing to check. This is the desired end state.
      return;
    }

    const pluginPkg = JSON.parse(
      await readFile(resolve(repoRoot, 'node_modules/eslint-plugin-react/package.json'), 'utf8'),
    );
    const peerRange = pluginPkg?.peerDependencies?.eslint;
    expect(typeof peerRange).toBe('string');

    const eslintPkg = JSON.parse(
      await readFile(resolve(repoRoot, 'node_modules/eslint/package.json'), 'utf8'),
    );
    const eslintVersion = eslintPkg.version;
    expect(typeof eslintVersion).toBe('string');

    const supportsEslint10 = await (async () => {
      // Use semver only if it is already a transitive dependency of the
      // project (it is, via the eslint toolchain); otherwise fall back to a
      // simple range-token check so the test never needs a new direct dep.
      let semver;
      try {
        semver = (await import('semver')).default;
      } catch {
        semver = null;
      }

      if (semver && typeof semver.satisfies === 'function') {
        return semver.satisfies(eslintVersion, peerRange);
      }

      return /\b(?:\^|>=)?10\b/.test(peerRange);
    })();

    expect(supportsEslint10, 'eslint-plugin-react now supports ESLint 10: remove the `overrides` entry from package.json and run npm install').toBe(false);
  });
});