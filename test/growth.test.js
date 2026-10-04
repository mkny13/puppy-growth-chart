import { describe, it, expect } from 'vitest';
import {
  dateToWeek, weekToDate, fmtDateLocal, fmtAge, fmtAgeShort,
  maturity, maturityFast, maturitySlow, refAdultWeight, fitShape, fitDog,
  bandSpread, buildBand, interpBand, makeXS, makeYS, toD, bandPath,
  lastWith, fitDogs, computeYDomain,
  MATURITY_K, MATURITY_T0, HALF_GROWN_W, X_ABS_MAX, PL, CW, PT, CH, SEED_ACTUAL,
} from '../src/growth.js';

const pts = (rows) => rows.map(([t, w]) => ({ t, w }));
const LUKE = pts([[9.71, 15], [10, 17.3], [10.57, 18.4], [12, 21.4], [14, 24.4], [16, 28]]);

describe('date helpers', () => {
  it('dateToWeek and weekToDate round-trip', () => {
    expect(dateToWeek(weekToDate(10))).toBe(10);
    expect(dateToWeek(new Date(2026, 1, 16))).toBe(0);
    expect(dateToWeek(new Date(2026, 1, 23))).toBe(1);
  });
  it('formats local dates with zero padding', () => {
    expect(fmtDateLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('formats ages', () => {
    expect(fmtAge(0)).toBe('0 days');
    expect(fmtAge(1)).toBe('1 week');
    expect(fmtAge(10)).toBe('2 months, 1 week, 3 days');
    expect(fmtAgeShort(10)).toBe('2mo 1w 3d');
    expect(fmtAgeShort(0)).toBe('0d');
  });
});

describe('maturity curve', () => {
  it('is increasing and bounded in (0, 1)', () => {
    let prev = 0;
    for (let t = 4; t <= 80; t += 4) {
      const m = maturity(t);
      expect(m).toBeGreaterThan(prev);
      expect(m).toBeLessThan(1);
      prev = m;
    }
  });
  it('matches its calibration milestones (~50% at 16w, ~75% at 26w)', () => {
    expect(maturity(16)).toBeCloseTo(0.5, 1);
    expect(maturity(26)).toBeCloseTo(0.75, 1);
    expect(maturity(HALF_GROWN_W)).toBeCloseTo(0.5, 6);
  });
  it('fast/slow variants bracket the reference', () => {
    expect(maturityFast(20)).toBeGreaterThan(maturity(20));
    expect(maturitySlow(20)).toBeLessThan(maturity(20));
    expect(maturityFast(500)).toBeLessThanOrEqual(0.99);
  });
  it('exposes the calibrated constants', () => {
    expect(MATURITY_K).toBeGreaterThan(0);
    expect(MATURITY_T0).toBeGreaterThan(0);
  });
});

describe('refAdultWeight', () => {
  it('returns null for no points', () => {
    expect(refAdultWeight([])).toBeNull();
  });
  it('recovers the adult weight of a dog that follows the reference curve', () => {
    const A = 50;
    const onCurve = pts([10, 14, 18, 22].map((t) => [t, A * maturity(t)]));
    expect(refAdultWeight(onCurve)).toBeCloseTo(A, 6);
  });
});

describe('fitShape', () => {
  it('falls back to the reference shape with fewer than two valid points', () => {
    expect(fitShape(pts([[10, 15]]), 50)).toEqual({ k: MATURITY_K, t0: MATURITY_T0 });
    expect(fitShape(pts([[10, 60], [12, 70]]), 50)).toEqual({ k: MATURITY_K, t0: MATURITY_T0 });
  });
  it('recovers k and t0 from noise-free Gompertz data', () => {
    const A = 50, k = 0.09, t0 = 12;
    const data = pts([8, 10, 14, 18, 24].map((t) => [t, A * Math.exp(-Math.exp(-k * (t - t0)))]));
    const fit = fitShape(data, A);
    expect(fit.k).toBeCloseTo(k, 6);
    expect(fit.t0).toBeCloseTo(t0, 6);
  });
  it('clamps k to the plausible range', () => {
    const steep = pts([[10, 5], [10.5, 45]]);
    expect(fitShape(steep, 50).k).toBeLessThanOrEqual(0.15);
  });
  it('uses the reference when all points share one week', () => {
    expect(fitShape(pts([[10, 15], [10, 16]]), 50)).toEqual({ k: MATURITY_K, t0: MATURITY_T0 });
  });
});

describe('bandSpread', () => {
  it('is capped at 28% and shrinks as the dog matures', () => {
    expect(bandSpread(0.1)).toBe(0.28);
    expect(bandSpread(0.9)).toBeLessThan(bandSpread(0.5));
    expect(bandSpread(1)).toBeCloseTo(0.04, 10);
  });
});

describe('fitDog', () => {
  it('returns null with no data', () => {
    expect(fitDog([])).toBeNull();
  });
  it('produces a growing curve that passes near the data', () => {
    const fit = fitDog(LUKE);
    expect(fit.fn(20)).toBeGreaterThan(fit.fn(10));
    expect(fit.fn(100)).toBeLessThan(fit.A * 1.0001);
    expect(Math.abs(fit.fn(16) - 28)).toBeLessThan(4);
  });
  it('keeps the band around A and above the dog\'s current weight', () => {
    const fit = fitDog(LUKE);
    expect(fit.lo).toBeLessThanOrEqual(fit.A);
    expect(fit.hi).toBeGreaterThanOrEqual(fit.A);
    expect(fit.lo).toBeGreaterThanOrEqual(28);
    expect(fit.tLast).toBe(16);
  });
  it('works with a single measurement', () => {
    const fit = fitDog(pts([[10, 15]]));
    expect(Number.isFinite(fit.A)).toBe(true);
    expect(fit.lo).toBeLessThan(fit.hi);
  });
  it('is stable: one noisy weigh-in does not swing A wildly', () => {
    const a = fitDog(LUKE).A;
    const b = fitDog([...LUKE, { t: 17, w: 31 }]).A;
    expect(Math.abs(b - a) / a).toBeLessThan(0.15);
  });
});

describe('buildBand', () => {
  const fit = fitDog(LUKE);
  const { high, low } = buildBand(fit);
  it('spans from week 8 to the chart edge, sorted, including the latest week', () => {
    expect(high[0].w).toBe(8);
    expect(high.at(-1).w).toBe(X_ABS_MAX);
    expect(high.map((p) => p.w)).toContain(fit.tLast);
    expect(high.map((p) => p.w)).toEqual([...high.map((p) => p.w)].sort((a, b) => a - b));
  });
  it('never inverts and is pinned to the trend up to the latest weigh-in', () => {
    high.forEach((p, i) => expect(p.v).toBeGreaterThanOrEqual(low[i].v));
    for (const p of high.filter((q) => q.w <= fit.tLast)) {
      expect(p.v).toBeCloseTo(fit.fn(p.w), 8);
    }
  });
  it('lands on the projected adult range at the right edge', () => {
    expect(high.at(-1).v).toBeGreaterThan(low.at(-1).v);
    expect(high.at(-1).v).toBeLessThanOrEqual(fit.hi + 1e-9);
    expect(low.at(-1).v).toBeGreaterThanOrEqual(fit.lo - 1e-9);
  });
});

describe('interpBand', () => {
  const arr = [{ w: 0, v: 0 }, { w: 10, v: 100 }, { w: 20, v: 100 }];
  it('interpolates linearly and clamps outside', () => {
    expect(interpBand(arr, 5)).toBe(50);
    expect(interpBand(arr, 15)).toBe(100);
    expect(interpBand(arr, -3)).toBe(0);
    expect(interpBand(arr, 99)).toBe(100);
  });
});

describe('scales and paths', () => {
  it('maps the view range onto the plot area', () => {
    const xS = makeXS(0, 52);
    expect(xS(0)).toBe(PL);
    expect(xS(52)).toBe(PL + CW);
    const yS = makeYS(0, 100);
    expect(yS(0)).toBe(PT + CH);
    expect(yS(100)).toBe(PT);
  });
  it('builds svg paths', () => {
    const xS = (w) => w, yS = (v) => v;
    expect(toD([{ w: 1, v: 2 }, { w: 3, v: 4 }], xS, yS)).toBe('M1.0,2.0 L3.0,4.0');
    const hi = [{ w: 0, v: 10 }, { w: 1, v: 12 }];
    const lo = [{ w: 0, v: 5 }, { w: 1, v: 6 }];
    expect(bandPath(lo, hi, xS, yS)).toBe('M0.0,10.0 L1.0,12.0 L1.0,6.0 L0.0,5.0 Z');
  });
});

describe('lastWith', () => {
  const rows = [{ week: 1, luke: 5 }, { week: 2, leia: 4 }, { week: 3, luke: 9 }];
  it('finds the latest row with a value for that dog', () => {
    expect(lastWith(rows, 'luke').week).toBe(3);
    expect(lastWith(rows, 'leia').week).toBe(2);
    expect(lastWith([], 'luke')).toBeNull();
    expect(lastWith([{ week: 1, luke: 5 }], 'leia')).toBeNull();
  });
});

describe('fitDogs / computeYDomain', () => {
  const entries = [
    { week: 10, luke: 17.3, leia: 11.8 },
    { week: 12, luke: 21.4 },
    { week: 14, leia: 17.2 },
  ];
  it('fits each dog from only its own rows', () => {
    const fits = fitDogs(entries);
    expect(fits.luke.tLast).toBe(12);
    expect(fits.leia.tLast).toBe(14);
    expect(fitDogs([{ week: 5, luke: 8 }]).leia).toBeNull();
    expect(fitDogs([])).toEqual({ luke: null, leia: null });
  });
  it('defaults to 0–72 with nothing to show', () => {
    const none = { luke: null, leia: null };
    expect(computeYDomain([], none, none, 0, 52)).toEqual({ domainMin: 0, domainMax: 72 });
  });
  it('returns 5-lb aligned bounds that contain the data and the band', () => {
    const fits = fitDogs(entries);
    const bands = { luke: buildBand(fits.luke), leia: buildBand(fits.leia) };
    const { domainMin, domainMax } = computeYDomain(entries, fits, bands, 0, 52);
    expect(domainMin % 5).toBe(0);
    expect(domainMax % 5).toBe(0);
    expect(domainMin).toBeGreaterThanOrEqual(0);
    expect(domainMax).toBeGreaterThanOrEqual(fits.luke.hi);
    expect(domainMin).toBeLessThanOrEqual(11.8);
  });
  it('zooming in shrinks the domain to the visible window', () => {
    const fits = fitDogs(entries);
    const bands = { luke: buildBand(fits.luke), leia: buildBand(fits.leia) };
    const wide = computeYDomain(entries, fits, bands, 0, 52);
    const narrow = computeYDomain(entries, fits, bands, 9, 15);
    expect(narrow.domainMax).toBeLessThan(wide.domainMax);
  });
});

describe('seed data', () => {
  it('is sorted by week and positive', () => {
    const weeks = SEED_ACTUAL.map((e) => e.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    SEED_ACTUAL.forEach((e) => { expect(e.luke).toBeGreaterThan(0); expect(e.leia).toBeGreaterThan(0); });
  });
});
