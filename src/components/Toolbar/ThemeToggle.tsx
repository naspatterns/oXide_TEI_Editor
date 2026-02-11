import { useState, useCallback } from 'react';

/** Safely set localStorage item (handles Private Mode) */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (Private Mode) — theme will reset on reload
  }
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  const toggle = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      safeSetItem('tei-editor-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      safeSetItem('tei-editor-theme', 'light');
    }
  }, [isDark]);

  return (
    <button onClick={toggle} title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {isDark ? 'Light' : 'Dark'}
    </button>
  );
}
