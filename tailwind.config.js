/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
      },
      fontSize: {
        // 字号阶梯最低档（UI_AUDIT_V2.5.md §4.1）：eyebrow/徽章/计数专用，
        // 替换全站 text-[9px]/[10px]/[11px] 任意值
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 20px var(--color-primary)' },
          '50%': { opacity: 0.8, boxShadow: '0 0 40px var(--color-primary)' },
        },
      },
    },
  },
  plugins: [],
}
