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
        // rgb + <alpha-value> 形式才能让透明度修饰符类（bg-primary/10 等）生成；
        // 三元组变量见 index.css 主题块与 store 的 applyCustomThemeColor
        primary: 'rgb(var(--color-primary-rgb, 59 130 246) / <alpha-value>)',
        secondary: 'var(--color-secondary)',
        // 域色（固定身份、不跟主题；三元组见 index.css :root）。透明度修饰符可用，
        // 如 bg-battle/30。battle 取深紫主色；亮紫 / 渐变末端在内联样式里走 rgb(var(--...-rgb))。
        battle: 'rgb(var(--color-battle-rgb, 124 58 237) / <alpha-value>)',
        bond: 'rgb(var(--color-bond-rgb, 99 102 241) / <alpha-value>)',
        gold: 'rgb(var(--color-gold-rgb, 245 158 11) / <alpha-value>)',
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
