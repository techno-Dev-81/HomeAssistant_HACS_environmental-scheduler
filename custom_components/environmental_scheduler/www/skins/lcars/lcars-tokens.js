// Environmental Scheduler — LCARS skin tokens
// Colors/shapes are config-driven (lcars_options in card config) so the
// skin isn't locked to one palette. See docs/card-architecture.md.

export const COLOR_SCHEMES = {
  classic: { primary: '#ff9966', secondary: '#cc99cc', accent: '#9999ff', bg: '#000000', panelBg: '#1a1a1a' },
  blue:    { primary: '#6699ff', secondary: '#99ccff', accent: '#ffcc66', bg: '#000000', panelBg: '#0f1a24' },
  gold:    { primary: '#ffcc66', secondary: '#ffaa33', accent: '#66ccff', bg: '#000000', panelBg: '#1f1a0f' },
};

const CORNER_RADII = {
  elbow:  { outer: '28px', inner: '6px' },
  pill:   { outer: '999px', inner: '999px' },
  square: { outer: '2px', inner: '2px' },
};

const FONT_STACKS = {
  antonio:    { family: 'Antonio', googleFont: 'Antonio:wght@400;700', fallback: "'Arial Narrow', sans-serif" },
  'swiss-911': { family: 'Microgramma D Extended', googleFont: null, fallback: "'Eurostile', 'Arial Narrow', sans-serif" },
};

/**
 * Builds the <style> contents (CSS custom properties + base rules) for a
 * given lcars_options config block. Consumed by every skins/lcars/*.js card.
 */
export function lcarsTokensCSS(options = {}) {
  const scheme = COLOR_SCHEMES[options.color_scheme] ?? COLOR_SCHEMES.classic;
  const colors = options.color_scheme === 'custom' && options.custom_colors
    ? { ...scheme, ...options.custom_colors }
    : scheme;
  const radii = CORNER_RADII[options.corner_style] ?? CORNER_RADII.elbow;
  const font = FONT_STACKS[options.font] ?? FONT_STACKS.antonio;

  const fontImport = font.googleFont
    ? `@import url('https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap');`
    : '';

  return `
    ${fontImport}
    :host {
      --lcars-primary: ${colors.primary};
      --lcars-secondary: ${colors.secondary};
      --lcars-accent: ${colors.accent};
      --lcars-bg: ${colors.bg};
      --lcars-panel-bg: ${colors.panelBg};
      --lcars-radius-outer: ${radii.outer};
      --lcars-radius-inner: ${radii.inner};
      --lcars-font: '${font.family}', ${font.fallback};
      display: block;
      font-family: var(--lcars-font);
    }
  `;
}
