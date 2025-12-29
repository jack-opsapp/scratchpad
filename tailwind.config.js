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
          surface: '#0a0a0a',
          border: '#1a1a1a',
          primary: '#d1b18f',
        },
        // Text colors
        text: {
          primary: '#ffffff',
          muted: '#888888',
        },
        // Semantic colors
        success: '#4CAF50',
        danger: '#ff6b6b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xxs': '10px',
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
