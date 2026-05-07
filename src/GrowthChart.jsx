import { useEffect, useState } from "react";

// === Birth date — drives date↔week conversion ===
const BIRTH = new Date(2026, 1, 16); // Feb 16 2026, local time
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const dateToWeek = d => Math.round(((d - BIRTH) / MS_PER_WEEK) * 100) / 100;
const weekToDate = w => new Date(BIRTH.getTime() + w * MS_PER_WEEK);
const fmtDateLocal = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtShort = d =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Seed data — used only when localStorage is empty
const SEED_ACTUAL = [
  { week: 9.3,  luke: 15.0, leia: 11.0 },  // pickup estimate
  { week: 9.6,  luke: 17.3, leia: 11.8 },  // vet Apr 27
  { week: 10.1, luke: 18.4, leia: 13.0 },  // home May 1
];

// Single shared band: 35–60 lbs adult
// Border Collie × Pit Bull type, small mom (~25 lbs)
const BAND = {
  high: [{w:9.3,v:16},{w:10.1,v:19},{w:12,v:24},{w:14,v:29},{w:18,v:38},{w:22,v:47},{w:26,v:54},{w:32,v:58},{w:38,v:60},{w:44,v:60},{w:52,v:60}],
  low:  [{w:9.3,v:10},{w:10.1,v:12},{w:12,v:15},{w:14,v:18},{w:18,v:23},{w:22,v:28},{w:26,v:32},{w:32,v:34},{w:38,v:35},{w:44,v:35},{w:52,v:35}],
};

const LUKE = '#6ab0f5';
const LEIA = '#f07090';
const BAND_C = '#8aa8be';

const X_MIN=9, X_MAX=52, Y_MIN=0, Y_MAX=65;
// Chart fills viewBox, padding handles margins
const VW=400, VH=300;
const PL=38, PR=16, PT=12, PB=36;
const CW=VW-PL-PR, CH=VH-PT-PB;

const xS = w => PL + ((w-X_MIN)/(X_MAX-X_MIN))*CW;
const yS = v => PT + CH - ((v-Y_MIN)/(Y_MAX-Y_MIN))*CH;
const toD = pts => pts.map((p,i)=>`${i===0?'M':'L'}${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`).join(' ');
const bandPath = (lo,hi) => {
  const top = hi.map((p,i)=>`${i===0?'M':'L'}${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`).join(' ');
  const bot = [...lo].reverse().map(p=>`L${xS(p.w).toFixed(1)},${yS(p.v).toFixed(1)}`).join(' ');
  return `${top} ${bot} Z`;
};

const X_TICKS = [10,14,18,22,26,30,36,42,48,52];
const Y_TICKS = [10,20,30,40,50,60];
const STORAGE_KEY = 'puppy-weights:v1';

const lastWith = (rows, dog) => {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][dog] != null) return rows[i];
  }
  return null;
};

