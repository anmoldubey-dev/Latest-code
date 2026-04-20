/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          bg:             '#020617',
          'bg-light':     '#0f172a',
          accent:         '#6366F1',
          'accent-hover': '#818CF8',
          violet:         '#8B5CF6',
          muted:          '#94a3b8',
          border:         'rgba(255,255,255,0.08)',
          'border-hover': 'rgba(255,255,255,0.15)',
        },
      },
    },
  },
  plugins: [],
}