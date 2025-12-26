# <img src="public/assets/icon.png" width="32" height="32" alt="icon"> FlaxeoUI

![Build Status](https://github.com/fabricio3g/FlaxeoUI/workflows/Build%20and%20Release/badge.svg)

A Front End for **[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp)**. Built with Electron and Node.js, I made it to be simple to interact with the stable difussion cpp cli

I created this Front End to quickly test models on my PC. Currently, it has only been tested using Vulkan on Linux and Windows.


![FlaxeoUI Screenshot](screenshot/screenshot.png)


## Please use the master-418-200cb6f branch of stable-diffusion.cpp that is the one that works with this version of FlaxeoUI, or you will have issues. for Z Image turbo use the resolution 512x768 a bigger resolution will cause issues like generating white images in my case.

## Disclaimer
This project hasn’t been fully tested. I ran into VRAM limitations when trying larger models, so testing was pretty limited.

I mostly developed and tested this on Windows. The first version did work on Ubuntu, but after the latest changes, I have no idea if it still works on Linux, since I haven’t tested it there again. Same goes for the build created by the GitHub Action, I haven’t tested it at all

##  Getting Started

### Prerequisites
- **Node.js**: v16 or higher (Tested with v22.20.0).
- **stable-diffusion.cpp**: Tested with version `master-418-200cb6f`.
- **NPM**: Included with Node.js.

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/flaxeo-ui.git
    cd flaxeo-ui
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the application**
    ```bash
    npm start
    ```

### Installation Windows Build

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/flaxeo-ui.git
    cd flaxeo-ui
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the application**
    ```bash
    npm run build:win
    ```


## Development

To run the application in debug mode with hot-reloading for the frontend:

```bash

npm run dev
```



## Architecture

- **Frontend**: Vue 3, TypeScript, Tailwind CSS
- **Backend**: Node.js (Express) handling API requests and managing the `sd-server and sd-cli` subprocess.
- **Core**: Electron for the desktop application wrapper.
- **Inference**: Relies on `sd-server and sd-cli` (based on stable-diffusion.cpp) for efficient local inference.

## Credits

This project is a GUI to **[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp)** by **[@leejet](https://github.com/leejet)**.

## License

[MIT License](LICENSE)
