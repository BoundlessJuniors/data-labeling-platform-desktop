/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,ts,js,html}'],
  theme: {
    extend: {
      colors: {
        primary: '#1173d4',
        'background-light': '#f6f7f8',
        'background-dark': '#101922'
      },
      fontFamily: { display: ['Inter'] },
      borderRadius: { DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', full: '9999px' }
    }
  },
  plugins: []
}
