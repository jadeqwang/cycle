// Cycle — period tracking app
// Calm, breathing-paced UI. Earth-and-water palette.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── palette (from spec §7) ────────────────────────────────────────────────
const LIGHT = {
  bg:       '#FAF7F2',
  surface:  '#F0EBE3',
  surfaceDeep: '#E8E2D8',
  textPrimary:   '#2D2A26',
  textSecondary: '#8A8279',
  textFaint:     '#B5AEA3',
  accent:        '#C4928A',
  accentDeep:    '#A87770',
  accentMuted:   '#E8D5D0',
  positive:      '#A3B5A6',
  warning:       '#D4A574',
  hairline:      'rgba(45,42,38,0.08)',
};
const DARK = {
  bg:       '#1E1C19',
  surface:  '#2A2723',
  surfaceDeep: '#33302B',
  textPrimary:   '#E8E4DE',
  textSecondary: '#9A9389',
  textFaint:     '#6B645B',
  accent:        '#C4928A',
  accentDeep:    '#D4A59C',
  accentMuted:   '#4A3A36',
  positive:      '#A3B5A6',
  warning:       '#D4A574',
  hairline:      'rgba(232,228,222,0.08)',
};

// ─── date helpers ──────────────────────────────────────────────────────────
const MS_DAY = 86400000;
const STORAGE_KEY = 'cycle-app.state.v1';
const fmtMonth = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtMonthLong = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function diffDays(a, b) { return Math.round((a.getTime() - b.getTime()) / MS_DAY); }
function fmt(d) { return `${fmtMonthLong[d.getMonth()]} ${d.getDate()}`; }
function fmtShort(d) { return `${fmtMonth[d.getMonth()]} ${d.getDate()}`; }
function fmtRange(start, length) {
  const end = addDays(start, length - 1);
  if (start.getMonth() === end.getMonth()) return `${fmtMonthLong[start.getMonth()]} ${start.getDate()}–${end.getDate()}`;
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}
function relDays(target, base = startOfToday()) {
  const d = diffDays(target, base);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 0) return `in ${d} days`;
  return `${-d} days ago`;
}

function hasPeriodOn(periods, date) {
  return periods.some(p => diffDays(p, date) === 0);
}
function addPeriodEntry(periods, date) {
  if (hasPeriodOn(periods, date)) return periods;
  return [...periods, date].sort((a, b) => a - b);
}

function weekdayMonthDay(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function serializeDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseStoredDate(value) {
  if (!value || typeof value !== 'string') return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      periods: Array.isArray(parsed.periods) ? parsed.periods.map(parseStoredDate).filter(Boolean) : [],
      cycleLen: Number.isFinite(parsed.cycleLen) ? parsed.cycleLen : 27,
      cycleMode: parsed.cycleMode === 'auto' ? 'auto' : 'manual',
      periodLen: Number.isFinite(parsed.periodLen) ? parsed.periodLen : 5,
      periodMode: parsed.periodMode === 'auto' ? 'auto' : 'manual',
      calSync: !!parsed.calSync,
      dark: !!parsed.dark,
      accent: parsed.accent || '#C4928A',
      font: parsed.font || 'quicksand',
    };
  } catch {
    return null;
  }
}

function saveStoredState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      periods: state.periods.map(serializeDate),
    }));
  } catch {
    // Storage can be unavailable in private browsing or locked-down webviews.
  }
}

// ─── presets (state scenarios for tweaks) ──────────────────────────────────
function scenarioPeriods(scenario) {
  // returns array of period start dates, oldest first
  const T = startOfToday();
  if (scenario === 'empty') return [];
  if (scenario === 'late') {
    // last logged was 29 days ago; cycle=27 → predicted 2 days ago
    return [
      addDays(T, -29 - 26 - 28),
      addDays(T, -29 - 26),
      addDays(T, -29),
    ];
  }
  if (scenario === 'first-log') {
    return [addDays(T, -85 - 27 - 26)];
  }
  // normal: last logged 19 days ago; cycle=27 → predicted in 8 days (May 24)
  return [
    addDays(T, -19 - 28 - 27 - 26),
    addDays(T, -19 - 28 - 27),
    addDays(T, -19 - 28),
    addDays(T, -19 - 27),
    addDays(T, -19),
  ];
}

