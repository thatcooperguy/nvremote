/**
 * NVRemote - Design System Theme
 *
 * TypeScript constants mirroring CSS custom properties for use in
 * inline styles and styled components.
 */

export const colors = {
  bg: {
    primary: '#1A1A1A',
    surface: '#242424',
    card: '#2D2D2D',
    elevated: '#333333',
  },
  accent: {
    default: '#76B900',
    hover: '#8ACB00',
    pressed: '#5A9200',
    muted: 'rgba(118, 185, 0, 0.15)',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#B0B0B0',
    disabled: '#707070',
    onPrimary: '#000000',
  },
  semantic: {
    error: '#FF4444',
    errorHover: '#FF5555',
    errorPressed: '#CC3636',
    warning: '#FFB020',
    warningBg: '#78350f',
    warningText: '#fef3c7',
    success: '#76B900',
    info: '#4A9EFF',
  },
  border: {
    default: '#404040',
    hover: '#555555',
    focus: '#76B900',
  },
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
  glow: '0 0 20px rgba(118, 185, 0, 0.15)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
  fontMono:
    "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  fontSize: {
    xs: 11,
    sm: 13,
    md: 14,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const transitions = {
  micro: '120ms ease',
  fast: '150ms ease',
  normal: '250ms ease',
  slow: '400ms ease',
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
  titlebar: 600,
} as const;

export const layout = {
  sidebarWidth: 240,
  sidebarWidthCollapsed: 64,
  titlebarHeight: 40,
} as const;

const theme = {
  colors,
  shadows,
  spacing,
  radius,
  typography,
  transitions,
  zIndex,
  layout,
} as const;

export type Theme = typeof theme;

export default theme;
