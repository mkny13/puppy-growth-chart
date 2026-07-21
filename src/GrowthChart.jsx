import { useEffect, useRef, useState } from "react";

// ── Date helpers ────────────────────────────────────────────────────────────
const BIRTH = new Date(2026, 1, 16);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const dateToWeek = (d) => Math.round(((d - BIRTH) / MS_PER_WEEK) * 100) / 100;
const weekToDate = (w) => new Date(BIRTH.getTime() + w * MS_PER_WEEK);
const fmtDateLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtShort = (d) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const fmtAge = (weeks) => {
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

const fmtAgeShort = (weeks) => {
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
const SEED_ACTUAL = [
  { week: 9.71, luke: 15.0, leia: 11.0 },
  { week: 10.0, luke: 17.3, leia: 11.8 },
  { week: 10.57, luke: 18.4, leia: 13.0 },
];

// Breed-prior projection band: 35–60 lb adult
const BAND = {
  high: [
    { w: 9.3, v: 16 },
    { w: 10.1, v: 19 },
    { w: 12, v: 24 },
    { w: 14, v: 29 },
    { w: 18, v: 38 },
    { w: 22, v: 47 },
    { w: 26, v: 54 },
    { w: 32, v: 58 },
    { w: 38, v: 60 },
    { w: 44, v: 60 },
    { w: 52, v: 60 },
  ],
  low: [
    { w: 9.3, v: 10 },
    { w: 10.1, v: 12 },
    { w: 12, v: 15 },
    { w: 14, v: 18 },
    { w: 18, v: 23 },
    { w: 22, v: 28 },
    { w: 26, v: 32 },
    { w: 32, v: 34 },
    { w: 38, v: 35 },
    { w: 44, v: 35 },
    { w: 52, v: 35 },
  ],
};

// ── SVG accent colors (chart lines/dots – non-text, no contrast req) ─────────
const LUKE = "#6ab0f5";
const LEIA = "#f07090";
const BAND_C = "#8aa8be";

// ── Chart geometry ───────────────────────────────────────────────────────────
const X_ABS_MIN = 0,
  X_ABS_MAX = 52;
const VW = 400,
  VH = 300;
const PL = 38,
  PR = 34,
  PT = 12,
  PB = 36;
const CW = VW - PL - PR,
  CH = VH - PT - PB;

// y-scale depends on visible data domain; x-scale depends on zoom view
const makeYS = (dMin, dMax) => (v) => PT + CH - ((v - dMin) / (dMax - dMin)) * CH;
const makeXS = (min, max) => (w) => PL + ((w - min) / (max - min)) * CW;

const toD = (pts, xS, yS) =>
  pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`,
    )
    .join(" ");

const bandPath = (lo, hi, xS, yS) => {
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

// ── Logistic trend fit: W(t) = A / (1 + exp(-k*(t-t0))) ─────────────────────
// Adult weight A is derived from actual measurements via the logistic growth
// model. Two regimes based on how much data we have:
//
//   < MIN_POINTS_FOR_FREE_FIT: k is fixed at K_PRIOR (medium-breed value
//   matching the implicit growth rate in the BAND prior). 1/W vs exp(-k·t)
//   linearizes the model, so A and t0 fall out as a closed-form fit of the
//   measurements under that k.
//
//   ≥ MIN_POINTS_FOR_FREE_FIT: data drives all three params. Grid-search A,
//   derive (k, t0) per candidate via logit-space linearization, pick A with
//   min SSR in original weight space. No artificial k cap.
const K_PRIOR = 0.18;
const MIN_POINTS_FOR_FREE_FIT = 8;

// Linear regression of y = 1/W on z = exp(-k·t).
// Model: 1/W = 1/A + (exp(k·t0)/A) · exp(-k·t) → intercept gives A, slope gives t0.
// Returns null if the regression yields A below the heaviest observed weight,
// which means the assumed k can't explain the data.
const fitLogisticFixedK = (pts, k) => {
  const n = pts.length;
  if (n < 2) return null;
  const zs = pts.map((p) => Math.exp(-k * p.t));
  const ys = pts.map((p) => 1 / p.w);
  const mZ = zs.reduce((s, v) => s + v, 0) / n;
  const mY = ys.reduce((s, v) => s + v, 0) / n;
  const num = zs.reduce((s, z, i) => s + (z - mZ) * (ys[i] - mY), 0);
  const den = zs.reduce((s, z) => s + (z - mZ) ** 2, 0);
  if (Math.abs(den) < 1e-10) return null;
  const b = num / den;
  const a = mY - b * mZ;
  if (a <= 0 || b <= 0) return null;
  const A = 1 / a;
  if (A <= Math.max(...pts.map((p) => p.w))) return null;
  const t0 = Math.log(b * A) / k;
  const fn = (t) => A / (1 + Math.exp(-k * (t - t0)));
  return { fn, A, k };
};

const fitLogisticFree = (pts) => {
  const maxW = Math.max(...pts.map((p) => p.w));
  const latestT = Math.max(...pts.map((p) => p.t));
  const maxFrac = Math.min(0.9, Math.max(0.28, (latestT - 8) * 0.031 + 0.28));
  const aMin = Math.max(maxW / maxFrac, maxW + 3);
  let bestA = null,
    bestK = null,
    bestT0 = null,
    bestSSR = Infinity;
  for (let A = aMin; A <= 80; A += 0.5) {
    const valid = pts.filter((p) => p.w < A * 0.99);
    if (valid.length < 2) continue;
    const xs = valid.map((p) => p.t);
    const ys = valid.map((p) => Math.log(A / p.w - 1));
    const n = xs.length;
    const mX = xs.reduce((s, v) => s + v, 0) / n;
    const mY = ys.reduce((s, v) => s + v, 0) / n;
    const num = xs.reduce((s, v, i) => s + (v - mX) * (ys[i] - mY), 0);
    const den = xs.reduce((s, v) => s + (v - mX) ** 2, 0);
    if (Math.abs(den) < 1e-10) continue;
    const k = -(num / den);
    if (k <= 0) continue;
    const t0 = mX + mY / k;
    const fn = (t) => A / (1 + Math.exp(-k * (t - t0)));
    const ssr = pts.reduce((s, p) => s + (p.w - fn(p.t)) ** 2, 0);
    if (ssr < bestSSR) {
      bestSSR = ssr;
      bestA = A;
      bestK = k;
      bestT0 = t0;
    }
  }
  if (bestA === null) return null;
  const fn = (t) => bestA / (1 + Math.exp(-bestK * (t - bestT0)));
  return { fn, A: bestA, k: bestK };
};

// If the prior-k fit is degenerate (data demands higher k than prior), fall
// back to the free fit rather than hiding the trendline entirely.
const fitDog = (pts) => {
  if (pts.length >= MIN_POINTS_FOR_FREE_FIT) return fitLogisticFree(pts);
  return fitLogisticFixedK(pts, K_PRIOR) ?? fitLogisticFree(pts);
};

// Scale the shared BAND shape to a per-dog projected adult weight
const BAND_MID = 47;
const scaleBand = (A) => ({
  high: BAND.high.map((p) => ({ ...p, v: p.v * (A / BAND_MID) })),
  low: BAND.low.map((p) => ({ ...p, v: p.v * (A / BAND_MID) })),
});

// ── Tick arrays ───────────────────────────────────────────────────────────────
const X_TICKS_ALL = [0, 6, 10, 14, 18, 22, 26, 30, 36, 42, 48, 52];

// ── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = "puppy-weights:v2";
const COLOR_PREF_KEY = "puppy-color-pref";

// ── Remote sync ──────────────────────────────────────────────────────────────
// Leave WORKER_URL/APP_KEY empty until the Cloudflare Worker is deployed
// (see worker/README.md). When empty, the app falls back to localStorage-only.
const WORKER_URL = "https://puppy-growth-sync.mkastellec.workers.dev";
const APP_KEY = "309c7eea0951e17d08bffb0562105934d4d1966f1841da9b";
const SYNC_ENABLED = WORKER_URL !== "" && APP_KEY !== "";

const remoteFetch = async () => {
  const res = await fetch(`${WORKER_URL}/api/data`, {
    headers: { "X-App-Key": APP_KEY },
  });
  if (!res.ok) throw new Error(`GET ${res.status}`);
  return res.json();
};

const remotePut = async (entries) => {
  const res = await fetch(`${WORKER_URL}/api/data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-App-Key": APP_KEY },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error(`PUT ${res.status}`);
  return res.json();
};

const lastWith = (rows, dog) => {
  for (let i = rows.length - 1; i >= 0; i--)
    if (rows[i][dog] != null) return rows[i];
  return null;
};

// ── Themes ────────────────────────────────────────────────────────────────────
// All text colors verified ≥ 4.5:1 on their respective surface for AA.
// textVF is used only for large text / non-text UI (3:1 sufficient).
const THEMES = {
  dark: {
    bg: "#13161d",
    surface: "#1a1e26",
    surface2: "#1c2028",
    border: "#2a3040",
    text: "#f0ece4", // 16.9:1 on bg ✓
    textMuted: "#9aaab8", // 6.5:1 on bg ✓
    textFaint: "#7a8a9a", // 5.1:1 on bg ✓
    textVF: "#6a7a8a", // 4.2:1 — large/UI only
    gridLine: "rgba(255,255,255,0.06)",
    axisLine: "rgba(255,255,255,0.15)",
    ttBg: "#0e1117",
    inputBg: "#0e1117",
    lukeTxt: "#6ab0f5", // 8.4:1 at 26px bold ✓
    leiaTxt: "#f07090", // 10:1 at 26px bold ✓
    calLine: "rgba(232,192,96,0.4)",
    sliderTrack: "#2a3040",
    btnActive: "#2a3a4a",
    btnBorder: "#3a4a5a",
    deleteBtn: "#5a6a7a",
  },
  light: {
    bg: "#f5f2ec",
    surface: "#ffffff",
    surface2: "#eceae4",
    border: "#d0c8bc",
    text: "#1a1e26", // 15.8:1 on bg ✓
    textMuted: "#3a4455", // 8.7:1 on bg ✓
    textFaint: "#5a6475", // 5.3:1 on bg ✓
    textVF: "#7a8490", // 3.4:1 — large/UI only
    gridLine: "rgba(0,0,0,0.07)",
    axisLine: "rgba(0,0,0,0.15)",
    ttBg: "#1a1e26",
    inputBg: "#ffffff",
    lukeTxt: "#1a6ab5", // 5.6:1 on white ✓
    leiaTxt: "#c0305a", // 5.5:1 on white ✓
    calLine: "rgba(160,120,0,0.55)",
    sliderTrack: "#d0c8bc",
    btnActive: "#ddd9d2",
    btnBorder: "#bfb9b0",
    deleteBtn: "#7a8490",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function GrowthChart() {
  // ── State ──
  const [actual, setActual] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return SEED_ACTUAL;
  });
  const [tip, setTip] = useState(null);
  const [dateStr, setDateStr] = useState(() => fmtDateLocal(new Date()));
  const [lukeStr, setLukeStr] = useState("");
  const [leiaStr, setLeiaStr] = useState("");
  const [viewMin, setViewMin] = useState(X_ABS_MIN);
  const [viewMax, setViewMax] = useState(X_ABS_MAX);
  const [colorPref, setColorPref] = useState(
    () => localStorage.getItem(COLOR_PREF_KEY) || "auto",
  );
  const [sysDark, setSysDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const svgRef = useRef(null);
  const tipTimerRef = useRef(null);

  // ── Sync state ──
  // null when sync is disabled; otherwise: 'loading…' | 'syncing…' | 'synced' | 'offline'
  const [syncStatus, setSyncStatus] = useState(
    SYNC_ENABLED ? "loading…" : null,
  );
  const lastSyncedRef = useRef(null); // ISO timestamp of last successful sync
  const readyToSyncRef = useRef(!SYNC_ENABLED); // true after initial remote load resolves
  const skipNextSaveRef = useRef(false); // skips the next save effect after a remote-driven setActual
  const pendingWriteRef = useRef(false); // a PUT is in flight or scheduled
  const dirtyRef = useRef(false); // local state has unflushed edits
  const saveTimerRef = useRef(null);
  const actualRef = useRef(actual); // always-current snapshot for async handlers

  // ── Effects ──
  useEffect(() => {
    actualRef.current = actual;
  }, [actual]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actual));
    } catch {}

    if (!SYNC_ENABLED) return;
    if (!readyToSyncRef.current) return; // initial remote load hasn't finished yet
    if (skipNextSaveRef.current) {
      // this change came from remote, don't echo it back
      skipNextSaveRef.current = false;
      return;
    }

    clearTimeout(saveTimerRef.current);
    pendingWriteRef.current = true;
    dirtyRef.current = true;
    setSyncStatus("syncing…");
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await remotePut(actualRef.current);
        lastSyncedRef.current = res.updated || null;
        dirtyRef.current = false;
        setSyncStatus("synced");
      } catch {
        setSyncStatus("offline");
      } finally {
        pendingWriteRef.current = false;
      }
    }, 500);
  }, [actual]);

  // Initial remote load — remote wins on hydration, so devices converge on the shared truth.
  useEffect(() => {
    if (!SYNC_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await remoteFetch();
        if (cancelled) return;
        if (Array.isArray(remote.entries)) {
          skipNextSaveRef.current = true;
          setActual(remote.entries);
          lastSyncedRef.current = remote.updated || null;
        }
        setSyncStatus("synced");
      } catch {
        if (!cancelled) setSyncStatus("offline");
      } finally {
        if (!cancelled) readyToSyncRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull on focus/visibility so the other person's edits show up without a manual reload.
  // If we have an unflushed local change, push it first.
  useEffect(() => {
    if (!SYNC_ENABLED) return;
    const refresh = async () => {
      if (pendingWriteRef.current) return;
      if (dirtyRef.current) {
        pendingWriteRef.current = true;
        setSyncStatus("syncing…");
        try {
          const res = await remotePut(actualRef.current);
          lastSyncedRef.current = res.updated || null;
          dirtyRef.current = false;
          setSyncStatus("synced");
        } catch {
          setSyncStatus("offline");
        } finally {
          pendingWriteRef.current = false;
        }
        return;
      }
      try {
        const remote = await remoteFetch();
        if (
          remote.updated &&
          remote.updated !== lastSyncedRef.current &&
          Array.isArray(remote.entries)
        ) {
          skipNextSaveRef.current = true;
          setActual(remote.entries);
          lastSyncedRef.current = remote.updated;
        }
        setSyncStatus("synced");
      } catch {
        setSyncStatus("offline");
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(COLOR_PREF_KEY, colorPref);
  }, [colorPref]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e) => setSysDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  // ── Derived theme ──
  const isDark = colorPref === "auto" ? sysDark : colorPref === "dark";
  const t = THEMES[isDark ? "dark" : "light"];

  // ── Derived chart values ──
  const xS = makeXS(viewMin, viewMax);
  const xTicks = X_TICKS_ALL.filter((x) => x >= viewMin && x <= viewMax);

  const lastLuke = lastWith(actual, "luke");
  const lastLeia = lastWith(actual, "leia");

  const dogFits = { luke: null, leia: null };
  for (const dog of ["luke", "leia"]) {
    const pts = actual
      .filter((d) => d[dog] != null)
      .map((d) => ({ t: d.week, w: d[dog] }));
    if (pts.length >= 2) dogFits[dog] = fitDog(pts);
  }

  // ── Dynamic Y domain ──
  const visibleActualY = actual
    .filter((d) => d.week >= viewMin && d.week <= viewMax)
    .flatMap((d) => [d.luke, d.leia])
    .filter((v) => v != null && isFinite(v));
  const visibleTrendY = [];
  for (const dog of ["luke", "leia"]) {
    const fit = dogFits[dog];
    if (!fit) continue;
    for (let i = 0; i <= 40; i++) {
      const tw = viewMin + (i / 40) * (viewMax - viewMin);
      visibleTrendY.push(fit.fn(tw));
    }
  }
  const allVisibleY = [...visibleActualY, ...visibleTrendY].filter(isFinite);
  let domainMin, domainMax;
  if (allVisibleY.length === 0) {
    domainMin = 0;
    domainMax = 72;
  } else {
    const rawMin = Math.min(...allVisibleY);
    const rawMax = Math.max(...allVisibleY);
    const pad = (rawMax - rawMin) * 0.1 || 2;
    domainMin = Math.max(0, Math.floor((rawMin - pad) / 5) * 5);
    domainMax = Math.ceil((rawMax + pad) / 5) * 5;
  }
  const yS = makeYS(domainMin, domainMax);
  const yTicks = [];
  for (let t = domainMin; t <= domainMax; t += 5) yTicks.push(t);

  const actualLinePath = (dog) => {
    let started = false;
    return actual
      .map((d) => {
        if (d.week < viewMin || d.week > viewMax) {
          started = false;
          return "";
        }
        const v = d[dog];
        if (v == null) {
          started = false;
          return "";
        }
        const seg = `${started ? "L" : "M"}${xS(d.week).toFixed(1)},${yS(v).toFixed(1)}`;
        started = true;
        return seg;
      })
      .filter(Boolean)
      .join(" ");
  };

  const trendLinePath = (dog) => {
    const fit = dogFits[dog];
    if (!fit) return "";
    const { fn } = fit;
    const steps = 80;
    const segs = [];
    for (let i = 0; i <= steps; i++) {
      const tw = viewMin + (i / steps) * (viewMax - viewMin);
      const w = fn(tw);
      segs.push(
        `${segs.length === 0 ? "M" : "L"}${xS(tw).toFixed(1)},${yS(w).toFixed(1)}`,
      );
    }
    return segs.join(" ");
  };

  // Right-edge value labels for trends (asymptote) and band hi/lo per dog
  const rightLabels = [];
  for (const { dog, color } of [
    { dog: "luke", color: LUKE },
    { dog: "leia", color: LEIA },
  ]) {
    const fit = dogFits[dog];
    if (!fit) continue;
    const band = scaleBand(fit.A);
    const hiV = band.high[band.high.length - 1].v;
    const loV = band.low[band.low.length - 1].v;
    rightLabels.push({
      y: yS(hiV),
      text: Math.round(hiV).toString(),
      color,
      opacity: 0.5,
    });
    rightLabels.push({
      y: yS(fit.A),
      text: `~${Math.round(fit.A)}`,
      color,
      opacity: 0.85,
    });
    rightLabels.push({
      y: yS(loV),
      text: Math.round(loV).toString(),
      color,
      opacity: 0.5,
    });
  }
  rightLabels.sort((a, b) => a.y - b.y);
  const MIN_LABEL_GAP = 9;
  for (let i = 1; i < rightLabels.length; i++) {
    if (rightLabels[i].y < rightLabels[i - 1].y + MIN_LABEL_GAP)
      rightLabels[i].y = rightLabels[i - 1].y + MIN_LABEL_GAP;
  }

  // ── Form validation ──
  const lukeNum = parseFloat(lukeStr);
  const leiaNum = parseFloat(leiaStr);
  const lukeOk = Number.isFinite(lukeNum) && lukeNum > 0;
  const leiaOk = Number.isFinite(leiaNum) && leiaNum > 0;
  const dateOk =
    /^\d{4}-\d{2}-\d{2}$/.test(dateStr) &&
    !Number.isNaN(new Date(dateStr).getTime());
  const canAdd = dateOk && (lukeOk || leiaOk);
  const previewWeek = dateOk
    ? dateToWeek(new Date(dateStr + "T12:00:00"))
    : null;

  const handleAdd = () => {
    if (!canAdd) return;
    const [y, m, d] = dateStr.split("-").map(Number);
    const week = dateToWeek(new Date(y, m - 1, d, 12, 0, 0));
    const entry = { week };
    if (lukeOk) entry.luke = Math.round(lukeNum * 10) / 10;
    if (leiaOk) entry.leia = Math.round(leiaNum * 10) / 10;
    setActual((prev) => [...prev, entry].sort((a, b) => a.week - b.week));
    setLukeStr("");
    setLeiaStr("");
  };

  const handleDelete = (idx) =>
    setActual((prev) => prev.filter((_, i) => i !== idx));

  const handleChartPoint = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (clientX - rect.left) * (VW / rect.width);
    const svgY = (clientY - rect.top) * (VH / rect.height);
    if (svgX < PL || svgX > PL + CW || svgY < PT || svgY > PT + CH) {
      setTip(null);
      return;
    }
    const hoverWeek = viewMin + ((svgX - PL) / CW) * (viewMax - viewMin);
    // Snap to nearest data row by horizontal distance
    const SNAP_PX = 16;
    let snapEntry = null,
      bestDist = SNAP_PX;
    for (const d of actual) {
      if (d.week < viewMin || d.week > viewMax) continue;
      const dx = Math.abs(xS(d.week) - svgX);
      if (dx < bestDist) {
        bestDist = dx;
        snapEntry = d;
      }
    }
    const displayWeek = snapEntry?.week ?? hoverWeek;
    const lukeVal = snapEntry?.luke ?? dogFits.luke?.fn(displayWeek) ?? null;
    const leiaVal = snapEntry?.leia ?? dogFits.leia?.fn(displayWeek) ?? null;
    if (lukeVal == null && leiaVal == null) {
      setTip(null);
      return;
    }
    setTip({
      svgX: xS(displayWeek),
      svgY,
      week: displayWeek,
      luke: lukeVal,
      lukeIsActual: snapEntry != null && snapEntry.luke != null,
      leia: leiaVal,
      leiaIsActual: snapEntry != null && snapEntry.leia != null,
    });
  };

  const handleChartMove = (e) => handleChartPoint(e.clientX, e.clientY);

  const handleChartTouch = (e) => {
    if (e.touches.length > 0) {
      clearTimeout(tipTimerRef.current);
      handleChartPoint(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => setTip(null), 2500);
  };

  const cycleColor = () =>
    setColorPref((p) =>
      p === "auto" ? "light" : p === "light" ? "dark" : "auto",
    );
  const colorLabel = { auto: "⚙ Auto", light: "☀ Light", dark: "☾ Dark" }[
    colorPref
  ];

  // ── Shared style shortcuts ──
  const inp = (extra) => ({
    background: t.inputBg,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    color: t.text,
    padding: "10px",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
    ...extra,
  });

  const sectionLabel = {
    fontSize: 11,
    color: t.textFaint,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 10,
  };

  return (
    <div
      style={{
        background: t.bg,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 12px 40px",
        boxSizing: "border-box",
        fontFamily: "Georgia, 'Times New Roman', serif",
        colorScheme: isDark ? "dark" : "light",
      }}
    >
      {/* ── Header ── */}
      <div style={{ width: "100%", maxWidth: 480, marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: "normal",
                color: t.text,
                fontStyle: "italic",
                letterSpacing: "0.02em",
                marginBottom: 4,
              }}
            >
              Luke &amp; Leia
            </div>
            <div
              style={{
                fontSize: 12,
                color: t.textFaint,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Growth Chart
            </div>
          </div>
          {/* Theme toggle */}
          <button
            type="button"
            onClick={cycleColor}
            aria-label={`Color scheme: ${colorPref}. Click to change.`}
            style={{
              background: t.surface2,
              color: t.textMuted,
              border: `1px solid ${t.border}`,
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: "0.04em",
              marginTop: 2,
            }}
          >
            {colorLabel}
          </button>
        </div>

        {/* Stat cards */}
        <div
          style={{ display: "flex", gap: 10, marginTop: 14, marginBottom: 4 }}
        >
          {[
            {
              name: "Luke",
              entry: lastLuke,
              dog: "luke",
              color: LUKE,
              txtColor: t.lukeTxt,
            },
            {
              name: "Leia",
              entry: lastLeia,
              dog: "leia",
              color: LEIA,
              txtColor: t.leiaTxt,
            },
          ].map(({ name, entry, dog, color, txtColor }) => (
            <div
              key={name}
              style={{
                flex: 1,
                background: t.surface,
                borderRadius: 10,
                padding: "12px 14px",
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: t.textFaint,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: 26,
                  color: txtColor,
                  fontWeight: "bold",
                  letterSpacing: "-0.01em",
                }}
              >
                {entry ? entry[dog] : "—"}
              </div>
              <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
                {entry ? `lbs · ${fmtAge(entry.week)}` : "no data yet"}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: 11,
            color: t.textVF,
            textAlign: "center",
            marginTop: 6,
          }}
        >
          {(() => {
            const lFit = dogFits.luke;
            const eFit = dogFits.leia;
            const latest = actual.length ? actual[actual.length - 1] : null;
            const asOf = latest
              ? `updated through ${fmtShort(weekToDate(latest.week))} (${fmtAgeShort(latest.week)})`
              : null;
            const base =
              lFit && eFit
                ? `Luke ~${Math.round(lFit.A)} lb · Leia ~${Math.round(eFit.A)} lb projected`
                : "Breed range: 35–60 lb";
            return asOf ? `${base} · ${asOf}` : base;
          })()}
        </div>
      </div>

      {/* ── Chart ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: t.surface,
          borderRadius: 12,
          padding: "14px 8px 10px",
          boxSizing: "border-box",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            overflow: "hidden",
          }}
          role="img"
          aria-label="Puppy growth chart showing Luke and Leia weight over time"
        >
          <defs>
            <clipPath id="chart-clip">
              <rect x={PL} y={PT} width={CW} height={CH} />
            </clipPath>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid */}
          {yTicks.map((y) => (
            <line
              key={y}
              x1={PL}
              y1={yS(y)}
              x2={PL + CW}
              y2={yS(y)}
              stroke={t.gridLine}
              strokeWidth={0.8}
            />
          ))}
          {xTicks.map((x) => (
            <line
              key={x}
              x1={xS(x)}
              y1={PT}
              x2={xS(x)}
              y2={PT + CH}
              stroke={t.gridLine}
              strokeWidth={0.8}
            />
          ))}

          {/* 14w calibration line */}
          {viewMin <= 14 && viewMax >= 14 && (
            <line
              x1={xS(14)}
              y1={PT}
              x2={xS(14)}
              y2={PT + CH}
              stroke={t.calLine}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Per-dog projection bands (clipped) */}
          {[
            { dog: "luke", color: LUKE },
            { dog: "leia", color: LEIA },
          ].map(({ dog, color }) => {
            const fit = dogFits[dog];
            if (!fit) return null;
            const band = scaleBand(fit.A);
            return (
              <g key={dog} clipPath="url(#chart-clip)">
                <path
                  d={bandPath(band.low, band.high, xS, yS)}
                  fill={color}
                  fillOpacity={0.07}
                />
                <path
                  d={toD(band.high, xS, yS)}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.7}
                  strokeDasharray="4 3"
                  strokeOpacity={0.25}
                />
                <path
                  d={toD(band.low, xS, yS)}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.7}
                  strokeDasharray="4 3"
                  strokeOpacity={0.25}
                />
              </g>
            );
          })}

          {/* Right-edge labels: band hi, ~asymptote, band lo per dog */}
          {rightLabels.map((lbl, i) =>
            lbl.y >= PT - 2 && lbl.y <= PT + CH + 4 ? (
              <text
                key={i}
                x={PL + CW + 3}
                y={lbl.y + 3}
                fill={lbl.color}
                fontSize={7.5}
                opacity={lbl.opacity}
              >
                {lbl.text}
              </text>
            ) : null,
          )}

          {/* Trend lines (clipped, behind actual) */}
          <g clipPath="url(#chart-clip)">
            {[
              { dog: "leia", color: LEIA },
              { dog: "luke", color: LUKE },
            ].map(({ dog, color }) => {
              const d = trendLinePath(dog);
              return d ? (
                <path
                  key={dog}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.2}
                  strokeDasharray="5 3"
                  strokeOpacity={0.5}
                />
              ) : null;
            })}
          </g>

          {/* Data points */}
          {actual.map((d, i) => (
            <g key={i} clipPath="url(#chart-clip)">
              {[
                { dog: "luke", color: LUKE },
                { dog: "leia", color: LEIA },
              ].map(({ dog, color }) =>
                d[dog] != null && d.week >= viewMin && d.week <= viewMax ? (
                  <circle
                    key={dog}
                    cx={xS(d.week)}
                    cy={yS(d[dog])}
                    r={6}
                    fill={color}
                    stroke={t.surface}
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </g>
          ))}

          {/* Hover overlay — captures mouse/touch for tooltip */}
          <rect
            x={PL}
            y={PT}
            width={CW}
            height={CH}
            fill="transparent"
            style={{ cursor: "crosshair" }}
            onMouseMove={handleChartMove}
            onMouseLeave={() => setTip(null)}
            onTouchStart={handleChartTouch}
            onTouchMove={handleChartTouch}
            onTouchEnd={handleTouchEnd}
          />

          {/* Tooltip */}
          {tip &&
            (() => {
              const lines = [
                {
                  text: `${fmtShort(weekToDate(tip.week))} · ${fmtAgeShort(tip.week)}`,
                  color: "#8a9ab0",
                },
              ];
              if (tip.luke != null)
                lines.push({
                  text: `Luke  ${tip.lukeIsActual ? "" : "~"}${tip.luke.toFixed(1)} lb`,
                  color: LUKE,
                });
              if (tip.leia != null)
                lines.push({
                  text: `Leia  ${tip.leiaIsActual ? "" : "~"}${tip.leia.toFixed(1)} lb`,
                  color: LEIA,
                });
              const TT_W = 108,
                LINE_H = 13,
                PAD = 6;
              const TT_H = PAD * 2 + lines.length * LINE_H;
              let tx = tip.svgX + 10;
              if (tx + TT_W > PL + CW) tx = tip.svgX - TT_W - 10;
              let ty = tip.svgY - TT_H - 10;
              if (ty < PT) ty = tip.svgY + 14;
              return (
                <g style={{ pointerEvents: "none" }}>
                  <line
                    x1={tip.svgX}
                    y1={PT}
                    x2={tip.svgX}
                    y2={PT + CH}
                    stroke={t.axisLine}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <rect
                    x={tx}
                    y={ty}
                    width={TT_W}
                    height={TT_H}
                    rx={4}
                    fill={t.ttBg}
                    opacity={0.93}
                  />
                  {lines.map((l, i) => (
                    <text
                      key={i}
                      x={tx + PAD}
                      y={ty + PAD + (i + 0.82) * LINE_H}
                      fill={l.color}
                      fontSize={10}
                      fontFamily="Georgia,serif"
                    >
                      {l.text}
                    </text>
                  ))}
                </g>
              );
            })()}

          {/* Axes */}
          <line
            x1={PL}
            y1={PT}
            x2={PL}
            y2={PT + CH}
            stroke={t.axisLine}
            strokeWidth={1}
          />
          <line
            x1={PL}
            y1={PT + CH}
            x2={PL + CW}
            y2={PT + CH}
            stroke={t.axisLine}
            strokeWidth={1}
          />

          {/* Y labels */}
          {yTicks.map((y) => (
            <text
              key={y}
              x={PL - 4}
              y={yS(y) + 4}
              fill={t.textFaint}
              fontSize={9}
              textAnchor="end"
            >
              {y}
            </text>
          ))}

          {/* X labels (every other visible tick) */}
          {xTicks
            .filter((_, i) => i % 2 === 0)
            .map((x) => (
              <text
                key={x}
                x={xS(x)}
                y={PT + CH + 14}
                fill={t.textFaint}
                fontSize={9}
                textAnchor="middle"
              >
                {x}w
              </text>
            ))}

          {/* Axis titles */}
          <text
            x={PL + CW / 2}
            y={VH - 2}
            fill={t.textVF}
            fontSize={9}
            textAnchor="middle"
          >
            Age (weeks)
          </text>
          <text
            transform={`rotate(-90,9,${PT + CH / 2})`}
            x={9}
            y={PT + CH / 2 + 3}
            fill={t.textVF}
            fontSize={9}
            textAnchor="middle"
          >
            lbs
          </text>
        </svg>

        {/* ── Range slider ── */}
        <div
          style={{
            padding: "4px 8px 6px",
            borderTop: `1px solid ${t.border}`,
            marginTop: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: t.textFaint,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              View
            </span>
            <span
              style={{
                fontSize: 12,
                color: t.textMuted,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtShort(weekToDate(viewMin))} – {fmtShort(weekToDate(viewMax))}
              <span style={{ color: t.textVF, marginLeft: 6 }}>
                ({viewMin}–{viewMax}w)
              </span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              {
                label: "Start",
                value: viewMin,
                min: X_ABS_MIN,
                max: viewMax - 1,
                onChange: (v) => setViewMin(v),
              },
              {
                label: "End",
                value: viewMax,
                min: viewMin + 1,
                max: X_ABS_MAX,
                onChange: (v) => setViewMax(v),
              },
            ].map(({ label, value, min, max, onChange }) => (
              <div
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: t.textVF,
                    width: 30,
                    textAlign: "right",
                    letterSpacing: "0.04em",
                  }}
                >
                  {label}
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={value}
                  onChange={(e) => onChange(Number(e.target.value))}
                  aria-label={`View ${label.toLowerCase()} week`}
                  style={{ flex: 1, accentColor: BAND_C, cursor: "pointer" }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: t.textMuted,
                    width: 26,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {value}w
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          gap: 8,
          marginTop: 12,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {[
          { color: LUKE, label: "Luke", txtColor: t.lukeTxt },
          { color: LEIA, label: "Leia", txtColor: t.leiaTxt },
        ].map(({ color, label, txtColor }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: t.surface,
              borderRadius: 8,
              padding: "7px 12px",
            }}
          >
            <svg
              width="10"
              height="10"
              style={{ display: "block", flexShrink: 0 }}
            >
              <circle cx="5" cy="5" r="4" fill={color} />
            </svg>
            <span
              style={{
                color: isDark ? color : txtColor,
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              {label}
            </span>
          </div>
        ))}
        {[
          { dog: "luke", color: LUKE, txtColor: t.lukeTxt, label: "Luke" },
          { dog: "leia", color: LEIA, txtColor: t.leiaTxt, label: "Leia" },
        ].map(({ dog, color, txtColor, label }) => {
          const fit = dogFits[dog];
          return (
            <div
              key={dog}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: t.surface,
                borderRadius: 8,
                padding: "7px 12px",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 3,
                  background: color,
                  borderRadius: 2,
                  opacity: 0.4,
                }}
              />
              <span style={{ color: t.textMuted, fontSize: 13 }}>
                {fit ? `~${Math.round(fit.A)} lb` : `${label} range`}
              </span>
            </div>
          );
        })}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: t.surface,
            borderRadius: 8,
            padding: "7px 12px",
          }}
        >
          <svg width="18" height="3" style={{ display: "block" }}>
            <line
              x1="0"
              y1="1.5"
              x2="18"
              y2="1.5"
              stroke={LUKE}
              strokeWidth="1.5"
              strokeDasharray="4 2"
              opacity="0.6"
            />
          </svg>
          <span style={{ color: t.textMuted, fontSize: 13 }}>Best fit</span>
        </div>
      </div>

      {/* ── Add weight form ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          marginTop: 16,
          background: t.surface,
          borderRadius: 12,
          padding: "14px 14px 16px",
          boxSizing: "border-box",
        }}
      >
        <div style={sectionLabel}>Add weight</div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            aria-label="Measurement date"
            style={inp({
              flex: "1 1 140px",
              minWidth: 0,
              colorScheme: isDark ? "dark" : "light",
            })}
          />
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            placeholder="Luke lb"
            value={lukeStr}
            onChange={(e) => setLukeStr(e.target.value)}
            aria-label="Luke weight in pounds"
            style={inp({
              flex: "1 1 88px",
              minWidth: 0,
              color: lukeOk ? t.lukeTxt : t.text,
              borderColor: lukeOk ? LUKE + "66" : t.border,
            })}
          />
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            placeholder="Leia lb"
            value={leiaStr}
            onChange={(e) => setLeiaStr(e.target.value)}
            aria-label="Leia weight in pounds"
            style={inp({
              flex: "1 1 88px",
              minWidth: 0,
              color: leiaOk ? t.leiaTxt : t.text,
              borderColor: leiaOk ? LEIA + "66" : t.border,
            })}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          style={{
            width: "100%",
            background: canAdd ? t.btnActive : t.surface2,
            color: canAdd ? t.text : t.textVF,
            border: `1px solid ${canAdd ? t.btnBorder : t.border}`,
            borderRadius: 8,
            padding: "11px",
            fontSize: 14,
            cursor: canAdd ? "pointer" : "not-allowed",
            letterSpacing: "0.04em",
          }}
        >
          {previewWeek != null ? `Add — ${fmtAge(previewWeek)}` : "Add"}
        </button>
      </div>

      {/* ── History ── */}
      {actual.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            marginTop: 12,
            background: t.surface,
            borderRadius: 12,
            padding: "14px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              ...sectionLabel,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>History</span>
            <span style={{ color: t.textVF }}>
              {syncStatus
                ? `${syncStatus} · ${actual.length} entries`
                : `${actual.length} entries`}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {actual
              .map((d, i) => ({ d, i }))
              .slice()
              .reverse()
              .map(({ d, i }) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: t.surface2,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{ color: t.textMuted, minWidth: 50, fontSize: 12 }}
                  >
                    {fmtShort(weekToDate(d.week))}
                  </span>
                  <span
                    style={{
                      color: t.textVF,
                      minWidth: 52,
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtAgeShort(d.week)}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      display: "flex",
                      gap: 10,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span
                      style={{
                        color: d.luke != null ? t.lukeTxt : t.textVF,
                        minWidth: 46,
                      }}
                    >
                      {d.luke != null ? `${d.luke} lb` : "—"}
                    </span>
                    <span
                      style={{
                        color: d.leia != null ? t.leiaTxt : t.textVF,
                        minWidth: 46,
                      }}
                    >
                      {d.leia != null ? `${d.leia} lb` : "—"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(i)}
                    aria-label={`Delete entry for ${fmtShort(weekToDate(d.week))}`}
                    style={{
                      background: "transparent",
                      color: t.deleteBtn,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 18,
                      lineHeight: 1,
                      padding: "0 4px",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          color: t.textVF,
          fontSize: 11,
          textAlign: "center",
          lineHeight: 1.7,
          maxWidth: 400,
        }}
      >
        Border Collie × Pit Bull type · tap points for details
      </div>
    </div>
  );
}