// ─── icons ─────────────────────────────────────────────────────────────────
const ChevronLeft = ({c='currentColor', s=18}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M15 6l-6 6 6 6" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ChevronRight = ({c='currentColor', s=18}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const Sliders = ({c='currentColor', s=20}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const Check = ({c='currentColor', s=18}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L20 7" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CloudOff = ({c='currentColor', s=14}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M3 3l18 18M7.5 7.5A5 5 0 0012 17h6.5a3.5 3.5 0 002.3-6.13M13 7.07A5 5 0 0117 12" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const Cal = ({c='currentColor', s=16}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke={c} strokeWidth="1.4"/>
    <path d="M8 3v4M16 3v4M3.5 10h17" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const Trash = ({c='currentColor', s=18}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const Edit = ({c='currentColor', s=18}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M4 20h4l10.5-10.5a2.12 2.12 0 00-3-3L5 17v3z" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── status bar ────────────────────────────────────────────────────────────
function StatusBar({ c }) {
  const fg = c.textPrimary;
  return (
    <div style={{
      height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 22px 0 24px', position: 'relative', flexShrink: 0,
      fontFamily: 'var(--font-ui)', fontSize: 14, color: fg, letterSpacing: 0.2,
    }}>
      <span style={{ fontWeight: 500 }}>9:30</span>
      <div style={{
        position: 'absolute', left: '50%', top: 8, transform: 'translateX(-50%)',
        width: 22, height: 22, borderRadius: 100, background: '#1a1a1a',
      }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 13.3L.67 5.97a10.37 10.37 0 0114.66 0L8 13.3z" fill={fg}/></svg>
        <svg width="14" height="14" viewBox="0 0 16 16"><path d="M14.67 14.67V1.33L1.33 14.67h13.34z" fill={fg}/></svg>
        <svg width="18" height="14" viewBox="0 0 24 16"><rect x="1" y="2" width="20" height="12" rx="2.5" stroke={fg} strokeWidth="1" fill="none"/><rect x="22" y="6" width="2" height="4" rx="0.5" fill={fg}/><rect x="3" y="4" width="14" height="8" rx="1" fill={fg}/></svg>
      </div>
    </div>
  );
}
function NavPill({ c }) {
  return (
    <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: 130, height: 4, borderRadius: 2, background: c.textPrimary, opacity: 0.32 }} />
    </div>
  );
}

// ─── log button with ±7 day stepper ────────────────────────────────────────
function LogButton({ c, offset, setOffset, onConfirm, disabled }) {
  const date = addDays(startOfToday(), offset);
  const label = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : offset === 1 ? 'Tomorrow' : (offset < 0 ? `${-offset} days ago` : `in ${offset} days`);
  return (
    <div style={{
      background: c.accent, borderRadius: 22, padding: '20px 8px 22px',
      boxShadow: `0 1px 0 rgba(0,0,0,0.04), 0 12px 30px -16px ${c.accent}80`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ textAlign: 'center', color: '#FFFEFB', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.85 }}>
        Log period
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px 0', gap: 4 }}>
        <button
          onClick={() => setOffset(Math.max(-7, offset - 1))}
          disabled={offset <= -7}
          style={{
            width: 48, height: 48, borderRadius: 24, border: 'none',
            background: 'transparent', color: '#FFFEFB', opacity: offset <= -7 ? 0.3 : 0.85,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
          <ChevronLeft c="#FFFEFB" s={24}/>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div key={offset} style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: '#FFFEFB', letterSpacing: -0.4 }}>
            {label}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: '#FFFEFB', opacity: 0.75, marginTop: 2 }}>
            {fmt(date)}
          </div>
        </div>
        <button
          onClick={() => setOffset(Math.min(7, offset + 1))}
          disabled={offset >= 7}
          style={{
            width: 48, height: 48, borderRadius: 24, border: 'none',
            background: 'transparent', color: '#FFFEFB', opacity: offset >= 7 ? 0.3 : 0.85,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
          <ChevronRight c="#FFFEFB" s={24}/>
        </button>
      </div>
      <button
        onClick={onConfirm}
        disabled={disabled}
        style={{
          marginTop: 14, marginLeft: 8, marginRight: 8,
          width: 'calc(100% - 16px)', height: 56, borderRadius: 16,
          border: 'none', background: 'rgba(255,254,251,0.18)',
          color: '#FFFEFB', fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 600,
          letterSpacing: 0.3, cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1, transition: 'opacity 240ms ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {disabled ? 'Already logged' : <>Confirm <Check c="#FFFEFB" s={18}/></>}
      </button>
    </div>
  );
}

// ─── last period block ─────────────────────────────────────────────────────
function LastBlock({ c, last, periodLength, onOpen, empty }) {
  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%', border: 'none', background: c.surface,
        borderRadius: 22, padding: '22px 24px', textAlign: 'left',
        cursor: 'pointer', display: 'block',
      }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
        Last period
      </div>
      {empty ? (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.4 }}>
            Not yet logged
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textSecondary, marginTop: 4 }}>
            Tap below to record your first period
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.6 }}>
              {fmt(last)}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textSecondary }}>
              {relDays(last)}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint, marginTop: 6 }}>
            {fmtRange(last, periodLength)} · {periodLength} days
          </div>
        </>
      )}
    </button>
  );
}

