'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type FontScale = 'normal' | 'large' | 'larger';

interface AccessibilityState {
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
  highContrast: boolean;
  setHighContrast: (on: boolean) => void;
}

const FONT_SCALE_PERCENT: Record<FontScale, string> = {
  normal: '100%',
  large: '112.5%',
  larger: '125%',
};

const AccessibilityContext = createContext<AccessibilityState | null>(null);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [fontScale, setFontScaleState] = useState<FontScale>('normal');
  const [highContrast, setHighContrastState] = useState(false);
  const [ready, setReady] = useState(false);

  // Load saved preference once on mount — these are real, persisted settings,
  // not decorative UI, so they must survive a page reload.
  useEffect(() => {
    const savedScale = localStorage.getItem('rt_font_scale') as FontScale | null;
    const savedContrast = localStorage.getItem('rt_high_contrast');
    if (savedScale) setFontScaleState(savedScale);
    if (savedContrast === 'true') setHighContrastState(true);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.style.fontSize = FONT_SCALE_PERCENT[fontScale];
    localStorage.setItem('rt_font_scale', fontScale);
  }, [fontScale, ready]);

  useEffect(() => {
    if (!ready) return;
    if (highContrast) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
    localStorage.setItem('rt_high_contrast', String(highContrast));
  }, [highContrast, ready]);

  return (
    <AccessibilityContext.Provider
      value={{
        fontScale,
        setFontScale: setFontScaleState,
        highContrast,
        setHighContrast: setHighContrastState,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider');
  return ctx;
}
