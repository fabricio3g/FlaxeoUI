![FlaxeoUI](docs/readme-header.svg)

# FlaxeoUI

![Build Status](https://github.com/fabricio3g/FlaxeoUI/workflows/Build%20and%20Release/badge.svg)

A simple front end for **[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp)**, built with Electron and Node.js.

![FlaxeoUI Screenshot](screenshot/screenshot.png)

## Disclaimer

- The binary may be flagged as untrusted by browsers due to lacking a digital signature.
- The Cloudflare and ngrok tunnels are currently broken. By default, the app shares on the local network for remote use on the same network.
- Testing was limited due to VRAM constraints with larger models.
- Developed and tested on Windows. Linux builds are available (Ubuntu/Debian, AppImage).

## Getting Started

### Prerequisites

- **Node.js** v16+ (tested with v22.20.0)
- **stable-diffusion.cpp** (tested with `master-418-200cb6f`)

### Install & Run

```bash
git clone https://github.com/yourusername/flaxeo-ui.git
cd flaxeo-ui
npm install
npm start
```

### Run server only (no Electron)

```bash
node ./server.js
```

### Build for Windows

```bash
npm run build:win
```

## Development

Run with hot-reloading:

```bash
npm run dev
```

## Architecture

- **Frontend**: Vue 3, TypeScript, Tailwind CSS
- **Backend**: Node.js (Express) managing the `sd-server`/`sd-cli` subprocess
- **Desktop**: Electron wrapper
- **Inference**: stable-diffusion.cpp via `sd-server`/`sd-cli`

## Credits

UI for **[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp)** by **[@leejet](https://github.com/leejet)**.

sky image adapted from Wikimedia Commons: [Field, corn, Liechtenstein, Mountains, Alps, Vaduz, sky, clouds, landscape](https://commons.wikimedia.org/wiki/File:Field,_corn,_Liechtenstein,_Mountains,_Alps,_Vaduz,_sky,_clouds,_landscape.jpg), public domain (`PD-self`) by Wikimedia Commons user Paranoid.

## License

[MIT License](LICENSE)
