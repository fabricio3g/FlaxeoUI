const esbuild = require('esbuild')

console.log('Building server...')

esbuild
  .build({
    entryPoints: ['src/server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: 'out/server/index.js',
    external: [
      // Only externalize native modules that can't be bundled
      'electron',
      '@ngrok/ngrok',
      'cloudflared'
    ],
    format: 'cjs',
    sourcemap: false,
    minify: true
  })
  .then(() => {
    console.log('Server build complete: out/server/index.js')
  })
  .catch((err) => {
    console.error('Server build failed:', err)
    process.exit(1)
  })
