import type { Config } from 'tailwindcss';

/**
 * لوحة ميزان: خلفية فاتحة مائلة للأخضر الرمادي، أخضر داكن رئيسي، برتقالي هادئ مساعد.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#F3F6F2',
          soft: '#EAF0E8',
          raised: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#1B2420',
          muted: '#5A6B62',
          faint: '#8C9A92',
        },
        line: {
          DEFAULT: '#DCE4DA',
          strong: '#C3D0C0',
        },
        brand: {
          50: '#EDF3EE',
          100: '#D5E3D7',
          200: '#AAC7AE',
          300: '#7EAA86',
          400: '#548C5F',
          500: '#2F6B43',
          600: '#265737',
          700: '#1E452C',
          800: '#163422',
          900: '#0F2417',
        },
        accent: {
          100: '#FBEBDC',
          200: '#F4D3B4',
          300: '#E8B384',
          400: '#D9945A',
          500: '#C97B3C',
          600: '#A9612C',
        },
        danger: {
          100: '#FBE4E1',
          500: '#B4462F',
          600: '#93361F',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-app)',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Tahoma',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27, 36, 32, 0.04), 0 6px 20px -12px rgba(27, 36, 32, 0.22)',
        composer: '0 -6px 24px -18px rgba(27, 36, 32, 0.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 180ms ease-out',
        'pulse-dot': 'pulseDot 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
