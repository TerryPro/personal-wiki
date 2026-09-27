import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'hsl(var(--ink) / <alpha-value>)',
          soft: 'hsl(var(--ink-soft) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          raised: 'hsl(var(--surface-raised) / <alpha-value>)',
        },
        line: 'hsl(var(--line) / <alpha-value>)',
        fg: {
          DEFAULT: 'hsl(var(--fg) / <alpha-value>)',
          secondary: 'hsl(var(--fg-secondary) / <alpha-value>)',
          muted: 'hsl(var(--fg-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          glow: 'hsl(var(--accent-glow) / <alpha-value>)',
        },
        cat: {
          source: 'hsl(var(--cat-source) / <alpha-value>)',
          entity: 'hsl(var(--cat-entity) / <alpha-value>)',
          concept: 'hsl(var(--cat-concept) / <alpha-value>)',
          synthesis: 'hsl(var(--cat-synthesis) / <alpha-value>)',
          raw: 'hsl(var(--cat-raw) / <alpha-value>)',
          output: 'hsl(var(--cat-output) / <alpha-value>)',
        },
        // 中间步骤卡片的浅红（复用 danger 红相，双主题适配）
        danger: 'hsl(var(--co-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        serif: ['"Newsreader"', 'Georgia', '"Songti SC"', '"SimSun"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 hsl(var(--line)), 0 12px 32px -16px hsl(var(--shadow-color) / 0.35)',
        glow: '0 0 0 1px hsl(var(--accent) / 0.35), 0 4px 24px -6px hsl(var(--accent) / 0.35)',
      },
      spacing: { rail: '17rem', side: '18.5rem' },
      borderRadius: { card: '0.625rem' },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { 'fade-up': 'fade-up 0.28s cubic-bezier(0.4,0,0.2,1) both' },
    },
  },
  plugins: [],
} satisfies Config
