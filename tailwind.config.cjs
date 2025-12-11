/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,ts,js,html}'],
  theme: {
    extend: {
      colors: {
        // Fresh Mint UI paleti
        primary: {
          DEFAULT: '#12D3CF', // teal – ana accent
          light: '#B0F4E6', // aqua
          medium: '#67EACA' // mint
        },
        secondary: '#67EACA', // mint (örn. Filter Tasks butonu)
        accent: '#12D3CF', // ek vurgu
        muted: '#f5f3ebff', // cream – genel arka plan

        'background-light': '#FCF9EC',
        'background-dark': '#101922'
      },
      fontFamily: {
        sans: ['Exo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Exo', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: { DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', full: '9999px' }
    }
  },
  plugins: []
}
