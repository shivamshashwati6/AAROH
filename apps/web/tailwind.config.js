/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        command: {
          bg: '#070b12',
          surface: '#0d1522',
          card: '#131e31',
          border: '#1f2e48',
          accent: '#3b82f6',
          critical: '#ef4444',
          warning: '#f59e0b',
          success: '#10b981',
        },
      },
    },
  },
  plugins: [],
};
