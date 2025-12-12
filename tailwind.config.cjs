/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,ts,js,html}'],
  theme: {
    extend: {
      colors: {
        // Labeling UI paleti (Slate/Blue tabanlı)
        primary: {
          DEFAULT: '#2563EB', // aksiyon rengi
          light: '#3B82F6', // hover/secondary accent
          medium: '#1E40AF' // pressed/active
        },
        secondary: '#475569', // ikincil metin/ikon/soft button
        accent: '#2563EB',
        muted: '#CBD5E1', // disabled / subtle fill

        'background-light': '#F8FAFC', // ana arka plan
        'background-dark': '#0F172A', // dark mode arka plan
        surface: '#FFFFFF', // panel/card zemini
        border: '#E5E7EB', // ayraç/çizgi
        'text-primary': '#0F172A',
        'text-secondary': '#475569'
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
