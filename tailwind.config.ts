import type { Config } from 'tailwindcss';

// Design system: warm off-white canvas, ink text, single clay accent.
// Hard rules enforced: no soft radii (max 2px), no shadows, no gradients,
// no hover animations/transitions, no neon/pastel/purple-black palette.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F2EC', // warm off-white, never pure white
        ink: '#1B1A18',
        muted: '#6B6660',
        line: '#D9D2C7',
        clay: '#A8472D', // single accent, grounded
        'clay-dark': '#7E3520',
        'clay-tint': '#E9D8CF',
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
