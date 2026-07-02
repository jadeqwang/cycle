// Cycle — period tracking app
// Calm, breathing-paced UI. Earth-and-water palette.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

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

function weekdayMonthDay(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function serializeDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseStoredDate(value) {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function nowIsoAfter(previous) {
  const now = new Date();
  const previousTime = Date.parse(previous);
  if (Number.isFinite(previousTime) && now.getTime() <= previousTime) {
    return new Date(previousTime + 1).toISOString();
  }
  return now.toISOString();
}

function makeEntry(start) {
  return {
    start,
    end: null,
    startEventId: null,
    endEventId: null,
    updatedAt: new Date().toISOString(),
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => a.start - b.start);
}

function hasPeriodOn(entries, date) {
  return entries.some(entry => diffDays(entry.start, date) === 0);
}

function addPeriodEntry(entries, date) {
  if (hasPeriodOn(entries, date)) return entries;
  return sortEntries([...entries, makeEntry(date)]);
}

function setPeriodDate(entries, index, date) {
  if (index < 0 || index >= entries.length) return entries;
  const rest = entries.filter((_, i) => i !== index);
  if (hasPeriodOn(rest, date)) return entries;
  const current = entries[index];
  return sortEntries([
    ...rest,
    { ...current, start: date, updatedAt: nowIsoAfter(current.updatedAt) },
  ]);
}

function setPeriodEnd(entries, index, end) {
  if (index < 0 || index >= entries.length) return entries;
  return entries.map((entry, i) => (
    i === index ? { ...entry, end: end || null, updatedAt: nowIsoAfter(entry.updatedAt) } : entry
  ));
}

function removePeriodAt(entries, index) {
  if (index < 0 || index >= entries.length) return entries;
  return entries.filter((_, i) => i !== index);
}

function collectEventIds(entry) {
  return [entry.startEventId, entry.endEventId].filter(id => id !== null && id !== undefined);
}

function autoPeriodLen(entries) {
  const lengths = sortEntries(entries)
    .filter(entry => entry.end)
    .slice(-5)
    .map(entry => diffDays(entry.end, entry.start) + 1)
    .sort((a, b) => a - b);
  if (!lengths.length) return null;
  return lengths[Math.floor(lengths.length / 2)];
}

function parseStoredEntry(raw) {
  if (typeof raw === 'string') {
    const start = parseStoredDate(raw);
    return start ? makeEntry(start) : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const start = parseStoredDate(raw.start);
  if (!start) return null;
  const end = parseStoredDate(raw.end);
  return {
    start,
    end,
    startEventId: typeof raw.startEventId === 'string' ? raw.startEventId : null,
    endEventId: typeof raw.endEventId === 'string' ? raw.endEventId : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function serializeEntry(entry) {
  return {
    start: serializeDate(entry.start),
    end: entry.end ? serializeDate(entry.end) : null,
    startEventId: entry.startEventId || null,
    endEventId: entry.endEventId || null,
    updatedAt: entry.updatedAt,
  };
}

function buildBackupState(state) {
  return {
    schema: 2,
    periods: state.periods.map(serializeEntry),
    deletedEventIds: state.deletedEventIds || [],
    lastSyncedAt: typeof state.lastSyncedAt === 'string' ? state.lastSyncedAt : null,
    cycleLen: state.cycleLen,
    cycleMode: state.cycleMode,
    periodLen: state.periodLen,
    periodMode: state.periodMode,
    calSync: !!state.calSync,
    dark: !!state.dark,
    accent: state.accent,
    font: state.font,
  };
}

function mergeIdField(currentId, incomingId, newerIncoming) {
  if (currentId === null || currentId === undefined) return incomingId;
  if (incomingId === null || incomingId === undefined) return currentId;
  if (currentId !== incomingId && newerIncoming) return incomingId;
  return currentId;
}

function mergeImportedPeriods(existing, incoming) {
  const out = [...existing];
  for (const inc of incoming) {
    const i = out.findIndex(e => diffDays(e.start, inc.start) === 0);
    if (i === -1) { out.push(inc); continue; }
    const cur = out[i];
    const newerIncoming = inc.updatedAt > cur.updatedAt;
    out[i] = {
      ...cur,
      end: cur.end && inc.end ? (newerIncoming ? inc.end : cur.end) : (cur.end || inc.end),
      startEventId: mergeIdField(cur.startEventId, inc.startEventId, newerIncoming),
      endEventId: mergeIdField(cur.endEventId, inc.endEventId, newerIncoming),
      updatedAt: newerIncoming ? inc.updatedAt : cur.updatedAt,
    };
  }
  return sortEntries(out);
}

function downloadJsonBackup(json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cycle-backup.json';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      periods: Array.isArray(parsed.periods) ? sortEntries(parsed.periods.map(parseStoredEntry).filter(Boolean)) : [],
      cycleLen: Number.isFinite(parsed.cycleLen) ? parsed.cycleLen : 27,
      cycleMode: parsed.cycleMode === 'auto' ? 'auto' : 'manual',
      periodLen: Number.isFinite(parsed.periodLen) ? parsed.periodLen : 5,
      periodMode: parsed.periodMode === 'auto' ? 'auto' : 'manual',
      calSync: !!parsed.calSync,
      dark: !!parsed.dark,
      accent: parsed.accent || '#C4928A',
      font: parsed.font || 'quicksand',
      deletedEventIds: Array.isArray(parsed.deletedEventIds) ? parsed.deletedEventIds.filter(id => typeof id === 'string') : [],
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
    };
  } catch {
    return null;
  }
}

function saveStoredState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      schema: 2,
      periods: state.periods.map(serializeEntry),
      deletedEventIds: Array.isArray(state.deletedEventIds) ? state.deletedEventIds : [],
      lastSyncedAt: typeof state.lastSyncedAt === 'string' ? state.lastSyncedAt : null,
    }));
  } catch {
    // Storage can be unavailable in private browsing or locked-down webviews.
  }
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
              {fmt(last.start)}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textSecondary }}>
              {relDays(last.start)}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint, marginTop: 6 }}>
            {last.end ? `${fmtRange(last.start, diffDays(last.end, last.start) + 1)} · ${diffDays(last.end, last.start) + 1} days` : `${fmtRange(last.start, periodLength)} · ${periodLength} days`}
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

