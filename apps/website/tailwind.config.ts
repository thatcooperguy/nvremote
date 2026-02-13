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
        'cs-dark': '#050505',
        'cs-surface': '#0A0A0A',
        'cs-card': '#0F0F0F',
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
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(118, 185, 0, 0.15), transparent)',
        'hero-glow-intense':
          'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(118, 185, 0, 0.25), transparent)',
        'grid-pattern':
          'linear-gradient(rgba(118, 185, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(118, 185, 0, 0.03) 1px, transparent 1px)',
        'dot-pattern':
          'radial-gradient(circle, rgba(118, 185, 0, 0.08) 1px, transparent 1px)',
        'noise':
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.02'/%3E%3C/svg%3E\")",
        'gradient-border':
          'linear-gradient(135deg, rgba(118, 185, 0, 0.4), rgba(118, 185, 0, 0), rgba(118, 185, 0, 0.2))',
      },
      backgroundSize: {
        'grid-sm': '24px 24px',
        'grid-md': '40px 40px',
        'grid-lg': '60px 60px',
        'dot-sm': '20px 20px',
        'dot-md': '30px 30px',
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(118, 185, 0, 0.1)',
        'glow': '0 0 30px rgba(118, 185, 0, 0.15), 0 0 60px rgba(118, 185, 0, 0.05)',
        'glow-lg': '0 0 50px rgba(118, 185, 0, 0.2), 0 0 100px rgba(118, 185, 0, 0.08)',
        'glow-intense': '0 0 60px rgba(118, 185, 0, 0.3), 0 0 120px rgba(118, 185, 0, 0.15), 0 0 180px rgba(118, 185, 0, 0.05)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.03)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(118, 185, 0, 0.1), 0 0 30px rgba(118, 185, 0, 0.05)',
        'red-glow': '0 0 30px rgba(239, 68, 68, 0.15), 0 0 60px rgba(239, 68, 68, 0.05)',
        'purple-glow': '0 0 30px rgba(168, 85, 247, 0.15), 0 0 60px rgba(168, 85, 247, 0.05)',
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
