module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  // Los inyecta vite.config.js al compilar (sello de versión).
  globals: { __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly', __APP_BUILD_DATE__: 'readonly' },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'android', 'ios', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  // Código de servidor / scripts (NO el navegador): Cloud Functions, rutas /api,
  // config de build y scripts sueltos de la raíz corren en Node, donde `process`,
  // `require`, `module` y `__dirname` SÍ existen. Sin esto el linter los marca como
  // "no definidos" (falso positivo).
  // ⚠️ `**/*.mjs` faltaba y por eso TODOS los scripts de `scripts/` daban errores
  // falsos de `process` y `Buffer` (73 en 15 archivos: register-rappi-webhook 11,
  // asc-submit 9, reseller-apk/build 9, migrate-one-image 8…).
  // Corren en Node igual que los `.js`; solo cambia la extensión. Se descubrió
  // al escribir `scripts/play-submit.mjs` (17-set-2026).
  //
  // No toca el código de la app: no hay ningún `.mjs` bajo `src/`, y `env` solo
  // AÑADE globales — no puede crear errores nuevos en ningún lado.
  overrides: [
    {
      files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
      excludedFiles: ['src/**'],
      env: { node: true },
    },
  ],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react/prop-types': 'off',
    // Apóstrofes/comillas en texto JSX (ej. "you're") — puramente cosmético,
    // el texto se renderiza bien igual. Apagado para reducir ruido.
    'react/no-unescaped-entities': 'off',
  },
}
