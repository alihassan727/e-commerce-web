'use client';

import { useTheme } from '@/components/theme-provider';

/**
 * Sun / Moon toggle button. Placed in the navbar and admin layout header.
 * Uses Unicode symbols to avoid a dependency on an icon library.
 */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="btn btn-ghost text-base px-2 py-1"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
