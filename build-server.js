const esbuild = require('esbuild')

console.log('Building server...')

esbuild
  .build({
    entryPoints: ['src/server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: 'out/server/index.js',
    // Native / path-sensitive packages must not be bundled (sharp uses createRequire).
    external: ['electron', 'sharp'],
    // sd-cli-help.txt is bundled as the option list when no sd-cli is installed
    loader: { '.txt': 'text' },
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
