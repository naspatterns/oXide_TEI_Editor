import { useState, useCallback } from 'react';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  const toggle = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('tei-editor-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('tei-editor-theme', 'light');
    }
  }, [isDark]);

  return (
    <button onClick={toggle} title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {isDark ? 'Light' : 'Dark'}
    </button>
  );
}
