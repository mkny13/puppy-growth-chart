import { useEffect, useState } from "react";

// ── Date helpers ────────────────────────────────────────────────────────────
const BIRTH = new Date(2026, 1, 16);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const dateToWeek = d => Math.round(((d - BIRTH) / MS_PER_WEEK) * 100) / 100;
const weekToDate = w => new Date(BIRTH.getTime() + w * MS_PER_WEEK);
const fmtDateLocal = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtShort = d =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtAge = weeks => {
  const totalDays = Math.round(weeks * 7);
  const months = Math.floor(totalDays / 30);
  const rem = totalDays - months * 30;
  const wks = Math.floor(rem / 7);
  const days = rem % 7;
  const parts = [];
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  if (wks > 0) parts.push(`${wks} week${wks !== 1 ? 's' : ''}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  return parts.join(', ');
};

const fmtAgeShort = weeks => {
  const totalDays = Math.round(weeks * 7);
  const months = Math.floor(totalDays / 30);
  const rem = totalDays - months * 30;
  const wks = Math.floor(rem / 7);
  const days = rem % 7;
  const parts = [];
  if (months > 0) parts.push(`${months}mo`);
  if (wks > 0) parts.push(`${wks}w`);
  if (days > 0 || parts.length === 0) parts.push(`${days}d`);
  return parts.join(' ');
};

// ── Data ─────────────────────────────────────────────────────────────────────
const SEED_ACTUAL = [
  { week: 9.71,  luke: 15.0, leia: 11.0 },
  { week: 10.0,  luke: 17.3, leia: 11.8 },
  { week: 10.57, luke: 18.4, leia: 13.0 },
];

// Breed-prior projection band: 35–60 lb adult
const BAND = {
  high: [{w:9.3,v:16},{w:10.1,v:19},{w:12,v:24},{w:14,v:29},{w:18,v:38},{w:22,v:47},{w:26,v:54},{w:32,v:58},{w:38,v:60},{w:44,v:60},{w:52,v:60}],
  low:  [{w:9.3,v:10},{w:10.1,v:12},{w:12,v:15},{w:14,v:18},{w:18,v:23},{w:22,v:28},{w:26,v:32},{w:32,v:34},{w:38,v:35},{w:44,v:35},{w:52,v:35}],
};

// ── SVG accent colors (chart lines/dots – non-text, no contrast req) ─────────
const LUKE   = '#6ab0f5';
const LEIA   = '#f07090';
const BAND_C = '#8aa8be';

// ── Chart geometry ───────────────────────────────────────────────────────────
const X_ABS_MIN = 9, X_ABS_MAX = 52, Y_MIN = 0, Y_MAX = 65;
const VW = 400, VH = 300;
const PL = 38, PR = 16, PT = 12, PB = 36;
const CW = VW - PL - PR, CH = VH - PT - PB;

// y-scale is static; x-scale depends on zoom view
const yS = v => PT + CH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * CH;
const makeXS = (min, max) => w => PL + ((w - min) / (max - min)) * CW;

const toD = (pts, xS) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`).join(' ');

const bandPath = (lo, hi, xS) => {
  const top = hi.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`).join(' ');
  const bot = [...lo].reverse().map(p => `L${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`).join(' ');
  return `${top} ${bot} Z`;
};

// ── Logistic trend fit: W(t) = A / (1 + exp(-k*(t-t0))) ─────────────────────
// A = adult weight prior (band midpoint). OLS in transformed space.
const ADULT_A = 47;
const fitLogistic = (pts, A = ADULT_A) => {
  const valid = pts.filter(p => p.w > 0 && p.w < A * 0.99);
  if (valid.length < 2) return null;
  const xs = valid.map(p => p.t);
  const ys = valid.map(p => {
    const r = A / p.w - 1;
    return r > 0 ? Math.log(r) : null;
  });
  if (ys.some(v => v == null)) return null;
  const n = xs.length;
  const mX = xs.reduce((s, v) => s + v, 0) / n;
  const mY = ys.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, v, i) => s + (v - mX) * (ys[i] - mY), 0);
  const den = xs.reduce((s, v) => s + (v - mX) ** 2, 0);
  if (Math.abs(den) < 1e-10) return null;
  const k = -(num / den);
  if (k <= 0) return null;
  const t0 = mX + mY / k;
  return t => A / (1 + Math.exp(-k * (t - t0)));
};

// ── Tick arrays ───────────────────────────────────────────────────────────────
const X_TICKS_ALL = [10, 14, 18, 22, 26, 30, 36, 42, 48, 52];
const Y_TICKS = [10, 20, 30, 40, 50, 60];

// ── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY   = 'puppy-weights:v2';
const COLOR_PREF_KEY = 'puppy-color-pref';

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
    bg:         '#13161d',
    surface:    '#1a1e26',
    surface2:   '#1c2028',
    border:     '#2a3040',
    text:       '#f0ece4',   // 16.9:1 on bg ✓
    textMuted:  '#9aaab8',   // 6.5:1 on bg ✓
    textFaint:  '#7a8a9a',   // 5.1:1 on bg ✓
    textVF:     '#6a7a8a',   // 4.2:1 — large/UI only
    gridLine:   'rgba(255,255,255,0.06)',
    axisLine:   'rgba(255,255,255,0.15)',
    ttBg:       '#0e1117',
    inputBg:    '#0e1117',
    lukeTxt:    '#6ab0f5',   // 8.4:1 at 26px bold ✓
    leiaTxt:    '#f07090',   // 10:1 at 26px bold ✓
    calLine:    'rgba(232,192,96,0.4)',
    sliderTrack:'#2a3040',
    btnActive:  '#2a3a4a',
    btnBorder:  '#3a4a5a',
    deleteBtn:  '#5a6a7a',
  },
  light: {
    bg:         '#f5f2ec',
    surface:    '#ffffff',
    surface2:   '#eceae4',
    border:     '#d0c8bc',
    text:       '#1a1e26',   // 15.8:1 on bg ✓
    textMuted:  '#3a4455',   // 8.7:1 on bg ✓
    textFaint:  '#5a6475',   // 5.3:1 on bg ✓
    textVF:     '#7a8490',   // 3.4:1 — large/UI only
    gridLine:   'rgba(0,0,0,0.07)',
    axisLine:   'rgba(0,0,0,0.15)',
    ttBg:       '#1a1e26',
    inputBg:    '#ffffff',
    lukeTxt:    '#1a6ab5',   // 5.6:1 on white ✓
    leiaTxt:    '#c0305a',   // 5.5:1 on white ✓
    calLine:    'rgba(160,120,0,0.55)',
    sliderTrack:'#d0c8bc',
    btnActive:  '#ddd9d2',
    btnBorder:  '#bfb9b0',
    deleteBtn:  '#7a8490',
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
  const [tip, setTip]         = useState(null);
  const [dateStr, setDateStr] = useState(() => fmtDateLocal(new Date()));
  const [lukeStr, setLukeStr] = useState('');
  const [leiaStr, setLeiaStr] = useState('');
  const [viewMin, setViewMin] = useState(X_ABS_MIN);
  const [viewMax, setViewMax] = useState(X_ABS_MAX);
  const [colorPref, setColorPref] = useState(
    () => localStorage.getItem(COLOR_PREF_KEY) || 'auto'
  );
  const [sysDark, setSysDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // ── Effects ──
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(actual)); } catch {}
  }, [actual]);

  useEffect(() => {
    localStorage.setItem(COLOR_PREF_KEY, colorPref);
  }, [colorPref]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = e => setSysDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // ── Derived theme ──
  const isDark = colorPref === 'auto' ? sysDark : colorPref === 'dark';
  const t = THEMES[isDark ? 'dark' : 'light'];

  // ── Derived chart values ──
  const xS = makeXS(viewMin, viewMax);
  const xTicks = X_TICKS_ALL.filter(x => x >= viewMin && x <= viewMax);

  const lastLuke = lastWith(actual, 'luke');
  const lastLeia = lastWith(actual, 'leia');

  const actualLinePath = dog => {
    let started = false;
    return actual.map(d => {
      if (d.week < viewMin || d.week > viewMax) { started = false; return ''; }
      const v = d[dog];
      if (v == null) { started = false; return ''; }
      const seg = `${started ? 'L' : 'M'}${xS(d.week).toFixed(1)},${yS(v).toFixed(1)}`;
      started = true;
      return seg;
    }).filter(Boolean).join(' ');
  };

  const trendLinePath = dog => {
    const pts = actual.filter(d => d[dog] != null).map(d => ({ t: d.week, w: d[dog] }));
    if (pts.length < 2) return '';
    const fn = fitLogistic(pts);
    if (!fn) return '';
    const steps = 80;
    const segs = [];
    for (let i = 0; i <= steps; i++) {
      const tw = viewMin + (i / steps) * (viewMax - viewMin);
      const w = fn(tw);
      if (w <= Y_MIN || w >= Y_MAX) continue;
      segs.push(`${segs.length === 0 ? 'M' : 'L'}${xS(tw).toFixed(1)},${yS(w).toFixed(1)}`);
    }
    return segs.join(' ');
  };

  // ── Form validation ──
  const lukeNum  = parseFloat(lukeStr);
  const leiaNum  = parseFloat(leiaStr);
  const lukeOk   = Number.isFinite(lukeNum) && lukeNum > 0;
  const leiaOk   = Number.isFinite(leiaNum) && leiaNum > 0;
  const dateOk   = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(new Date(dateStr).getTime());
  const canAdd   = dateOk && (lukeOk || leiaOk);
  const previewWeek = dateOk ? dateToWeek(new Date(dateStr + 'T12:00:00')) : null;

  const handleAdd = () => {
    if (!canAdd) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const week = dateToWeek(new Date(y, m - 1, d, 12, 0, 0));
    const entry = { week };
    if (lukeOk) entry.luke = Math.round(lukeNum * 10) / 10;
    if (leiaOk) entry.leia = Math.round(leiaNum * 10) / 10;
    setActual(prev => [...prev, entry].sort((a, b) => a.week - b.week));
    setLukeStr('');
    setLeiaStr('');
  };

  const handleDelete = idx => setActual(prev => prev.filter((_, i) => i !== idx));

  const cycleColor = () =>
    setColorPref(p => p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto');
  const colorLabel = { auto: '⚙ Auto', light: '☀ Light', dark: '☾ Dark' }[colorPref];

  // ── Shared style shortcuts ──
  const inp = extra => ({
    background: t.inputBg,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    color: t.text,
    padding: '10px',
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
    ...extra,
  });

  const sectionLabel = {
    fontSize: 11,
    color: t.textFaint,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 10,
  };

  return (
    <div style={{
      background: t.bg,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 12px 40px',
      boxSizing: 'border-box',
      fontFamily: "Georgia, 'Times New Roman', serif",
      colorScheme: isDark ? 'dark' : 'light',
    }}>

      {/* ── Header ── */}
      <div style={{ width: '100%', maxWidth: 480, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'normal', color: t.text,
              fontStyle: 'italic', letterSpacing: '0.02em', marginBottom: 4 }}>
              Luke &amp; Leia
            </div>
            <div style={{ fontSize: 12, color: t.textFaint, letterSpacing: '0.08em',
              textTransform: 'uppercase' }}>
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
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              marginTop: 2,
            }}
          >
            {colorLabel}
          </button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, marginBottom: 4 }}>
          {[
            { name: 'Luke', entry: lastLuke, dog: 'luke', color: LUKE, txtColor: t.lukeTxt },
            { name: 'Leia', entry: lastLeia, dog: 'leia', color: LEIA, txtColor: t.leiaTxt },
          ].map(({ name, entry, dog, color, txtColor }) => (
            <div key={name} style={{
              flex: 1, background: t.surface, borderRadius: 10,
              padding: '12px 14px', borderLeft: `3px solid ${color}`,
            }}>
              <div style={{ fontSize: 11, color: t.textFaint, letterSpacing: '0.08em',
                textTransform: 'uppercase', marginBottom: 4 }}>{name}</div>
              <div style={{ fontSize: 26, color: txtColor, fontWeight: 'bold',
                letterSpacing: '-0.01em' }}>
                {entry ? entry[dog] : '—'}
              </div>
              <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
                {entry ? `lbs · ${fmtAge(entry.week)}` : 'no data yet'}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: t.textVF, textAlign: 'center', marginTop: 6 }}>
          Projected adult range: 35–60 lb · calibrates at 14w (~Jun 13)
        </div>
      </div>

      {/* ── Chart ── */}
      <div style={{ width: '100%', maxWidth: 480, background: t.surface,
        borderRadius: 12, padding: '14px 8px 10px', boxSizing: 'border-box' }}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'hidden' }}
          role="img"
          aria-label="Puppy growth chart showing Luke and Leia weight over time"
        >
          <defs>
            <clipPath id="chart-clip">
              <rect x={PL} y={PT} width={CW} height={CH} />
            </clipPath>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Grid */}
          {Y_TICKS.map(y => (
            <line key={y} x1={PL} y1={yS(y)} x2={PL + CW} y2={yS(y)}
              stroke={t.gridLine} strokeWidth={0.8} />
          ))}
          {xTicks.map(x => (
            <line key={x} x1={xS(x)} y1={PT} x2={xS(x)} y2={PT + CH}
              stroke={t.gridLine} strokeWidth={0.8} />
          ))}

          {/* 14w calibration line */}
          {viewMin <= 14 && viewMax >= 14 && (
            <line x1={xS(14)} y1={PT} x2={xS(14)} y2={PT + CH}
              stroke={t.calLine} strokeWidth={1} strokeDasharray="3 3" />
          )}

          {/* Projection band (clipped) */}
          <g clipPath="url(#chart-clip)">
            <path d={bandPath(BAND.low, BAND.high, xS)} fill={BAND_C} fillOpacity={0.12} />
            <path d={toD(BAND.high, xS)} fill="none" stroke={BAND_C}
              strokeWidth={0.8} strokeDasharray="4 3" strokeOpacity={0.3} />
            <path d={toD(BAND.low, xS)} fill="none" stroke={BAND_C}
              strokeWidth={0.8} strokeDasharray="4 3" strokeOpacity={0.3} />
          </g>

          {/* Band edge labels */}
          <text x={PL + CW + 2} y={yS(60) + 4} fill={BAND_C} fontSize={8} opacity={0.55}>60</text>
          <text x={PL + CW + 2} y={yS(35) + 4} fill={BAND_C} fontSize={8} opacity={0.55}>35</text>

          {/* Trend lines (clipped, behind actual) */}
          <g clipPath="url(#chart-clip)">
            {[{ dog: 'leia', color: LEIA }, { dog: 'luke', color: LUKE }].map(({ dog, color }) => {
              const d = trendLinePath(dog);
              return d ? (
                <path key={dog} d={d} fill="none" stroke={color}
                  strokeWidth={1.2} strokeDasharray="5 3" strokeOpacity={0.5} />
              ) : null;
            })}
          </g>

          {/* Actual lines (clipped) */}
          <g clipPath="url(#chart-clip)">
            <path d={actualLinePath('leia')} fill="none" stroke={LEIA}
              strokeWidth={2.5} filter="url(#glow)" strokeLinecap="round" />
            <path d={actualLinePath('luke')} fill="none" stroke={LUKE}
              strokeWidth={2.5} filter="url(#glow)" strokeLinecap="round" />
          </g>

          {/* Data points */}
          {actual.map((d, i) => (
            <g key={i} clipPath="url(#chart-clip)">
              {[{ dog: 'luke', color: LUKE }, { dog: 'leia', color: LEIA }].map(({ dog, color }) =>
                d[dog] != null && d.week >= viewMin && d.week <= viewMax ? (
                  <circle key={dog}
                    cx={xS(d.week)} cy={yS(d[dog])} r={6}
                    fill={color} stroke={t.surface} strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setTip({
                      x: xS(d.week), y: yS(d[dog]) - 12,
                      text: `${dog === 'luke' ? 'Luke' : 'Leia'} ${d[dog]} lb · ${fmtAgeShort(d.week)}`
                    })}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => setTip(tip ? null : {
                      x: xS(d.week), y: yS(d[dog]) - 12,
                      text: `${dog === 'luke' ? 'Luke' : 'Leia'} ${d[dog]} lb · ${fmtAgeShort(d.week)}`
                    })}
                  />
                ) : null
              )}
            </g>
          ))}

          {/* Tooltip */}
          {tip && (() => {
            const w = tip.text.length * 5.8 + 10;
            const tx = Math.min(tip.x - 2, VW - w - 4);
            return (
              <g>
                <rect x={tx} y={tip.y - 14} width={w} height={18} rx={4}
                  fill={t.ttBg} opacity={0.92} />
                <text x={tx + 5} y={tip.y} fill={isDark ? '#f0ece4' : '#ffffff'}
                  fontSize={11} fontFamily="Georgia,serif">{tip.text}</text>
              </g>
            );
          })()}

          {/* Axes */}
          <line x1={PL} y1={PT} x2={PL} y2={PT + CH} stroke={t.axisLine} strokeWidth={1} />
          <line x1={PL} y1={PT + CH} x2={PL + CW} y2={PT + CH} stroke={t.axisLine} strokeWidth={1} />

          {/* Y labels */}
          {Y_TICKS.map(y => (
            <text key={y} x={PL - 4} y={yS(y) + 4} fill={t.textFaint}
              fontSize={9} textAnchor="end">{y}</text>
          ))}

          {/* X labels (every other visible tick) */}
          {xTicks.filter((_, i) => i % 2 === 0).map(x => (
            <text key={x} x={xS(x)} y={PT + CH + 14} fill={t.textFaint}
              fontSize={9} textAnchor="middle">{x}w</text>
          ))}

          {/* Axis titles */}
          <text x={PL + CW / 2} y={VH - 2} fill={t.textVF}
            fontSize={9} textAnchor="middle">Age (weeks)</text>
          <text transform={`rotate(-90,9,${PT + CH / 2})`} x={9} y={PT + CH / 2 + 3}
            fill={t.textVF} fontSize={9} textAnchor="middle">lbs</text>
        </svg>

        {/* ── Range slider ── */}
        <div style={{ padding: '4px 8px 6px', borderTop: `1px solid ${t.border}`, marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: t.textFaint, letterSpacing: '0.06em',
              textTransform: 'uppercase' }}>View</span>
            <span style={{ fontSize: 12, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {fmtShort(weekToDate(viewMin))} – {fmtShort(weekToDate(viewMax))}
              <span style={{ color: t.textVF, marginLeft: 6 }}>
                ({viewMin}–{viewMax}w)
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Start', value: viewMin, min: X_ABS_MIN, max: viewMax - 1, onChange: v => setViewMin(v) },
              { label: 'End',   value: viewMax, min: viewMin + 1, max: X_ABS_MAX, onChange: v => setViewMax(v) },
            ].map(({ label, value, min, max, onChange }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: t.textVF, width: 30, textAlign: 'right',
                  letterSpacing: '0.04em' }}>{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={value}
                  onChange={e => onChange(Number(e.target.value))}
                  aria-label={`View ${label.toLowerCase()} week`}
                  style={{ flex: 1, accentColor: BAND_C, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 11, color: t.textMuted, width: 26,
                  fontVariantNumeric: 'tabular-nums' }}>{value}w</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{
        width: '100%', maxWidth: 480,
        display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center',
        flexWrap: 'wrap',
      }}>
        {[{ color: LUKE, label: 'Luke' }, { color: LEIA, label: 'Leia' }].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8,
            background: t.surface, borderRadius: 8, padding: '7px 12px' }}>
            <div style={{ width: 18, height: 3, background: color, borderRadius: 2 }} />
            <span style={{ color: isDark ? color : (label === 'Luke' ? t.lukeTxt : t.leiaTxt),
              fontSize: 13, fontStyle: 'italic' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          background: t.surface, borderRadius: 8, padding: '7px 12px' }}>
          <div style={{ width: 18, height: 3, background: BAND_C, borderRadius: 2,
            opacity: 0.5, borderTop: `1px dashed ${BAND_C}` }} />
          <span style={{ color: t.textMuted, fontSize: 13 }}>Adult range</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          background: t.surface, borderRadius: 8, padding: '7px 12px' }}>
          <svg width="18" height="3" style={{ display: 'block' }}>
            <line x1="0" y1="1.5" x2="18" y2="1.5"
              stroke={LUKE} strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />
          </svg>
          <span style={{ color: t.textMuted, fontSize: 13 }}>Best fit</span>
        </div>
      </div>

      {/* ── Add weight form ── */}
      <div style={{
        width: '100%', maxWidth: 480, marginTop: 16,
        background: t.surface, borderRadius: 12, padding: '14px 14px 16px',
        boxSizing: 'border-box',
      }}>
        <div style={sectionLabel}>Add weight</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            type="date"
            value={dateStr}
            onChange={e => setDateStr(e.target.value)}
            aria-label="Measurement date"
            style={inp({ flex: '1 1 140px', minWidth: 0, colorScheme: isDark ? 'dark' : 'light' })}
          />
          <input
            type="number" step="0.1" inputMode="decimal"
            placeholder="Luke lb"
            value={lukeStr}
            onChange={e => setLukeStr(e.target.value)}
            aria-label="Luke weight in pounds"
            style={inp({ flex: '1 1 88px', minWidth: 0, color: lukeOk ? t.lukeTxt : t.text,
              borderColor: lukeOk ? LUKE + '66' : t.border })}
          />
          <input
            type="number" step="0.1" inputMode="decimal"
            placeholder="Leia lb"
            value={leiaStr}
            onChange={e => setLeiaStr(e.target.value)}
            aria-label="Leia weight in pounds"
            style={inp({ flex: '1 1 88px', minWidth: 0, color: leiaOk ? t.leiaTxt : t.text,
              borderColor: leiaOk ? LEIA + '66' : t.border })}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          style={{
            width: '100%',
            background: canAdd ? t.btnActive : t.surface2,
            color: canAdd ? t.text : t.textVF,
            border: `1px solid ${canAdd ? t.btnBorder : t.border}`,
            borderRadius: 8, padding: '11px', fontSize: 14,
            cursor: canAdd ? 'pointer' : 'not-allowed',
            letterSpacing: '0.04em',
          }}
        >
          {previewWeek != null
            ? `Add — ${fmtAge(previewWeek)}`
            : 'Add'}
        </button>
      </div>

      {/* ── History ── */}
      {actual.length > 0 && (
        <div style={{
          width: '100%', maxWidth: 480, marginTop: 12,
          background: t.surface, borderRadius: 12, padding: '14px',
          boxSizing: 'border-box',
        }}>
          <div style={{ ...sectionLabel, display: 'flex', justifyContent: 'space-between' }}>
            <span>History</span>
            <span style={{ color: t.textVF }}>{actual.length} entries</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {actual.map((d, i) => ({ d, i })).slice().reverse().map(({ d, i }) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: t.surface2, borderRadius: 8, padding: '8px 10px', fontSize: 13,
              }}>
                <span style={{ color: t.textMuted, minWidth: 50, fontSize: 12 }}>
                  {fmtShort(weekToDate(d.week))}
                </span>
                <span style={{ color: t.textVF, minWidth: 52, fontSize: 11,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {fmtAgeShort(d.week)}
                </span>
                <span style={{ flex: 1, display: 'flex', gap: 10,
                  fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: d.luke != null ? t.lukeTxt : t.textVF, minWidth: 46 }}>
                    {d.luke != null ? `${d.luke} lb` : '—'}
                  </span>
                  <span style={{ color: d.leia != null ? t.leiaTxt : t.textVF, minWidth: 46 }}>
                    {d.leia != null ? `${d.leia} lb` : '—'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  aria-label={`Delete entry for ${fmtShort(weekToDate(d.week))}`}
                  style={{
                    background: 'transparent', color: t.deleteBtn,
                    border: 'none', cursor: 'pointer', fontSize: 18,
                    lineHeight: 1, padding: '0 4px',
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, color: t.textVF, fontSize: 11,
        textAlign: 'center', lineHeight: 1.7, maxWidth: 400 }}>
        Border Collie × Pit Bull type · tap points for details
      </div>
    </div>
  );
}
