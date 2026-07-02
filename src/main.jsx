import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import CycleApp, { loadStoredState, saveStoredState } from './CycleApp.jsx';
import './styles.css';

const ACCENT_PALETTES = {
  '#C4928A': { accent: '#C4928A', deep: '#A87770', muted: '#E8D5D0' },
  '#A3B5A6': { accent: '#A3B5A6', deep: '#7E9382', muted: '#D8E2DA' },
  '#B5A5C4': { accent: '#B5A5C4', deep: '#8E7BA3', muted: '#E2D8EA' },
  '#D4A574': { accent: '#D4A574', deep: '#B0844F', muted: '#EFDCC0' },
};

function App() {
  const [stored, setStored] = useState(() => loadStoredState() || {});
  const [appearance] = useState(() => ({
    dark: stored.dark ?? false,
    accent: stored.accent || '#C4928A',
    font: stored.font || 'quicksand',
  }));

  const palette = ACCENT_PALETTES[appearance.accent] || ACCENT_PALETTES['#C4928A'];

  useEffect(() => {
    document.body.classList.toggle('dark', !!appearance.dark);
  }, [appearance.dark]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const applyNativeChrome = async () => {
      await StatusBar.setStyle({ style: appearance.dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: appearance.dark ? '#1E1C19' : '#FAF7F2' });
      await SplashScreen.hide();
    };

    applyNativeChrome().catch(() => {});
  }, [appearance.dark]);

  const handleSettingsChange = useCallback((next) => {
    setStored((previous) => {
      const nextState = { ...previous, ...appearance, ...next };
      saveStoredState(nextState);
      return nextState;
    });
  }, [appearance]);

  const initialPeriods = useMemo(() => stored.periods || [], []);

  return (
    <CycleApp
      native={Capacitor.isNativePlatform()}
      initialPeriods={initialPeriods}
      initialCycleLen={stored.cycleLen ?? 27}
      initialCycleMode={stored.cycleMode || 'manual'}
      initialPeriodLen={stored.periodLen ?? 5}
      initialPeriodMode={stored.periodMode || 'manual'}
      initialDeletedEventIds={stored.deletedEventIds || []}
      initialLastSyncedAt={stored.lastSyncedAt ?? null}
      dark={appearance.dark}
      calSyncInit={stored.calSync ?? false}
      accent={palette.accent}
      accentDeep={palette.deep}
      accentMuted={palette.muted}
      font={appearance.font}
      onSettingsChange={handleSettingsChange}
    />
  );
}

createRoot(document.getElementById('root')).render(<App />);
