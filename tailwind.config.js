/** @type {import('tailwindcss').Config} */
// Tailwind v3 — classic config. DO NOT migrate to v4 (@import "tailwindcss" / @theme),
// it breaks with the v3 Vite plugin (see handoff). Colors mirror the CSS custom
// properties in styles/tokens.css, which remain the source of truth for theming.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#F59E0B', hover: '#FBB54A', deep: '#C77614' },
        secondary: { DEFAULT: '#4338CA', hover: '#6B5FE0' },
        accent: '#14B8A6',
        danger: '#EF4444',
        ink: '#14181F',
        paper: { DEFAULT: '#FFFFFF', warm: '#FCE7B5' },
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        lg: '14px',
      },
    },
  },
  plugins: [],
};
