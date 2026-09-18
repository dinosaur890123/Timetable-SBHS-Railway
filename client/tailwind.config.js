/** @type {import('tailwindcss').Config} */

// Neutral scale is driven by CSS variables (see index.css) so interface themes
// can retune surfaces without touching component class names.
const zincSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// Half-steps (zinc-150 … zinc-850) are used throughout the UI. They are mixed
// from their two neighbours rather than hardcoded, so every colour theme and
// interface theme retunes them for free by retuning the base scale.
const zincHalfSteps = [150, 250, 350, 450, 550, 650, 750, 850];

const zinc = Object.fromEntries([
  ...zincSteps.map(step => [step, `rgb(var(--zinc-${step}) / <alpha-value>)`]),
  ...zincHalfSteps.map(step => [
    step,
    `color-mix(in srgb, rgb(var(--zinc-${step - 50})), rgb(var(--zinc-${step + 50})))`
  ])
]);

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        space: ['var(--font-display)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        zinc,
        black: 'rgb(var(--black) / <alpha-value>)',
        white: 'rgb(var(--white) / <alpha-value>)',
        // Modern interface surfaces (variables defined in theme/modern.css)
        m: {
          page: 'rgb(var(--m-page) / <alpha-value>)',
          panel: 'rgb(var(--m-panel) / <alpha-value>)',
          card: 'rgb(var(--m-card) / <alpha-value>)',
          line: 'rgb(var(--m-line) / var(--m-line-a))',
        },
        accent: 'hsl(var(--color-accent) / <alpha-value>)',
        'accent-contrast': 'hsl(var(--color-accent-contrast) / <alpha-value>)',
        sbhs: {
          dark: '#1e1e1e', // Dark theme background
          panel: '#2d2d2d',
          accent: '#4ade80', // Green accent
          text: '#e5e7eb',
          subtext: '#9ca3af'
        }
      }
    },
  },
  plugins: [],
}
