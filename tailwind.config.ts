import type { Config } from 'tailwindcss';

// Design system: warm off-white canvas, ink text, single clay accent.
// Hard rules enforced: no soft radii (max 2px), no shadows, no gradients,
// no hover animations/transitions, no neon/pastel/purple-black palette.
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
        ink: '#1B1A18',
        muted: '#6B6660',
        line: '#D9D2C7',
        clay: '#A8472D',
        'clay-dark': '#7E3520',
        'clay-tint': '#E9D8CF',
        // Dark mode surfaces (used via dark: prefix)
        'dark-canvas': '#1A1916',
        'dark-surface': '#222018',
        'dark-ink': '#EDE9E3',
        'dark-muted': '#8C8580',
        'dark-line': '#3A3832',
        'dark-input': '#242220',
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-ibm-plex)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};

export default config;
