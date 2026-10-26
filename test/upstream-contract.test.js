import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkShape } from '../scripts/check-upstream-contract.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/github-contents-get.json', import.meta.url), 'utf8')
);

describe('checkShape offline contract validation', () => {
  it('passes against fixture itself', () => {
    const mismatches = checkShape(fixture, fixture);
    expect(mismatches).toEqual([]);
  });

  it('fails when sha is missing', () => {
    const mutation = { ...fixture };
    delete mutation.sha;
    const mismatches = checkShape(mutation, fixture);
    expect(mismatches).toContain('sha');
  });

  it('fails when content is of the wrong type', () => {
    const mutation = { ...fixture, content: 12345 };
    const mismatches = checkShape(mutation, fixture);
    expect(mismatches).toContain('content');
  });

  it('fails when encoding is not base64', () => {
    const mutation = { ...fixture, encoding: 'utf-8' };
    const mismatches = checkShape(mutation, fixture);
    expect(mismatches).toContain('encoding');
  });

  it('fails when content cannot be decoded or parsed with an entries array', () => {
    const corruptJson = {
      ...fixture,
      content: Buffer.from('{not json').toString('base64'),
    };
    expect(checkShape(corruptJson, fixture)).toContain('content');

    const missingEntries = {
      ...fixture,
      content: Buffer.from(JSON.stringify({ version: 1 })).toString('base64'),
    };
    expect(checkShape(missingEntries, fixture)).toContain('content');
  });
});
