/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Escala de grises "entintada" de azul (estilo Stripe), alineada con la
        // landing/login (--soft #F6F9FC, --border #E6EBF1, --body #425466, --navy #0A2540).
        // Al redefinir `gray`, TODA la app (fondos, bordes, textos) adopta la nueva
        // temperatura sin tocar el markup. Cada paso mantiene una luminosidad muy
        // cercana al gray default de Tailwind para no romper contrastes.
        gray: {
          50: '#F6F9FC',
          100: '#EEF2F7',
          200: '#E6EBF1',
          300: '#D2DCE8',
          400: '#8898AA',
          500: '#6B7C93',
          600: '#425466',
          700: '#3C4D63',
          800: '#13314F',
          900: '#0A2540',
          950: '#06182E',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
