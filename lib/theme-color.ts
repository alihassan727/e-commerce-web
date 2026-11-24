/**
 * Pure-TS color utilities for the global theme color system.
 * No external dependencies. Called server-side in app/layout.tsx.
 *
 * All functions accept and return 6-digit uppercase hex strings (#RRGGBB).
 */

function clamp(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** Parse a 3- or 6-digit hex string into [r, g, b]. */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0').toUpperCase()).join('');
}

/**
 * Returns a lighter tint by blending the accent color toward white.
 * factor 0 = original, factor 1 = white.
 * Default factor 0.75 gives a soft pastel background swatch.
 */
export function lighten(hex: string, factor = 0.75): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}

/**
 * Returns a darker shade by blending the accent color toward black.
 * factor 0 = original, factor 1 = black.
 * Default factor 0.18 gives a subtle pressed/active state.
 */
export function darken(hex: string, factor = 0.18): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

/** Validates a 3- or 6-digit hex string. */
export function isValidHex(hex: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}

/**
 * Returns the full set of theme CSS variables from a single base color.
 *
 *   --accent         base accent (primary buttons, active states)
 *   --accent-dark    pressed / hover darker shade
 *   --accent-tint    very light tint for placeholder backgrounds
 *   --accent-text    text on top of --accent backgrounds (#fffdf9 always)
 */
export function buildThemeVars(baseColor: string): Record<string, string> {
  const base = isValidHex(baseColor) ? baseColor.toUpperCase() : '#A8472D';
  return {
    '--accent':      base,
    '--accent-dark': darken(base, 0.18),
    '--accent-tint': lighten(base, 0.78),
    '--accent-text': '#FFFDF9',
  };
}