export default function GrowthChart() {
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
  const [lukeStr, setLukeStr] = useState('');
  const [leiaStr, setLeiaStr] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actual));
    } catch {}
  }, [actual]);

  const lastLuke = lastWith(actual, 'luke');
  const lastLeia = lastWith(actual, 'leia');

  const actualPath = dog => {
    let started = false;
    const segs = [];
    for (const d of actual) {
      const v = d[dog];
      if (v == null) { started = false; continue; }
      segs.push(`${started ? 'L' : 'M'}${xS(d.week).toFixed(1)},${yS(v).toFixed(1)}`);
      started = true;
    }
    return segs.join(' ');
  };

  const lukeNum = parseFloat(lukeStr);
  const leiaNum = parseFloat(leiaStr);
  const lukeOk = Number.isFinite(lukeNum) && lukeNum > 0;
  const leiaOk = Number.isFinite(leiaNum) && leiaNum > 0;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(new Date(dateStr).getTime());
  const canAdd = dateOk && (lukeOk || leiaOk);
  const previewWeek = dateOk ? dateToWeek(new Date(dateStr + 'T12:00:00')) : null;

  const handleAdd = () => {
    if (!canAdd) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    const week = dateToWeek(date);
    const entry = { week };
    if (lukeOk) entry.luke = Math.round(lukeNum * 10) / 10;
    if (leiaOk) entry.leia = Math.round(leiaNum * 10) / 10;
    setActual(prev => [...prev, entry].sort((a, b) => a.week - b.week));
    setLukeStr('');
    setLeiaStr('');
  };

  const handleDelete = idx => {
    setActual(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{
      background: '#13161d',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '24px 12px 32px',
      boxSizing: 'border-box',
      fontFamily: "Georgia, 'Times New Roman', serif",
    }}>
      {/* Header */}
      <div style={{width:'100%',maxWidth:480,marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:'normal',color:'#f0ece4',
          fontStyle:'italic',letterSpacing:'0.02em',marginBottom:6}}>
          Luke &amp; Leia
        </div>
        <div style={{fontSize:13,color:'#8a9aaa',letterSpacing:'0.08em',
          textTransform:'uppercase',marginBottom:12}}>
          Growth Chart
        </div>

        {/* Current stats cards */}
        <div style={{display:'flex',gap:10,marginBottom:4}}>
          {[
            {name:'Luke',entry:lastLuke,dog:'luke',color:LUKE},
            {name:'Leia',entry:lastLeia,dog:'leia',color:LEIA},
          ].map(({name,entry,dog,color})=>(
            <div key={name} style={{
              flex:1,background:'#1c2028',borderRadius:10,
              padding:'12px 14px',borderLeft:`3px solid ${color}`,
            }}>
              <div style={{fontSize:12,color:'#6a7a8a',letterSpacing:'0.06em',
                textTransform:'uppercase',marginBottom:4}}>{name}</div>
              <div style={{fontSize:26,color:color,fontWeight:'bold',
                letterSpacing:'-0.01em'}}>{entry ? entry[dog] : '—'}</div>
              <div style={{fontSize:11,color:'#4a5a6a',marginTop:2}}>
                {entry ? `lbs · age ${entry.week}w` : 'no data yet'}
              </div>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:'#4a5860',textAlign:'center',marginTop:6}}>
          Projected adult range: 35–60 lb · calibrates at 14w (~Jun 13)
        </div>
      </div>

      {/* Chart */}
      <div style={{width:'100%',maxWidth:480,background:'#1a1e26',
        borderRadius:12,padding:'16px 8px 8px',boxSizing:'border-box'}}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          style={{width:'100%',height:'auto',overflow:'visible',display:'block'}}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Grid */}
          {Y_TICKS.map(y=>(
            <line key={y} x1={PL} y1={yS(y)} x2={PL+CW} y2={yS(y)}
              stroke="#fff" strokeOpacity={0.06} strokeWidth={0.8}/>
          ))}
          {X_TICKS.map(x=>(
            <line key={x} x1={xS(x)} y1={PT} x2={xS(x)} y2={PT+CH}
              stroke="#fff" strokeOpacity={0.06} strokeWidth={0.8}/>
          ))}

          {/* 14w calibration */}
          <line x1={xS(14)} y1={PT} x2={xS(14)} y2={PT+CH}
            stroke="#e8c060" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3 3"/>

          {/* Band */}
          <path d={bandPath(BAND.low, BAND.high)} fill={BAND_C} fillOpacity={0.12}/>
          <path d={toD(BAND.high)} fill="none" stroke={BAND_C}
            strokeWidth={0.8} strokeDasharray="4 3" strokeOpacity={0.3}/>
          <path d={toD(BAND.low)} fill="none" stroke={BAND_C}
            strokeWidth={0.8} strokeDasharray="4 3" strokeOpacity={0.3}/>

          {/* Band labels at right edge */}
          <text x={PL+CW+2} y={yS(60)+4} fill={BAND_C} fontSize={8}
            opacity={0.55}>60</text>
          <text x={PL+CW+2} y={yS(35)+4} fill={BAND_C} fontSize={8}
            opacity={0.55}>35</text>

          {/* Actual lines */}
          <path d={actualPath('leia')} fill="none" stroke={LEIA}
            strokeWidth={2.5} filter="url(#glow)" strokeLinecap="round"/>
          <path d={actualPath('luke')} fill="none" stroke={LUKE}
            strokeWidth={2.5} filter="url(#glow)" strokeLinecap="round"/>

          {/* Data points */}
          {actual.map((d,i)=>(
            <g key={i}>
              {[{dog:'luke',color:LUKE},{dog:'leia',color:LEIA}].map(({dog,color})=>(
                d[dog] != null && (
                  <circle key={dog}
                    cx={xS(d.week)} cy={yS(d[dog])} r={6}
                    fill={color} stroke="#1a1e26" strokeWidth={2}
                    style={{cursor:'pointer'}}
                    onMouseEnter={()=>setTip({
                      x:xS(d.week), y:yS(d[dog])-12,
                      text:`${dog==='luke'?'Luke':'Leia'} ${d[dog]}lb`
                    })}
                    onMouseLeave={()=>setTip(null)}
                    onClick={()=>setTip(tip?null:{
                      x:xS(d.week), y:yS(d[dog])-12,
                      text:`${dog==='luke'?'Luke':'Leia'} ${d[dog]}lb @${d.week}w`
                    })}
                  />
                )
              ))}
            </g>
          ))}

          {/* Tooltip */}
          {tip && (
            <g>
              <rect x={tip.x-2} y={tip.y-13} width={tip.text.length*6+8}
                height={17} rx={4} fill="#0e1117" opacity={0.9}/>
              <text x={tip.x+2} y={tip.y} fill="#f0ece4" fontSize={11}
                fontFamily="Georgia,serif">{tip.text}</text>
            </g>
          )}

          {/* Axes */}
          <line x1={PL} y1={PT} x2={PL} y2={PT+CH}
            stroke="#fff" strokeOpacity={0.12} strokeWidth={1}/>
          <line x1={PL} y1={PT+CH} x2={PL+CW} y2={PT+CH}
            stroke="#fff" strokeOpacity={0.12} strokeWidth={1}/>

          {/* Y labels */}
          {Y_TICKS.map(y=>(
            <text key={y} x={PL-4} y={yS(y)+4} fill="#6a7a8a"
              fontSize={9} textAnchor="end">{y}</text>
          ))}

          {/* X labels — every other tick to avoid crowding */}
          {X_TICKS.filter((_,i)=>i%2===0).map(x=>(
            <text key={x} x={xS(x)} y={PT+CH+14} fill="#6a7a8a"
              fontSize={9} textAnchor="middle">{x}w</text>
          ))}

          {/* Axis labels */}
          <text x={PL+CW/2} y={VH-2} fill="#4a5a6a"
            fontSize={9} textAnchor="middle">Age (weeks)</text>
          <text transform={`rotate(-90,9,${PT+CH/2})`} x={9} y={PT+CH/2+3}
            fill="#4a5a6a" fontSize={9} textAnchor="middle">lbs</text>
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        width:'100%',maxWidth:480,
        display:'flex',gap:12,marginTop:14,justifyContent:'center',
        flexWrap:'wrap',
      }}>
        {[{color:LUKE,label:'Luke'},{color:LEIA,label:'Leia'}].map(({color,label})=>(
          <div key={label} style={{display:'flex',alignItems:'center',gap:8,
            background:'#1c2028',borderRadius:8,padding:'8px 14px'}}>
            <div style={{width:20,height:3,background:color,borderRadius:2}}/>
            <span style={{color,fontSize:14,fontStyle:'italic'}}>{label}</span>
          </div>
        ))}
        <div style={{display:'flex',alignItems:'center',gap:8,
          background:'#1c2028',borderRadius:8,padding:'8px 14px'}}>
          <div style={{width:20,height:12,background:BAND_C,
            opacity:0.2,border:`1px dashed ${BAND_C}`,borderRadius:3}}/>
          <span style={{color:'#6a7a8a',fontSize:13}}>Adult range</span>
        </div>
      </div>

      {/* Add-weight form */}
      <div style={{
        width:'100%',maxWidth:480,marginTop:20,
        background:'#1a1e26',borderRadius:12,padding:'14px 14px 16px',
        boxSizing:'border-box',
      }}>
        <div style={{fontSize:12,color:'#8a9aaa',letterSpacing:'0.08em',
          textTransform:'uppercase',marginBottom:10}}>
          Add weight
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
          <input
            type="date"
            value={dateStr}
            onChange={e => setDateStr(e.target.value)}
            style={{
              flex:'1 1 140px',minWidth:0,
              background:'#0e1117',color:'#f0ece4',
              border:'1px solid #2a313d',borderRadius:8,
              padding:'10px 10px',fontSize:14,
              boxSizing:'border-box',
              colorScheme:'dark',
            }}
          />
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            placeholder="Luke lb"
            value={lukeStr}
            onChange={e => setLukeStr(e.target.value)}
            style={{
              flex:'1 1 90px',minWidth:0,
              background:'#0e1117',color:LUKE,
              border:`1px solid ${LUKE}33`,borderRadius:8,
              padding:'10px 10px',fontSize:14,
              boxSizing:'border-box',
            }}
          />
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            placeholder="Leia lb"
            value={leiaStr}
            onChange={e => setLeiaStr(e.target.value)}
            style={{
              flex:'1 1 90px',minWidth:0,
              background:'#0e1117',color:LEIA,
              border:`1px solid ${LEIA}33`,borderRadius:8,
              padding:'10px 10px',fontSize:14,
              boxSizing:'border-box',
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          style={{
            width:'100%',
            background: canAdd ? '#2a3a4a' : '#1c2028',
            color: canAdd ? '#f0ece4' : '#4a5a6a',
            border:`1px solid ${canAdd ? '#3a4a5a' : '#2a313d'}`,
            borderRadius:8,padding:'11px',fontSize:14,
            cursor: canAdd ? 'pointer' : 'not-allowed',
            letterSpacing:'0.04em',
          }}
        >
          {previewWeek != null ? `Add @ ${previewWeek}w` : 'Add'}
        </button>
      </div>

      {/* History */}
      {actual.length > 0 && (
        <div style={{
          width:'100%',maxWidth:480,marginTop:14,
          background:'#1a1e26',borderRadius:12,padding:'14px',
          boxSizing:'border-box',
        }}>
          <div style={{fontSize:12,color:'#8a9aaa',letterSpacing:'0.08em',
            textTransform:'uppercase',marginBottom:10,
            display:'flex',justifyContent:'space-between'}}>
            <span>History</span>
            <span style={{color:'#4a5a6a'}}>{actual.length} entries</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {actual.map((d, i) => ({d, i}))
              .slice()
              .reverse()
              .map(({d, i}) => (
              <div key={i} style={{
                display:'flex',alignItems:'center',gap:8,
                background:'#1c2028',borderRadius:8,padding:'8px 10px',
                fontSize:13,
              }}>
                <span style={{
                  color:'#8a9aaa',minWidth:54,
                  fontVariantNumeric:'tabular-nums',
                }}>
                  {fmtShort(weekToDate(d.week))}
                </span>
                <span style={{
                  color:'#6a7a8a',minWidth:46,fontSize:11,
                  fontVariantNumeric:'tabular-nums',
                }}>
                  {d.week}w
                </span>
                <span style={{
                  flex:1,display:'flex',gap:12,
                  fontVariantNumeric:'tabular-nums',
                }}>
                  <span style={{
                    color: d.luke != null ? LUKE : '#3a4a54',
                    minWidth:42,
                  }}>
                    {d.luke != null ? `${d.luke} lb` : '—'}
                  </span>
                  <span style={{
                    color: d.leia != null ? LEIA : '#3a4a54',
                    minWidth:42,
                  }}>
                    {d.leia != null ? `${d.leia} lb` : '—'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  aria-label="Delete entry"
                  style={{
                    background:'transparent',color:'#4a5a6a',
                    border:'none',cursor:'pointer',fontSize:18,
                    lineHeight:1,padding:'0 4px',
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{marginTop:16,color:'#3a4a54',fontSize:11,
        textAlign:'center',lineHeight:1.7,maxWidth:400}}>
        Border Collie × Pit Bull type · tap points for details
      </div>
    </div>
  );
}