// ─── next period block ─────────────────────────────────────────────────────
function NextBlock({ c, next, late, empty }) {
  if (empty) {
    return (
      <div style={{ background: c.surface, borderRadius: 22, padding: '22px 24px' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
          Next period
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.3, lineHeight: 1.25 }}>
          Log your first period to see predictions
        </div>
      </div>
    );
  }
  const isLate = late;
  return (
    <div style={{
      background: isLate ? '#F5E9D8' : c.accentMuted,
      borderRadius: 22, padding: '22px 24px',
      transition: 'background 300ms ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: isLate ? '#8B6A3B' : c.accentDeep, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {isLate ? 'Expected' : 'Next period'}
        </div>
        {isLate && (
          <div style={{ width: 8, height: 8, borderRadius: 4, background: c.warning }} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: isLate ? '#6E4F2B' : c.textPrimary, letterSpacing: -0.6 }}>
          {fmt(next)}
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: isLate ? '#8B6A3B' : c.textSecondary }}>
          {relDays(next)}
        </div>
      </div>
      {isLate && (
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: '#8B6A3B', marginTop: 6 }}>
          It's okay — cycles vary. Log when it starts.
        </div>
      )}
    </div>
  );
}

// ─── settings bottom sheet ─────────────────────────────────────────────────
function StepperRow({ c, label, value, setValue, mode, setMode, min, max }) {
  const isAuto = mode === 'auto';
  return (
    <div style={{ padding: '18px 0', borderBottom: `1px solid ${c.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{label}</div>
        <button
          onClick={() => setMode(isAuto ? 'manual' : 'auto')}
          style={{
            border: 'none', background: isAuto ? c.accent : c.surfaceDeep,
            color: isAuto ? '#FFFEFB' : c.textSecondary,
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, letterSpacing: 0.4,
            textTransform: 'uppercase', padding: '6px 12px', borderRadius: 100, cursor: 'pointer',
          }}>
          {isAuto ? 'Auto' : 'Manual'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button
          onClick={() => setValue(Math.max(min, value - 1))}
          disabled={value <= min}
          style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${c.hairline}`, background: c.bg, color: c.textPrimary, opacity: value <= min ? 0.3 : 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.4 }}>{value}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textSecondary, marginLeft: 6 }}>days</span>
        </div>
        <button
          onClick={() => setValue(Math.min(max, value + 1))}
          disabled={value >= max}
          style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${c.hairline}`, background: c.bg, color: c.textPrimary, opacity: value >= max ? 0.3 : 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}

function SettingsSheet({ c, open, onClose, cycleLen, setCycleLen, cycleMode, setCycleMode, periodLen, setPeriodLen, periodMode, setPeriodMode, calSync, setCalSync, calAccount }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(20,18,15,0.32)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 320ms ease', zIndex: 30,
        }}
      />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex: 31, paddingBottom: 40, boxShadow: '0 -20px 60px rgba(0,0,0,0.18)',
        maxHeight: '82%', overflow: 'auto',
      }}>
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: c.textFaint, opacity: 0.4 }} />
        </div>
        <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.3 }}>Settings</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textSecondary, cursor: 'pointer' }}>Done</button>
        </div>

        <div style={{ padding: '8px 24px 0' }}>
          <StepperRow c={c} label="Cycle length" value={cycleLen} setValue={setCycleLen} mode={cycleMode} setMode={setCycleMode} min={18} max={45}/>
          <StepperRow c={c} label="Period length" value={periodLen} setValue={setPeriodLen} mode={periodMode} setMode={setPeriodMode} min={1} max={12}/>

          {/* google calendar */}
          <div style={{ padding: '20px 0', borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500, color: c.textPrimary }}>Google Calendar sync</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary, marginTop: 2 }}>
                  {calSync ? calAccount : 'One-way push of logged & predicted dates'}
                </div>
              </div>
              <Switch c={c} on={calSync} onChange={setCalSync}/>
            </div>
            {calSync && (
              <button style={{
                marginTop: 14, width: '100%', textAlign: 'left',
                background: c.surface, border: 'none', borderRadius: 14, padding: '14px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: c.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Cal c={c.accentDeep}/>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textPrimary }}>Calendar</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: c.textSecondary }}>Personal (primary)</div>
                  </div>
                </div>
                <ChevronRight c={c.textFaint} s={18}/>
              </button>
            )}
          </div>

          {/* export */}
          <button style={{
            width: '100%', textAlign: 'left',
            background: 'transparent', border: 'none', padding: '18px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
            borderBottom: `1px solid ${c.hairline}`,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500, color: c.textPrimary }}>Export data</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary, marginTop: 2 }}>CSV to Google Sheets</div>
            </div>
            <ChevronRight c={c.textFaint} s={18}/>
          </button>

          <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: c.textFaint, lineHeight: 1.5 }}>
              All data stays on your device.<br/>No analytics. No tracking.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Switch({ c, on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 48, height: 28, borderRadius: 100,
        background: on ? c.accent : c.surfaceDeep, border: 'none',
        position: 'relative', cursor: 'pointer',
        transition: 'background 240ms ease',
      }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? 22 : 2,
        width: 24, height: 24, borderRadius: '50%',
        background: '#FFFEFB',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        transition: 'left 240ms cubic-bezier(0.32, 0.72, 0, 1)',
      }} />
    </button>
  );
}

// ─── edit-last modal ───────────────────────────────────────────────────────
function EditLastModal({ c, open, onClose, last, periodLength, onDelete }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,15,0.4)', zIndex: 40 }} />
      <div style={{
        position: 'absolute', left: 24, right: 24, top: '32%',
        background: c.bg, borderRadius: 22, padding: 24, zIndex: 41,
        boxShadow: '0 30px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' }}>Period entry</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.4, marginTop: 6 }}>{fmt(last)}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textSecondary, marginTop: 4 }}>{fmtRange(last, periodLength)}</div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button style={{
            flex: 1, height: 48, borderRadius: 14, border: `1px solid ${c.hairline}`,
            background: 'transparent', color: c.textPrimary,
            fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Edit c={c.textPrimary} s={16}/> Edit date
          </button>
          <button onClick={onDelete} style={{
            flex: 1, height: 48, borderRadius: 14, border: 'none',
            background: c.surface, color: c.accentDeep,
            fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Trash c={c.accentDeep} s={16}/> Delete
          </button>
        </div>
        <button onClick={onClose} style={{
          width: '100%', height: 44, marginTop: 10, border: 'none',
          background: 'transparent', color: c.textSecondary,
          fontFamily: 'var(--font-ui)', fontSize: 14, cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </>
  );
}

// ─── confirmation bloom ────────────────────────────────────────────────────
function Bloom({ c, show, x, y }) {
  if (!show) return null;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, pointerEvents: 'none',
      transform: 'translate(-50%, -50%)', zIndex: 50,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        background: c.accent, animation: 'bloom 1100ms ease-out forwards',
      }} />
    </div>
  );
}

// ─── main app ──────────────────────────────────────────────────────────────
function CycleApp({
  initialPeriods,
  initialCycleLen = 27,
  initialCycleMode = 'manual',
  initialPeriodLen = 5,
  initialPeriodMode = 'manual',
  dark = false,
  calSyncInit = false,
  accent = '#C4928A',
  accentDeep = '#A87770',
  accentMuted = '#E8D5D0',
  font = 'quicksand',
  onSettingsChange,
}) {
  const todayBase = startOfToday();
  const baseC = dark ? DARK : LIGHT;
  // accent override from tweaks
  const c = useMemo(() => ({ ...baseC, accent, accentDeep, accentMuted }), [baseC, accent, accentDeep, accentMuted]);

  const [periods, setPeriods] = useState(() => initialPeriods || []);

  const [cycleLen, setCycleLen] = useState(initialCycleLen);
  const [cycleMode, setCycleMode] = useState(initialCycleMode);
  const [periodLen, setPeriodLen] = useState(initialPeriodLen);
  const [periodMode, setPeriodMode] = useState(initialPeriodMode);
  const [calSync, setCalSync] = useState(calSyncInit);
  const [logOffset, setLogOffset] = useState(0);
  const [bloom, setBloom] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [unsynced, setUnsynced] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    onSettingsChange?.({ periods, cycleLen, cycleMode, periodLen, periodMode, calSync });
  }, [periods, cycleLen, cycleMode, periodLen, periodMode, calSync, onSettingsChange]);

  // auto-compute cycle len when in auto mode
  useEffect(() => {
    if (cycleMode !== 'auto') return;
    if (periods.length < 2) { setCycleLen(27); return; }
    const sorted = [...periods].sort((a,b) => a - b);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(diffDays(sorted[i], sorted[i-1]));
    const recent = gaps.slice(-5);
    recent.sort((a,b) => a-b);
    const med = recent[Math.floor(recent.length/2)];
    setCycleLen(Math.round(med));
  }, [periods, cycleMode]);

  const last = periods.length ? periods[periods.length - 1] : null;
  const next = last ? addDays(last, cycleLen) : null;
  const late = next ? diffDays(next, todayBase) < 0 : false;
  const empty = !last;

  const handleConfirm = () => {
    const newDate = addDays(todayBase, logOffset);
    if (hasPeriodOn(periods, newDate)) return;
    setPeriods(p => addPeriodEntry(p, newDate));
    setLogOffset(0);
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const sr = buttonRef.current.closest('[data-cycle-frame]').getBoundingClientRect();
      setBloom({ x: r.left + r.width/2 - sr.left, y: r.top + r.height/2 - sr.top });
    }
    setTimeout(() => setBloom(null), 1200);
    if (calSync) { setUnsynced(true); setTimeout(() => setUnsynced(false), 2400); }
  };

  // history rows (newest first), with cycle length to previous logged
  const historyRows = useMemo(() => {
    const sorted = [...periods].sort((a,b) => a - b);
    return sorted.map((d, i) => ({
      date: d, gap: i > 0 ? diffDays(d, sorted[i-1]) : null,
    })).reverse();
  }, [periods]);

  const fontFam = font === 'nunito'
    ? '"Nunito", system-ui, sans-serif'
    : font === 'karla'
    ? '"Karla", system-ui, sans-serif'
    : '"Quicksand", system-ui, sans-serif';

  return (
    <div data-cycle-frame style={{
      width: 384, height: 832, borderRadius: 44, overflow: 'hidden',
      background: c.bg, position: 'relative',
      border: `1.5px solid rgba(0,0,0,0.06)`,
      boxShadow: '0 40px 80px -20px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column',
      transition: 'background 320ms ease',
      // CSS vars for fonts
      '--font-display': fontFam,
      '--font-ui': fontFam,
    }}>
      <StatusBar c={c}/>

      {/* scroll content */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* unsynced indicator */}
        {unsynced && (
          <div style={{
            position: 'absolute', top: 8, left: 24, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 6,
            background: c.surface, padding: '6px 12px', borderRadius: 100,
            fontFamily: 'var(--font-ui)', fontSize: 12, color: c.textSecondary,
            animation: 'fadeInDown 280ms ease-out',
          }}>
            <CloudOff c={c.textSecondary} s={13}/> Syncing…
          </div>
        )}

        {/* greeting */}
        <div style={{ padding: '20px 24px 12px' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint, letterSpacing: 0.4 }}>
            {weekdayMonthDay(todayBase)}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: c.textPrimary, marginTop: 4, letterSpacing: -0.3 }}>
            Cycle
          </div>
        </div>

        {/* three blocks */}
        <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <LastBlock c={c} last={last} periodLength={periodLen} onOpen={() => !empty && setEditOpen(true)} empty={empty}/>
          <NextBlock c={c} next={next} late={late} empty={empty}/>
          <div ref={buttonRef}>
            <LogButton c={c} offset={logOffset} setOffset={setLogOffset} onConfirm={handleConfirm}
              disabled={hasPeriodOn(periods, addDays(todayBase, logOffset))}/>
          </div>
        </div>

        {/* history */}
        <div style={{ padding: '36px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              History
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: c.textFaint }}>
              {historyRows.length} {historyRows.length === 1 ? 'entry' : 'entries'}
            </div>
          </div>
          {historyRows.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textFaint, padding: '12px 0' }}>
              Your logged periods will appear here.
            </div>
          ) : (
            <div>
              {historyRows.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  padding: '14px 0', borderBottom: i < historyRows.length - 1 ? `1px solid ${c.hairline}` : 'none',
                }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.2 }}>
                      {fmtShort(r.date)}, {r.date.getFullYear()}
                    </div>
                  </div>
                  {r.gap ? (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary }}>
                      {r.gap} day cycle
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint }}>—</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 80 }}/>
      </div>

      {/* settings handle */}
      <button
        onClick={() => setSettingsOpen(true)}
        style={{
          position: 'absolute', left: '50%', bottom: 44, transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: c.surface, border: 'none',
          padding: '10px 18px', borderRadius: 100,
          color: c.textSecondary, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
          letterSpacing: 0.4, cursor: 'pointer', zIndex: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}>
        <Sliders c={c.textSecondary} s={14}/> Settings
      </button>

      <NavPill c={c}/>

      <SettingsSheet c={c} open={settingsOpen} onClose={() => setSettingsOpen(false)}
        cycleLen={cycleLen} setCycleLen={(v) => { setCycleLen(v); setCycleMode('manual'); }}
        cycleMode={cycleMode} setCycleMode={setCycleMode}
        periodLen={periodLen} setPeriodLen={(v) => { setPeriodLen(v); setPeriodMode('manual'); }}
        periodMode={periodMode} setPeriodMode={setPeriodMode}
        calSync={calSync} setCalSync={setCalSync}
        calAccount="cycle.user@gmail.com"
      />

      {last && (
        <EditLastModal c={c} open={editOpen} onClose={() => setEditOpen(false)} last={last} periodLength={periodLen}
          onDelete={() => { setPeriods(p => p.slice(0, -1)); setEditOpen(false); }}/>
      )}

      <Bloom c={c} show={!!bloom} x={bloom?.x} y={bloom?.y}/>
    </div>
  );
}

export { LIGHT, DARK, loadStoredState, saveStoredState, hasPeriodOn, addPeriodEntry };
export default CycleApp;
