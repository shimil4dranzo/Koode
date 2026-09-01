import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * ESLint flat config.
 *
 * `eslint-config-next` 16 ships flat configs directly. Do NOT wrap these in
 * `FlatCompat` — running the flat config through the eslintrc compatibility
 * layer makes ESLint try to JSON.stringify a plugin object that references
 * itself, and every lint run dies with "Converting circular structure to JSON".
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'public/sw.js',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The domain layer must not reach for `any` — these are the rules that
      // actually matter, and an `any` there hides a real modelling mistake.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Scripts, seeds and the SMS stub are operator tools; printing is the point.
    files: ['scripts/**/*.ts', 'prisma/**/*.ts', 'src/server/sms/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
