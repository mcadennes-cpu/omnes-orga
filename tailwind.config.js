/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Couleurs principales (extraites du logo Omnès Médecins)
        marine:  '#1C3D52',
        canard:  '#2A8FA8',
        ocre:    '#E8A135',
        olive:   '#6B7A3A',
        brique:  '#D4503A',
        fuchsia: '#D94F7E',

        // Couleurs neutres
        fond:  '#F5F7F9',
        carte: '#FFFFFF',

        // Couleurs sémantiques (textes et bordures)
        ink:    '#1C3D52',
        muted:  'rgba(28,61,82,0.55)',
        faint:  'rgba(28,61,82,0.35)',
        border: 'rgba(28,61,82,0.08)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Archivo', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        tile:  '18px',
        card:  '16px',
        input: '14px',
      },
    },
  },
  plugins: [],
}
