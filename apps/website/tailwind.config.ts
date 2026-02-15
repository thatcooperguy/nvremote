import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'cs-green': {
          DEFAULT: '#76B900',
          50: '#F0FAD6',
          100: '#E0F5A8',
          200: '#B8E04F',
          300: '#9AD411',
          400: '#76B900',
          500: '#639D00',
          600: '#508000',
          700: '#3D6300',
          800: '#2A4600',
          900: '#172900',
        },
        'cs-dark': '#FFFFFF',
        'cs-surface': '#FAFAFA',
        'cs-card': '#F5F5F5',
        'cs-gray': {
          DEFAULT: '#1A1A1A',
          50: '#F5F5F5',
          100: '#E0E0E0',
          200: '#B0B0B0',
          300: '#808080',
          400: '#606060',
          500: '#404040',
          600: '#2A2A2A',
          700: '#1A1A1A',
          800: '#121212',
          900: '#0A0A0A',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'sans-serif',
        ],
        display: [
          'var(--font-inter)',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Consolas',
          'Monaco',
          'monospace',
        ],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow':
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(118, 185, 0, 0.06), transparent)',
        'hero-glow-intense':
          'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(118, 185, 0, 0.08), transparent)',
        'grid-pattern':
          'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
        'dot-pattern':
          'radial-gradient(circle, rgba(0, 0, 0, 0.04) 1px, transparent 1px)',
        'noise': 'none',
        'gradient-border':
          'linear-gradient(135deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.06))',
      },
      backgroundSize: {
        'grid-sm': '24px 24px',
        'grid-md': '40px 40px',
        'grid-lg': '60px 60px',
        'dot-sm': '20px 20px',
        'dot-md': '30px 30px',
      },
      boxShadow: {
        'glow-sm': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'glow': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'glow-lg': '0 8px 24px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.06)',
        'glow-intense': '0 12px 36px rgba(0, 0, 0, 0.12), 0 6px 12px rgba(0, 0, 0, 0.08)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(118, 185, 0, 0.15)',
        'red-glow': '0 4px 12px rgba(239, 68, 68, 0.1)',
        'purple-glow': '0 4px 12px rgba(168, 85, 247, 0.1)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.8s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out infinite',
        'float-slower': 'float 10s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'grid-move': 'gridMove 20s linear infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'beam': 'beam 3s ease-in-out infinite',
        'scan-line': 'scanLine 4s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
        'counter': 'counter 2s ease-out forwards',
        'border-flow': 'borderFlow 4s linear infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        gridMove: {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(40px, 40px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
        beam: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        borderFlow: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '200% 200%' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
