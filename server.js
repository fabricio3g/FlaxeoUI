const fs = require('fs')
const path = require('path')

const builtServer = path.join(__dirname, 'out', 'server', 'index.js')

if (!fs.existsSync(builtServer)) {
  console.error('Built server not found. Run `node build-server.js` first.')
  process.exit(1)
}

require(builtServer)
