// ── Date helpers ────────────────────────────────────────────────────────────
export const BIRTH = new Date(2026, 1, 16);
export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
export const dateToWeek = (d) => Math.round(((d - BIRTH) / MS_PER_WEEK) * 100) / 100;
export const weekToDate = (w) => new Date(BIRTH.getTime() + w * MS_PER_WEEK);
export const fmtDateLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fmtShort = (d) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const fmtAge = (weeks) => {
  const totalDays = Math.round(weeks * 7);
  const months = Math.floor(totalDays / 30);
  const rem = totalDays - months * 30;
  const wks = Math.floor(rem / 7);
  const days = rem % 7;
  const parts = [];
  if (months > 0) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
  if (wks > 0) parts.push(`${wks} week${wks !== 1 ? "s" : ""}`);
  if (days > 0 || parts.length === 0)
    parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  return parts.join(", ");
};

export const fmtAgeShort = (weeks) => {
  const totalDays = Math.round(weeks * 7);
  const months = Math.floor(totalDays / 30);
  const rem = totalDays - months * 30;
  const wks = Math.floor(rem / 7);
  const days = rem % 7;
  const parts = [];
  if (months > 0) parts.push(`${months}mo`);
  if (wks > 0) parts.push(`${wks}w`);
  if (days > 0 || parts.length === 0) parts.push(`${days}d`);
  return parts.join(" ");
};

// ── Data ─────────────────────────────────────────────────────────────────────
export const SEED_ACTUAL = [
  { week: 9.71, luke: 15.0, leia: 11.0 },
  { week: 10.0, luke: 17.3, leia: 11.8 },
  { week: 10.57, luke: 18.4, leia: 13.0 },
];

// ── Chart geometry ───────────────────────────────────────────────────────────
export const X_ABS_MIN = 0,
  X_ABS_MAX = 52;
export const VW = 400,
  VH = 300;
export const PL = 38,
  PR = 34,
  PT = 12,
  PB = 36;
export const CW = VW - PL - PR,
  CH = VH - PT - PB;

// y-scale depends on visible data domain; x-scale depends on zoom view
export const makeYS = (dMin, dMax) => (v) => PT + CH - ((v - dMin) / (dMax - dMin)) * CH;
export const makeXS = (min, max) => (w) => PL + ((w - min) / (max - min)) * CW;

export const toD = (pts, xS, yS) =>
  pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`,
    )
    .join(" ");

export const bandPath = (lo, hi, xS, yS) => {
  const top = hi
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`,
    )
    .join(" ");
  const bot = [...lo]
    .reverse()
    .map((p) => `L${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`)
    .join(" ");
  return `${top} ${bot} Z`;
};

// ── Growth model: W(t) = A · exp(-exp(-k·(t - t0))) ─────────────────────────
// Gompertz, the form Hawthorne et al. (J Nutr 2004;134:2027S) fitted to 12
// breeds with R² > 0.979. It is asymmetric — fast early, long tapering tail —
// which is how dogs actually grow; a logistic is symmetric and finishes too
// early.
//
// The adult weight A is *not* identifiable from puppy measurements. Profiling
// the fit over Luke's 14 weigh-ins, every A from 44 to 60 lb reproduces the
// observed points to within 0.73–1.07 lb RMS, i.e. all of them sit inside the
// noise of weighing a squirming puppy on a bathroom scale. Letting least
// squares choose A just tracks that noise: doing so swung the projection
// between 45 and 91 lb over successive weigh-ins and ultimately landed on an
// adult weight whose band floor was below the dog's current weight.
//
// So A is anchored to a breed-size maturity prior, and least squares is left to
// fit only the shape (k, t0) once A is fixed.

// Fraction of adult weight a medium-breed dog carries at age t, in weeks.
// Gompertz calibrated to two well-established milestones:
//   16 w (4 mo) → 50%  the "double the four-month weight" rule, which is
//                      documented as holding best for medium breeds
//   26 w (6 mo) → 75%  medium breeds are reported at 65–78% of adult weight
// The implied time-to-half-adult-weight of ~15.8 w agrees with Hawthorne's
// ~15 w for small/medium breeds (11.1 w Papillon → 22.9 w English Mastiff).
// Calibrated for post-weaning growth; it overstates maturity below ~8 weeks.
//
// "Medium" here means adult size, not ancestry. Salt et al. (PLoS ONE 2017;
// 12:e0182064, 6M dogs) found growth clusters by adult bodyweight rather than
// by breed, and concluded size-category curves are the right tool for
// mixed-breed dogs. This curve is their 15–30 kg category (33–66 lb), which is
// where both dogs project. If one ever tracked above ~66 lb the next category
// up matures later and this prior would start under-projecting.
export const MATURITY_K = 0.0879;
export const MATURITY_T0 = 11.83;
export const maturity = (t) => Math.exp(-Math.exp(-MATURITY_K * (t - MATURITY_T0)));