function SettingsSheet({ c, open, onClose, cycleLen, setCycleLen, cycleMode, setCycleMode, periodLen, setPeriodLen, periodMode, setPeriodMode, calSync, setCalSync, calAccount, onExport, onImportOpen }) {
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
          <button onClick={onExport} style={{
            width: '100%', textAlign: 'left',
            background: 'transparent', border: 'none', padding: '18px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
            borderBottom: `1px solid ${c.hairline}`,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500, color: c.textPrimary }}>Export data</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary, marginTop: 2 }}>JSON backup</div>
            </div>
            <ChevronRight c={c.textFaint} s={18}/>
          </button>

          <button onClick={onImportOpen} style={{
            width: '100%', textAlign: 'left',
            background: 'transparent', border: 'none', padding: '18px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
            borderBottom: `1px solid ${c.hairline}`,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500, color: c.textPrimary }}>Import data</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary, marginTop: 2 }}>Paste a JSON backup</div>
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

function ImportModal({ c, open, onClose, onImport }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setText('');
      setError('');
    }
  }, [open]);
  if (!open) return null;

  const handleImport = () => {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed?.periods;
      if (!Array.isArray(list)) throw new Error('invalid backup');
      const entries = list.map(parseStoredEntry).filter(Boolean);
      if (!entries.length) throw new Error('invalid backup');
      onImport(entries);
      onClose();
    } catch {
      setError("Couldn't read that — paste the full JSON backup.");
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,15,0.4)', zIndex: 50 }} />
      <div style={{
        position: 'absolute', left: 24, right: 24, top: '22%',
        background: c.bg, borderRadius: 22, padding: 24, zIndex: 51,
        boxShadow: '0 30px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' }}>Import data</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.3, marginTop: 6 }}>JSON backup</div>
        <textarea
          value={text}
          onChange={(event) => { setText(event.target.value); setError(''); }}
          spellCheck={false}
          style={{
            width: '100%', minHeight: 190, marginTop: 18, boxSizing: 'border-box',
            borderRadius: 14, border: `1px solid ${error ? c.accentDeep : c.hairline}`,
            background: c.surface, color: c.textPrimary, padding: 14, resize: 'vertical',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12, lineHeight: 1.45, outline: 'none',
          }}
        />
        {error && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.accentDeep, marginTop: 10, lineHeight: 1.4 }}>
            {error}
          </div>
        )}
        <button onClick={handleImport} style={{
          width: '100%', height: 52, marginTop: 18, borderRadius: 14, border: 'none',
          background: c.accent, color: '#FFFEFB',
          fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, letterSpacing: 0.3, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Import <Check c="#FFFEFB" s={16}/>
        </button>
        <button onClick={onClose} style={{
          width: '100%', height: 44, marginTop: 10, border: 'none',
          background: 'transparent', color: c.textSecondary,
          fontFamily: 'var(--font-ui)', fontSize: 14, cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </>
  );
}

// ─── edit-last modal ───────────────────────────────────────────────────────
function EditLastModal({ c, open, onClose, entry, periodLength, onDelete, onEditDate, onEditEnd, minDate, maxDate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.start);
  const [draftEnd, setDraftEnd] = useState(entry.end);
  useEffect(() => {
    if (open) { setEditing(false); setDraft(entry.start); setDraftEnd(entry.end); }
  }, [open, entry]);
  if (!open) return null;
  const canBack = !minDate || diffDays(addDays(draft, -1), minDate) >= 0;
  const canFwd = diffDays(addDays(draft, 1), maxDate) <= 0;
  const endMax = maxDate;
  const clampEnd = (end) => {
    if (!end) return null;
    if (diffDays(end, draft) < 0) return draft;
    if (diffDays(end, endMax) > 0) return endMax;
    return end;
  };
  const defaultEnd = addDays(draft, Math.max(0, periodLength - 1));
  const clampedDraftEnd = clampEnd(draftEnd);
  const canEndBack = clampedDraftEnd && diffDays(addDays(clampedDraftEnd, -1), draft) >= 0;
  const canEndFwd = clampedDraftEnd && diffDays(addDays(clampedDraftEnd, 1), endMax) <= 0;
  const chevronStyle = (enabled) => ({
    width: 48, height: 48, borderRadius: 24, border: 'none',
    background: 'transparent', color: c.textPrimary, opacity: enabled ? 0.85 : 0.25,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: enabled ? 'pointer' : 'default',
  });
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,15,0.4)', zIndex: 40 }} />
      <div style={{
        position: 'absolute', left: 24, right: 24, top: '32%',
        background: c.bg, borderRadius: 22, padding: 24, zIndex: 41,
        boxShadow: '0 30px 60px rgba(0,0,0,0.25)',
      }}>
        {editing ? (
          <>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' }}>Edit date</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 4 }}>
              <button onClick={() => canBack && setDraft(addDays(draft, -1))} disabled={!canBack} style={chevronStyle(canBack)}>
                <ChevronLeft c="currentColor" s={24}/>
              </button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.4 }}>{fmt(draft)}</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary, marginTop: 2 }}>{relDays(draft)}</div>
              </div>
              <button onClick={() => canFwd && setDraft(addDays(draft, 1))} disabled={!canFwd} style={chevronStyle(canFwd)}>
                <ChevronRight c="currentColor" s={24}/>
              </button>
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' }}>Ended</div>
              {clampedDraftEnd ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 4 }}>
                    <button onClick={() => canEndBack && setDraftEnd(addDays(clampedDraftEnd, -1))} disabled={!canEndBack} style={chevronStyle(canEndBack)}>
                      <ChevronLeft c="currentColor" s={24}/>
                    </button>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.3 }}>{fmt(clampedDraftEnd)}</div>
                    </div>
                    <button onClick={() => canEndFwd && setDraftEnd(addDays(clampedDraftEnd, 1))} disabled={!canEndFwd} style={chevronStyle(canEndFwd)}>
                      <ChevronRight c="currentColor" s={24}/>
                    </button>
                  </div>
                  <button onClick={() => setDraftEnd(null)} style={{
                    width: '100%', height: 40, marginTop: 6, borderRadius: 12, border: `1px solid ${c.hairline}`,
                    background: 'transparent', color: c.textSecondary,
                    fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  }}>Clear</button>
                </>
              ) : (
                <button onClick={() => setDraftEnd(clampEnd(defaultEnd))} style={{
                  width: '100%', height: 46, marginTop: 10, borderRadius: 14, border: `1px solid ${c.hairline}`,
                  background: c.surface, color: c.textPrimary,
                  fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}>Set end date</button>
              )}
            </div>
            <button onClick={() => {
              onEditDate(draft);
              onEditEnd(clampedDraftEnd);
              onClose();
            }} style={{
              width: '100%', height: 52, marginTop: 18, borderRadius: 14, border: 'none',
              background: c.accent, color: '#FFFEFB',
              fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, letterSpacing: 0.3, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              Save <Check c="#FFFEFB" s={16}/>
            </button>
            <button onClick={() => { setEditing(false); setDraft(entry.start); setDraftEnd(entry.end); }} style={{
              width: '100%', height: 44, marginTop: 10, border: 'none',
              background: 'transparent', color: c.textSecondary,
              fontFamily: 'var(--font-ui)', fontSize: 14, cursor: 'pointer',
            }}>Cancel</button>
          </>
        ) : (
          <>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' }}>Period entry</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.4, marginTop: 6 }}>{fmt(entry.start)}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textSecondary, marginTop: 4 }}>{fmtRange(entry.start, periodLength)}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint, marginTop: 4 }}>
          {entry.end ? `Ended ${fmt(entry.end)}` : 'End not recorded'}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={() => setEditing(true)} style={{
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
          </>
        )}
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
  native = false,
  initialPeriods,
  initialCycleLen = 27,
  initialCycleMode = 'manual',
  initialPeriodLen = 5,
  initialPeriodMode = 'manual',
  initialDeletedEventIds = [],
  initialLastSyncedAt = null,
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
  const [deletedEventIds, setDeletedEventIds] = useState(() => initialDeletedEventIds || []);

  const [cycleLen, setCycleLen] = useState(initialCycleLen);
  const [cycleMode, setCycleMode] = useState(initialCycleMode);
  const [periodLen, setPeriodLen] = useState(initialPeriodLen);
  const [periodMode, setPeriodMode] = useState(initialPeriodMode);
  const [calSync, setCalSync] = useState(calSyncInit);
  const [logOffset, setLogOffset] = useState(0);
  const [bloom, setBloom] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [unsynced, setUnsynced] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    onSettingsChange?.({ periods, deletedEventIds, lastSyncedAt: initialLastSyncedAt, cycleLen, cycleMode, periodLen, periodMode, calSync });
  }, [periods, deletedEventIds, initialLastSyncedAt, cycleLen, cycleMode, periodLen, periodMode, calSync, onSettingsChange]);

  // auto-compute cycle len when in auto mode
  useEffect(() => {
    if (cycleMode !== 'auto') return;
    if (periods.length < 2) { setCycleLen(27); return; }
    const sorted = sortEntries(periods);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(diffDays(sorted[i].start, sorted[i-1].start));
    const recent = gaps.slice(-5);
    recent.sort((a,b) => a-b);
    const med = recent[Math.floor(recent.length/2)];
    setCycleLen(Math.round(med));
  }, [periods, cycleMode]);

  useEffect(() => {
    if (periodMode !== 'auto') return;
    setPeriodLen(autoPeriodLen(periods) ?? 5);
  }, [periods, periodMode]);

  const last = periods.length ? periods[periods.length - 1] : null;
  const next = last ? addDays(last.start, cycleLen) : null;
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

  const handleExport = async () => {
    const json = JSON.stringify(buildBackupState({
      periods,
      deletedEventIds,
      lastSyncedAt: initialLastSyncedAt,
      cycleLen,
      cycleMode,
      periodLen,
      periodMode,
      calSync,
      dark,
      accent,
      font,
    }), null, 2);
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: 'Cycle data', text: json }).catch(() => {});
    } else {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(json);
          return;
        }
      } catch {
        // Fall through to a file download so the user still gets a backup.
      }
      try {
        downloadJsonBackup(json);
      } catch {
        // Export is best-effort on locked-down browsers and webviews.
      }
    }
  };

  // history rows (newest first), with cycle length to previous logged
  const historyRows = useMemo(() => {
    const sorted = sortEntries(periods);
    return sorted.map((entry, i) => ({
      entry, idx: periods.indexOf(entry), gap: i > 0 ? diffDays(entry.start, sorted[i-1].start) : null,
    })).reverse();
  }, [periods]);

  const fontFam = font === 'nunito'
    ? '"Nunito", system-ui, sans-serif'
    : font === 'karla'
    ? '"Karla", system-ui, sans-serif'
    : '"Quicksand", system-ui, sans-serif';

  return (
    <div data-cycle-frame style={{
      // On native the real device provides status bar, notch, and gesture
      // pill — render full-bleed with safe-area padding instead of the
      // browser-preview phone mockup.
      width: native ? '100vw' : 384,
      height: native ? '100dvh' : 832,
      borderRadius: native ? 0 : 44,
      border: native ? 'none' : `1.5px solid rgba(0,0,0,0.06)`,
      boxShadow: native ? 'none' : '0 40px 80px -20px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.06)',
      paddingTop: native ? 'env(safe-area-inset-top, 24px)' : 0,
      paddingBottom: native ? 'env(safe-area-inset-bottom, 0px)' : 0,
      overflow: 'hidden',
      background: c.bg, position: 'relative',
      display: 'flex', flexDirection: 'column',
      transition: 'background 320ms ease',
      // CSS vars for fonts
      '--font-display': fontFam,
      '--font-ui': fontFam,
    }}>
      {!native && <StatusBar c={c}/>}

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
          <LastBlock c={c} last={last} periodLength={periodLen} onOpen={() => !empty && setEditIndex(periods.length - 1)} empty={empty}/>
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
                <button key={i} onClick={() => setEditIndex(r.idx)} style={{
                  width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  padding: '14px 0', borderBottom: i < historyRows.length - 1 ? `1px solid ${c.hairline}` : 'none',
                }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.2 }}>
                      {fmtShort(r.entry.start)}, {r.entry.start.getFullYear()}
                    </div>
                  </div>
                  {r.gap ? (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary }}>
                      {r.gap} day cycle
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint }}>—</div>
                  )}
                </button>
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
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          bottom: native ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : 44,
          display: 'flex', alignItems: 'center', gap: 6,
          background: c.surface, border: 'none',
          padding: '10px 18px', borderRadius: 100,
          color: c.textSecondary, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
          letterSpacing: 0.4, cursor: 'pointer', zIndex: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}>
        <Sliders c={c.textSecondary} s={14}/> Settings
      </button>

      {!native && <NavPill c={c}/>}

      <SettingsSheet c={c} open={settingsOpen} onClose={() => setSettingsOpen(false)}
        cycleLen={cycleLen} setCycleLen={(v) => { setCycleLen(v); setCycleMode('manual'); }}
        cycleMode={cycleMode} setCycleMode={setCycleMode}
        periodLen={periodLen} setPeriodLen={(v) => { setPeriodLen(v); setPeriodMode('manual'); }}
        periodMode={periodMode} setPeriodMode={setPeriodMode}
        calSync={calSync} setCalSync={setCalSync}
        calAccount="cycle.user@gmail.com"
        onExport={handleExport}
        onImportOpen={() => { setSettingsOpen(false); setImportOpen(true); }}
      />

      <ImportModal c={c} open={importOpen} onClose={() => setImportOpen(false)}
        onImport={(entries) => setPeriods(p => mergeImportedPeriods(p, entries))}/>

      {editIndex !== null && periods[editIndex] && (
        <EditLastModal c={c} open onClose={() => setEditIndex(null)} entry={periods[editIndex]} periodLength={periodLen}
          onDelete={() => {
            const ids = collectEventIds(periods[editIndex]);
            if (ids.length) setDeletedEventIds(existing => [...existing, ...ids]);
            setPeriods(p => removePeriodAt(p, editIndex));
            setEditIndex(null);
          }}
          onEditDate={(date) => setPeriods(p => setPeriodDate(p, editIndex, date))}
          onEditEnd={(end) => setPeriods(p => setPeriodEnd(p, editIndex, end))}
          minDate={editIndex > 0 ? addDays(periods[editIndex - 1].start, 1) : null}
          maxDate={editIndex < periods.length - 1 ? addDays(periods[editIndex + 1].start, -1) : addDays(todayBase, 7)}/>
      )}

      <Bloom c={c} show={!!bloom} x={bloom?.x} y={bloom?.y}/>
    </div>
  );
}

export {
  LIGHT, DARK, loadStoredState, saveStoredState, makeEntry, hasPeriodOn,
  addPeriodEntry, setPeriodDate, setPeriodEnd, removePeriodAt, collectEventIds,
  autoPeriodLen, parseStoredEntry, serializeEntry,
  buildBackupState, mergeImportedPeriods,
};
export default CycleApp;
