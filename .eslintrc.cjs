module.exports = {
  root: true,
  env: { browser: true, es2020: true },
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
  overrides: [
    {
      files: ['**/*.js', '**/*.cjs'],
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