// Individuals run ahead of or behind the reference. Shifting the curve a few
// weeks either way bounds how much growing can plausibly be left, which turns
// the latest measurement into hard bounds on the adult weight.
export const EARLY_SHIFT = 3;
export const LATE_SHIFT = 5;
export const maturityFast = (t) => Math.min(0.99, maturity(t + EARLY_SHIFT));
export const maturitySlow = (t) => maturity(t - LATE_SHIFT);

// Each measurement implies an adult weight of w / maturity(t). Later ones are
// far more informative: dividing a half-pound weighing error by 0.75 amplifies
// it much less than dividing by 0.30. Weight each estimate by maturity(t)³.
export const REF_WEIGHT_POW = 3;
export const refAdultWeight = (pts) => {
  let sumW = 0,
    sumV = 0;
  for (const p of pts) {
    const m = maturity(p.t);
    const wt = m ** REF_WEIGHT_POW;
    sumW += wt;
    sumV += wt * (p.w / m);
  }
  return sumW > 0 ? sumV / sumW : null;
};

// Least-squares (k, t0) for a known A: ln(-ln(W/A)) = -k·t + k·t0 is linear in
// t, so the shape falls out of one regression. k is clamped to the range spanned
// by medium-breed growth rates so a couple of noisy weigh-ins can't produce a
// curve that finishes implausibly early or late.
export const K_MIN = 0.05;
export const K_MAX = 0.15;
export const fitShape = (pts, A) => {
  const ref = { k: MATURITY_K, t0: MATURITY_T0 };
  const valid = pts.filter((p) => p.w > 0 && p.w < A * 0.995);
  if (valid.length < 2) return ref;
  const xs = valid.map((p) => p.t);
  const ys = valid.map((p) => Math.log(-Math.log(p.w / A)));
  const n = xs.length;
  const mX = xs.reduce((s, v) => s + v, 0) / n;
  const mY = ys.reduce((s, v) => s + v, 0) / n;
  const den = xs.reduce((s, v) => s + (v - mX) ** 2, 0);
  if (den < 1e-10) return ref;
  const raw = -(xs.reduce((s, v, i) => s + (v - mX) * (ys[i] - mY), 0) / den);
  if (!isFinite(raw) || raw <= 0) return ref;
  const k = Math.min(K_MAX, Math.max(K_MIN, raw));
  return { k, t0: mX + mY / k };
};

// Half-width of the adult-weight band, as a fraction of A: widest for a young
// puppy (±28%, matching the 35–60 lb breed prior this chart started from) and
// shrinking as the dog runs out of growing left to do.
export const bandSpread = (matNow) => Math.min(0.28, 0.3 * (1 - matNow) + 0.04);

export const fitDog = (pts) => {
  if (!pts.length) return null;
  const maxW = Math.max(...pts.map((p) => p.w));
  const tLast = Math.max(...pts.map((p) => p.t));
  // A dog already weighing maxW at tLast cannot finish below
  // maxW / (fastest plausible maturity) — this is what keeps the band floor
  // physiologically reachable rather than letting it drift under the dog.
  const aFloor = maxW / maturityFast(tLast);
  const aCeil = Math.max(aFloor, maxW / maturitySlow(tLast));
  const A = Math.min(Math.max(refAdultWeight(pts), aFloor), aCeil);
  const { k, t0 } = fitShape(pts, A);
  const spread = bandSpread(maxW / A);
  return {
    fn: (t) => A * Math.exp(-Math.exp(-k * (t - t0))),
    A,
    k,
    tLast,
    lo: Math.max(A * (1 - spread), aFloor),
    hi: Math.min(A * (1 + spread), aCeil),
  };
};

