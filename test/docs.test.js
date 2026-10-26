import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const agentsMdPath = resolve(repoRoot, 'AGENTS.md');
const srcDir = resolve(repoRoot, 'src');
const testDir = resolve(repoRoot, 'test');

describe('AGENTS.md layout documentation', () => {
  const agentsMd = readFileSync(agentsMdPath, 'utf8');

  it('mentions every file directly under src/ as a path', () => {
    const srcFiles = readdirSync(srcDir, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => d.name);

    for (const file of srcFiles) {
      const expectedPath = `src/${file}`;
      expect(agentsMd, `AGENTS.md is missing path ${expectedPath}`).toContain(expectedPath);
    }
  });

  it('mentions every test file by base name', () => {
    const layoutSection = agentsMd.split(/^## /m).find((section) => section.startsWith('Layout')) ?? '';
    const testEntryMatch = layoutSection.match(/(?:^|\n)[*-] `test\/`[\s\S]*?(?=\n(?:[*-] |#|\s*$))/);
    const testEntry = testEntryMatch ? testEntryMatch[0].trim() : '';
    expect(testEntry, 'AGENTS.md is missing a test/ entry under ## Layout').toBeTruthy();

    const testFiles = readdirSync(testDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.test.js'))
      .map((d) => d.name);

    for (const file of testFiles) {
      const baseName = basename(file, '.test.js');
      expect(testEntry, `AGENTS.md test/ layout entry is missing test ${baseName} (${file})`).toContain(baseName);
    }
  });
});
