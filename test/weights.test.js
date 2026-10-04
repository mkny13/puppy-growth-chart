import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fitDogs, buildBand, computeYDomain } from '../src/growth.js';

// Read-only: the Worker (puppy-growth-sync) owns writes to this file.
const path = fileURLToPath(new URL('../data/weights.json', import.meta.url));
const data = JSON.parse(readFileSync(path, 'utf8'));

describe('data/weights.json', () => {
  it('has the shape the Worker writes', () => {
    expect(data.version).toBe(1);
    expect(Number.isNaN(Date.parse(data.updated))).toBe(false);
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBeGreaterThan(0);
  });
  it('passes the Worker\'s own entry validation rules', () => {
    for (const e of data.entries) {
      expect(Number.isFinite(e.week)).toBe(true);
      for (const dog of ['luke', 'leia']) {
        if (e[dog] != null) {
          expect(Number.isFinite(e[dog])).toBe(true);
          expect(e[dog]).toBeGreaterThan(0);
        }
      }
    }
  });
  it('is sorted by week (same-week entries are allowed)', () => {
    const weeks = data.entries.map((e) => e.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
  });
  it('never has a dog losing more than 10% between weigh-ins', () => {
    for (const dog of ['luke', 'leia']) {
      const vals = data.entries.map((e) => e[dog]).filter((v) => v != null);
      for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] * 0.9);
    }
  });
  it('feeds the chart pipeline without NaN, for whatever entries exist now', () => {
    const fits = fitDogs(data.entries);
    for (const dog of ['luke', 'leia']) {
      const fit = fits[dog];
      expect(fit).not.toBeNull();
      expect(Number.isFinite(fit.A)).toBe(true);
      expect(fit.lo).toBeLessThanOrEqual(fit.hi);
    }
    const bands = { luke: buildBand(fits.luke), leia: buildBand(fits.leia) };
    const { domainMin, domainMax } = computeYDomain(data.entries, fits, bands, 0, 52);
    expect(domainMin).toBeLessThan(domainMax);
  });
});
