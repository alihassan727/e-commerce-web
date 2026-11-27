import type { Config } from 'tailwindcss';

// Design system: warm alabaster canvas, elevated surface, deep ink text,
// single dynamic clay/brand accent, soft corner radii, no heavy shadows.
// Dark mode uses the 'class' strategy so the user toggle overrides system pref.
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Light mode
        canvas: '#F6F2EC',
        surface: '#FBF9F5',
        ink: '#1B1A18',
        muted: '#6B6660',
        line: '#E2DBD0',
        clay: '#A8472D',
        'clay-dark': '#7E3520',
        'clay-tint': '#E9D8CF',
        // Dark mode surfaces (used via dark: prefix)
        'dark-canvas': '#161513',
        'dark-surface': '#1E1C19',
        'dark-ink': '#EDE9E3',
        'dark-muted': '#9A938A',
        'dark-line': '#33302B',
        'dark-input': '#24221F',
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        subtle: '0 1px 2px rgba(27, 26, 24, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
