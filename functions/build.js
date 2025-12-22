const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  external: [
    'firebase-admin',
    'firebase-functions',
  ],
  sourcemap: true,
  minify: false, // Keep readable for debugging
  format: 'cjs',
}).catch(() => process.exit(1));
