/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core brand colors
        brand: {
          bg: '#000000',
          surface: '#0d0d0d',
          'surface-raised': '#1a1a1a',
          border: 'rgba(255, 255, 255, 0.1)',
          primary: '#948b72',
        },
        // Text colors
        text: {
          primary: '#e8e8e8',
          secondary: '#a0a0a0',
          muted: '#525252',
        },
        // Semantic colors
        success: '#2d6b3a',
        danger: '#b83c2a',
        warning: '#7a5c1a',
      },
      fontFamily: {
        sans: ['Inter', 'Helvetica Now', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      letterSpacing: {
        'widest': '1.5px',
      },
      backdropBlur: {
        'xl': '20px',
      }
    },
  },
  plugins: [],
}