// The band is pinned to the trend at the latest weigh-in and fans out to the
// projected adult range by the right edge of the chart: what has already been
// measured isn't uncertain, only what's left to grow. Sampled rather than
// hand-drawn so it always follows the dog's own fitted curve.
export const BAND_MIN_W = 8; // the maturity reference isn't calibrated below this
export const BAND_STEP = 2;
export const buildBand = (fit) => {
  const wNow = fit.fn(fit.tLast);
  const wEnd = fit.fn(X_ABS_MAX);
  // Fan out in proportion to how much of the remaining growth has happened, so
  // the edges land exactly on the projected adult range at the chart's right.
  const ramp = (w) =>
    w <= fit.tLast || wEnd <= wNow
      ? 0
      : Math.min(1, (fit.fn(w) - wNow) / (wEnd - wNow));
  // Clamped so a nearly grown dog, whose floor can exceed the trend's own
  // end value, gets a collapsed band rather than an inverted one.
  const hiGap = Math.max(0, fit.hi - wEnd);
  const loGap = Math.max(0, wEnd - fit.lo);
  const weeks = [];
  for (let w = BAND_MIN_W; w < X_ABS_MAX; w += BAND_STEP) weeks.push(w);
  if (fit.tLast > BAND_MIN_W && fit.tLast < X_ABS_MAX) weeks.push(fit.tLast);
  weeks.push(X_ABS_MAX);
  weeks.sort((a, b) => a - b);
  const high = [],
    low = [];
  for (const w of weeks) {
    const base = fit.fn(w),
      r = ramp(w);
    high.push({ w, v: base + hiGap * r });
    low.push({ w, v: base - loGap * r });
  }
  return { high, low };
};

// Linear-interpolate a piecewise band array (sorted by week) at week w.
export const interpBand = (arr, w) => {
  if (w <= arr[0].w) return arr[0].v;
  const last = arr[arr.length - 1];
  if (w >= last.w) return last.v;
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i],
      b = arr[i + 1];
    if (w <= b.w) return a.v + ((w - a.w) / (b.w - a.w)) * (b.v - a.v);
  }
  return last.v;
};

// Age at which the reference dog is half grown (~16 w, i.e. four months) —
// derived from the prior rather than hardcoded so the two can't drift apart.
export const HALF_GROWN_W = MATURITY_T0 - Math.log(Math.log(2)) / MATURITY_K;

// ── Tick arrays ───────────────────────────────────────────────────────────────
export const X_TICKS_ALL = [0, 6, 10, 14, 18, 22, 26, 30, 36, 42, 48, 52];

export const lastWith = (rows, dog) => {
  for (let i = rows.length - 1; i >= 0; i--)
    if (rows[i][dog] != null) return rows[i];
  return null;
};

// ── Chart data shaping ───────────────────────────────────────────────────────
// Per-dog fit from the shared entries list (rows may omit either dog).
export const fitDogs = (actual) => {
  const dogFits = { luke: null, leia: null };
  for (const dog of ["luke", "leia"]) {
    const pts = actual
      .filter((d) => d[dog] != null)
      .map((d) => ({ t: d.week, w: d[dog] }));
    if (pts.length >= 1) dogFits[dog] = fitDog(pts);
  }
  return dogFits;
};

// Y domain driven by whatever's visible in [viewMin, viewMax]: actual points,
// the trend line, and the projection band (so the band is never clipped).
export const computeYDomain = (actual, dogFits, dogBands, viewMin, viewMax) => {
  const visibleActualY = actual
    .filter((d) => d.week >= viewMin && d.week <= viewMax)
    .flatMap((d) => [d.luke, d.leia])
    .filter((v) => v != null && isFinite(v));
  const visibleTrendY = [];
  for (const dog of ["luke", "leia"]) {
    const fit = dogFits[dog];
    const band = dogBands[dog];
    if (!fit) continue;
    for (let i = 0; i <= 40; i++) {
      const tw = viewMin + (i / 40) * (viewMax - viewMin);
      visibleTrendY.push(fit.fn(tw));
      visibleTrendY.push(interpBand(band.high, tw));
      visibleTrendY.push(interpBand(band.low, tw));
    }
  }
  const allVisibleY = [...visibleActualY, ...visibleTrendY].filter(isFinite);
  if (allVisibleY.length === 0) return { domainMin: 0, domainMax: 72 };
  const rawMin = Math.min(...allVisibleY);
  const rawMax = Math.max(...allVisibleY);
  const pad = (rawMax - rawMin) * 0.1 || 2;
  return {
    domainMin: Math.max(0, Math.floor((rawMin - pad) / 5) * 5),
    domainMax: Math.ceil((rawMax + pad) / 5) * 5,
  };
};
