/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // La escala de la MARCA. Lee variables CSS (tripletas RGB, definidas
        // con el azul de Cobrify en index.css) para que el color del reseller
        // pueda reemplazarla en runtime (aplicarEscalaPrimary): asi el POS, la
        // franja del status bar y los ~2.500 usos de primary-* adoptan su
        // color sin tocar el markup. El formato rgb(... / <alpha-value>)
        // conserva los modificadores de opacidad (bg-primary-600/20).
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
          950: 'rgb(var(--primary-950) / <alpha-value>)',
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
