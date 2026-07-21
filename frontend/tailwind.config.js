/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14130F', // warm near-black — all body text
        canvas: '#FBFAF7', // warm off-white page background
        paper: '#FFFFFF', // pure white surfaces
        gold: {
          DEFAULT: '#F5B301', // the LinkLock signature
          deep: '#E09400', // edges / hover / borders on white
          soft: '#FFF6DE', // amber wash for "locked & safe" panels
          ring: '#FCD34D',
        },
        line: '#EBE7DA', // warm hairline
        muted: '#6B6659', // secondary text (passes contrast on white)
        state: {
          safe: '#16803D', // locked / released
          freeze: '#C2410C', // disputed / frozen
          review: '#B45309', // under review
          idle: '#8A8577',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        ticket: '0 1px 2px rgba(20,19,15,0.04), 0 12px 34px -12px rgba(20,19,15,0.18)',
        lift: '0 2px 4px rgba(20,19,15,0.05), 0 20px 50px -18px rgba(20,19,15,0.22)',
        gold: '0 8px 24px -6px rgba(245,179,1,0.45)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'lock-click': {
          '0%': { transform: 'translateY(-7px) rotate(-6deg)', opacity: '0' },
          '55%': { transform: 'translateY(1px) rotate(1deg)', opacity: '1' },
          '100%': { transform: 'translateY(0) rotate(0)', opacity: '1' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'rise': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'sheen': {
          '0%': { backgroundPosition: '-120% 0' },
          '100%': { backgroundPosition: '220% 0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(245,179,1,0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgba(245,179,1,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(245,179,1,0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0) rotate(-4deg)' },
          '50%': { transform: 'translateY(-10px) rotate(-1deg)' },
        },
      },
      animation: {
        'lock-click': 'lock-click 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
        'pop-in': 'pop-in 0.3s ease-out both',
        'rise': 'rise 0.5s ease-out both',
        'sheen': 'sheen 2.2s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        'float': 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
