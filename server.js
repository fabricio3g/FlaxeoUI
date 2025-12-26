const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const multer = require('multer');
const https = require('https');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const AdmZip = require('adm-zip');
const tar = require('tar');
let ngrok;
try {
    ngrok = require('@ngrok/ngrok');
} catch (e) {
    console.warn('[Server] Failed to load @ngrok/ngrok:', e.message);
}

let cloudflared;
try {
    cloudflared = require('cloudflared');
} catch (e) {
    console.warn('[Server] Failed to load cloudflared:', e.message);
}

// --- CLI Args ---
const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return (i !== -1 && args[i + 1]) ? args[i + 1] : def; };
const hasFlag = (name) => args.includes(name);

const PORT = parseInt(getArg('--port', '3000'));
const HOST = hasFlag('--local') ? '0.0.0.0' : getArg('--host', 'localhost');

const app = express();

// --- Path Resolution for Packaged vs Dev Mode ---
// In packaged mode, FLAXEO_RESOURCES_PATH points to the resources folder
// which contains backend, models, output as writable directories
// In dev mode, resources are in the flaxeo-vue folder itself
const IS_PACKAGED = process.env.FLAXEO_PACKAGED === '1';
const RESOURCES_PATH = process.env.FLAXEO_RESOURCES_PATH || __dirname;

console.log('[Server] Mode:', IS_PACKAGED ? 'PACKAGED' : 'DEVELOPMENT');
console.log('[Server] Resources path:', RESOURCES_PATH);

// Writable directories (use resources path in packaged mode)
const BACKEND_DIR = path.join(RESOURCES_PATH, 'backend');
const CUSTOM_DIR = path.join(BACKEND_DIR, 'custom');
const RELEASES_DIR = path.join(BACKEND_DIR, 'releases');
const MODELS_DIR = path.join(RESOURCES_PATH, 'models');
const OUTPUT_DIR = path.join(RESOURCES_PATH, 'output');
const TEMP_DIR = path.join(RESOURCES_PATH, 'temp');

// Config file should be in resources path for persistence
const CONFIG_FILE = path.join(RESOURCES_PATH, 'backend-config.json');

// GitHub API for releases
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/leejet/stable-diffusion.cpp/releases';
let releasesCache = null;
let releasesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Backend Config Management ---
function loadBackendConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) { console.error('Error loading config:', e); }
    return {
        activeVersion: 'custom', // 'custom' or release tag
        installedVersions: [],
        customBinaryExists: false
    };
}

function saveBackendConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Get the active backend path based on config
function getActiveBackendPath() {
    if (backendConfig.activeVersion === 'custom') {
        return CUSTOM_DIR;
    }
    return path.join(RELEASES_DIR, backendConfig.activeVersion);
}

let backendConfig = loadBackendConfig();

// Ensure directories exist
['diffusion', 'vae', 'llm', 't5xxl', 'clip', 'clip_vision', 'loras', 'controlnet', 'photomaker', 'upscale', 'taesd'].forEach(d => {
    fs.mkdirSync(path.join(MODELS_DIR, d), { recursive: true });
});
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(BACKEND_DIR, { recursive: true });
fs.mkdirSync(CUSTOM_DIR, { recursive: true });
fs.mkdirSync(RELEASES_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, OUTPUT_DIR),
    filename: (req, file, cb) => cb(null, `gen_${Date.now()}.png`)
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/output', express.static(OUTPUT_DIR));
app.use('/temp', express.static(TEMP_DIR));

// Serve Font Awesome and Tailwind from node_modules
app.use('/fontawesome', express.static(path.join(__dirname, 'node_modules', '@fortawesome', 'fontawesome-free')));
app.use('/tailwindcss', express.static(path.join(__dirname, 'node_modules', 'tailwindcss', 'dist')));

// Serve web UI from public folder (for browser/phone access)
// Serve web UI from dist/renderer (built frontend) or public (dev fallback)
// Prioritize the built frontend in out/renderer
let publicDir = path.join(__dirname, 'out', 'renderer');
if (!fs.existsSync(publicDir)) {
    publicDir = path.join(__dirname, 'public');
}

// Check parent directory as last resort (legacy/dev structure)
if (!fs.existsSync(publicDir)) {
    publicDir = path.join(__dirname, '..', 'public');
}

if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    console.log('[Server] Web UI enabled from:', publicDir);
} else {
    // Fallback: serve a simple status page
    app.get('/', (req, res) => {
        res.json({
            message: 'FlaxeoUI API Server',
            status: 'running',
            note: 'Web UI not found. Place public folder in parent directory for browser access.',
            endpoints: {
                status: '/api/status',
                models: '/api/models',
                gallery: '/api/gallery'
            }
        });
    });
}

let sdProcess = null;
let cliProcess = null; // Track CLI process for cancellation
let serverLogs = [];
let lastSdArgs = null;

const listFiles = (subdir) => {
    try {
        const dir = path.join(MODELS_DIR, subdir);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    } catch (e) { return []; }
};

// API: Get Models
app.get('/api/models', (req, res) => {
    res.json({
        diffusion: listFiles('diffusion'),
        loras: listFiles('loras'),
        vae: listFiles('vae'),
        llm: listFiles('llm'),
        t5xxl: listFiles('t5xxl'),
        clip: listFiles('clip'),
        clipG: listFiles('clip'),  // CLIP-G files are also in clip folder
        clipVision: listFiles('clip_vision'),
        controlnet: listFiles('controlnet'),
        photomaker: listFiles('photomaker'),
        upscale: listFiles('upscale'),
        taesd: listFiles('taesd'),
        embeddings: listFiles('embeddings')
    });
});

// API: Start Server
app.post('/api/start', (req, res) => {
    if (sdProcess) return res.status(400).json({ message: 'Server already running' });

    const body = req.body;
    const args = ['--listen-port', String(body.port || 1234), '-v'];

    // --- 1. Model Loading Strategy ---
    if (body.loadMode === 'split') {
        // Split Mode (Flux/SD3/Big Models)
        if (body.diffusionModel) args.push('--diffusion-model', path.join(MODELS_DIR, 'diffusion', body.diffusionModel));
        if (body.clipL) args.push('--clip_l', path.join(MODELS_DIR, 'clip', body.clipL));
        if (body.clipG) args.push('--clip_g', path.join(MODELS_DIR, 'clip', body.clipG));
        if (body.t5xxl) args.push('--t5xxl', path.join(MODELS_DIR, 't5xxl', body.t5xxl));
        if (body.llm) args.push('--llm', path.join(MODELS_DIR, 'llm', body.llm));
        if (body.vae) args.push('--vae', path.join(MODELS_DIR, 'vae', body.vae));
    } else {
        // Standard Mode (SD 1.5 / SDXL Single File)
        if (body.diffusionModel) args.push('-m', path.join(MODELS_DIR, 'diffusion', body.diffusionModel));
        if (body.vae) args.push('--vae', path.join(MODELS_DIR, 'vae', body.vae));
    }

    // --- 2. Startup Parameters ---
    if (body.loraDir) args.push('--lora-model-dir', path.join(MODELS_DIR, 'loras'));

    // Core Settings
    args.push('--lora-apply-mode', body.loraApplyMode || 'auto');

    // Advanced Schedule/Sampling
    if (body.scheduler) args.push('--scheduler', body.scheduler);
    if (body.samplingMethod) args.push('--sampling-method', body.samplingMethod);
    if (body.rngType) args.push('--rng', body.rngType);

    // Hardware / Memory - Optimization
    if (body.diffusionFa) args.push('--diffusion-fa');
    if (body.vaeTiling) args.push('--vae-tiling');
    if (body.clipOnCpu) args.push('--clip-on-cpu');
    if (body.vaeOnCpu) args.push('--vae-on-cpu');
    if (body.offloadToCpu) args.push('--offload-to-cpu');

    if (body.vaeTileSize) args.push('--vae-tile-size', String(body.vaeTileSize));
    if (body.controlNet) args.push('--control-net', path.join(MODELS_DIR, 'controlnet', body.controlNet));
    if (body.photoMaker) args.push('--photo-maker', path.join(MODELS_DIR, 'photomaker', body.photoMaker));

    // Generation defaults (these are startup-time settings for sd-server)
    if (body.defaultSteps) args.push('--steps', String(body.defaultSteps));
    if (body.defaultCfg) args.push('--cfg-scale', String(body.defaultCfg));

    console.log(':: Starting ::', args.join(' '));
    serverLogs = [];

    try {
        const activeBackend = getActiveBackendPath();
        const sdServerBin = path.join(activeBackend, process.platform === 'win32' ? 'sd-server.exe' : 'sd-server');
        sdProcess = spawn(sdServerBin, args, { cwd: activeBackend });

        sdProcess.stdout.on('data', d => {
            const msg = d.toString();
            process.stdout.write(msg);
            serverLogs.push(msg);
        });
        sdProcess.stderr.on('data', d => {
            const msg = d.toString();
            process.stderr.write(msg);
            serverLogs.push(msg);
        });
        sdProcess.on('close', code => {
            console.log(`SD Exit: ${code}`);
            sdProcess = null;
            serverLogs.push(`EXIT: ${code}`);
        });

        lastSdArgs = args;
        res.json({ message: 'Server started', args });
    } catch (e) {
        res.status(500).json({ message: 'Failed to start', error: e.message });
    }
});

app.post('/api/stop', (req, res) => {
    if (sdProcess) { sdProcess.kill(); sdProcess = null; res.json({ message: 'Stopped' }); }
    else res.status(400).json({ message: 'Not running' });
});

app.get('/api/status', (req, res) => res.json({ running: !!sdProcess, logs: serverLogs.slice(-50) }));

app.post('/api/generate', async (req, res) => {
    if (!sdProcess) return res.status(400).json({ message: 'Server not running' });

    const { prompt, negative_prompt, steps, cfg_scale, width, height, seed, batch_size = 1, guidance, clip_skip } = req.body;

    // Strict payload mapping to force the server to obey
    const stepsVal = parseInt(steps) || 20;
    const payload = {
        prompt,
        negative_prompt: negative_prompt || "",
        n: 1, // We handle batching manually
        size: `${Math.round(width / 64) * 64}x${Math.round(height / 64) * 64}`,
        response_format: "b64_json",

        // Try all possible step parameter names sd-server might accept
        steps: stepsVal,
        sample_steps: stepsVal,
        num_inference_steps: stepsVal,

        cfg_scale: parseFloat(cfg_scale) || 7.0,
        seed: parseInt(seed) || -1,

        // Only add guidance if present (Flux)
        ...(guidance ? { guidance: parseFloat(guidance) } : {}),
        // Clip Skip
        ...(clip_skip ? { clip_skip: parseInt(clip_skip) } : {})
    };

    console.log(`[GEN] Steps: ${payload.sample_steps} | Batch: ${batch_size}`);

    try {
        const generatedFiles = [];
        for (let i = 0; i < batch_size; i++) {
            if (payload.seed !== -1 && i > 0) payload.seed += 1;

            const response = await fetch('http://localhost:1234/v1/images/generations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();

            if (!data.data || !data.data[0]) throw new Error("No data received");

            const b64 = data.data[0].b64_json;
            const filename = `gen_${Date.now()}_${i}.png`;
            fs.writeFileSync(path.join(OUTPUT_DIR, filename), Buffer.from(b64, 'base64'));
            generatedFiles.push(filename);
        }
        res.json({ message: 'Complete', filenames: generatedFiles });
    } catch (e) {
        console.error('Gen Error:', e);
        res.status(500).json({ message: 'Generation failed', error: e.message });
    }
});

// CLI Mode Generation (spawns sd-cli, generates image, and exits)
function getSdCliPath() {
    const activeBackend = getActiveBackendPath();
    return path.join(activeBackend, process.platform === 'win32' ? 'sd-cli.exe' : 'sd-cli');
}

// Multer config for PhotoMaker and Kontext images
const cliUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            // Use different temp dirs for PM vs Kontext
            if (file.fieldname === 'kontextRefImage') {
                const kontextDir = path.join(TEMP_DIR, `kontext_${Date.now()}`);
                fs.mkdirSync(kontextDir, { recursive: true });
                req.kontextRefDir = kontextDir;
                cb(null, kontextDir);
            } else {
                // PhotoMaker images
                if (!req.pmImagesDir) {
                    req.pmImagesDir = path.join(TEMP_DIR, `pm_${Date.now()}`);
                    fs.mkdirSync(req.pmImagesDir, { recursive: true });
                }
                cb(null, req.pmImagesDir);
            }
        },
        filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
    })
}).fields([
    { name: 'pmImages', maxCount: 4 },
    { name: 'kontextRefImage', maxCount: 1 },
    { name: 'controlNetImage', maxCount: 1 }
]);

app.post('/api/generate-cli', cliUpload, async (req, res) => {
    // Handle both JSON and FormData
    const body = req.body;

    const {
        prompt, negative_prompt, steps, cfg_scale, width, height, seed, guidance, clip_skip,
        loadMode, diffusionModel, t5xxl, llm, clipL, clipG, clipVision, vae, scheduler, samplingMethod,
        diffusionFa, vaeTiling, clipOnCpu, offloadToCpu, loraApplyMode, vaeTileSize,
        diffusionConvDirect, vaeConvDirect, forceSDXLVaeConvScale, embdDir,
        rngType, batchCount, quantizationType, upscaleModel, taesdModel, livePreviewMethod,
        // PhotoMaker params
        photoMaker, pmStyleStrength, pmIdEmbedsPath, pmGalleryImages, photoMakerImages,
        // Kontext params
        kontextRefGallery, kontextRefPath: kontextRefPathBody,
        // ControlNet params
        controlNet, controlStrength, applyCanny, controlNetImageGallery, controlImagePath: controlImagePathBody
    } = body;

    const filename = `gen_${Date.now()}.png`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    // Handle Kontext reference image
    // Priority: Uploaded File > Request Body Path > Gallery Path
    let kontextRefPath = null;
    if (req.files && req.files['kontextRefImage'] && req.files['kontextRefImage'].length > 0) {
        kontextRefPath = req.files['kontextRefImage'][0].path;
    } else if (kontextRefPathBody) {
        kontextRefPath = kontextRefPathBody;
    } else if (kontextRefGallery) {
        kontextRefPath = path.join(OUTPUT_DIR, kontextRefGallery);
    }

    // Handle ControlNet image
    // Priority: Uploaded File > Request Body Path > Gallery Path
    let controlImagePath = null;
    if (req.files && req.files['controlNetImage'] && req.files['controlNetImage'].length > 0) {
        controlImagePath = req.files['controlNetImage'][0].path;
    } else if (controlImagePathBody) {
        controlImagePath = controlImagePathBody;
    } else if (controlNetImageGallery) {
        controlImagePath = path.join(OUTPUT_DIR, controlNetImageGallery);
    }

    // Handle PhotoMaker images directory
    let pmImagesDir = req.pmImagesDir || null;

    // Handle local paths for PhotoMaker (copy to temp dir)
    if (photoMakerImages && Array.isArray(photoMakerImages) && photoMakerImages.length > 0) {
        if (!pmImagesDir) {
            pmImagesDir = path.join(TEMP_DIR, `pm_${Date.now()}`);
            fs.mkdirSync(pmImagesDir, { recursive: true });
        }
        try {
            for (const imgPath of photoMakerImages) {
                if (fs.existsSync(imgPath)) {
                    const destName = path.basename(imgPath);
                    fs.copyFileSync(imgPath, path.join(pmImagesDir, destName));
                }
            }
        } catch (e) {
            console.error('Failed to copy local PhotoMaker images:', e);
        }
    }

    // If gallery images were specified, copy them to the PM images dir
    if (pmGalleryImages) {
        try {
            const galleryFiles = JSON.parse(pmGalleryImages);
            if (galleryFiles.length > 0) {
                if (!pmImagesDir) {
                    pmImagesDir = path.join(TEMP_DIR, `pm_${Date.now()}`);
                    fs.mkdirSync(pmImagesDir, { recursive: true });
                }
                for (const gFile of galleryFiles) {
                    const srcPath = path.join(OUTPUT_DIR, gFile);
                    const destPath = path.join(pmImagesDir, gFile);
                    if (fs.existsSync(srcPath)) {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to parse pmGalleryImages:', e);
        }
    }

    // Build arguments for sd-cli
    const args = [];

    // Validate that a model is specified
    if (!diffusionModel) {
        return res.status(400).json({ 
            message: 'No model selected. Please select a model in the sidebar (Model Configuration section).',
            error: 'MODEL_REQUIRED'
        });
    }

    // Model loading based on mode
    if (loadMode === 'split') {
        if (diffusionModel) args.push('--diffusion-model', path.join(MODELS_DIR, 'diffusion', diffusionModel));
        if (clipL) args.push('--clip_l', path.join(MODELS_DIR, 'clip', clipL));
        if (clipG) args.push('--clip_g', path.join(MODELS_DIR, 'clip', clipG));
        if (clipVision) args.push('--clip_vision', path.join(MODELS_DIR, 'clip_vision', clipVision));
        if (t5xxl) args.push('--t5xxl', path.join(MODELS_DIR, 't5xxl', t5xxl));
        if (llm) args.push('--llm', path.join(MODELS_DIR, 'llm', llm));
        if (vae) args.push('--vae', path.join(MODELS_DIR, 'vae', vae));
    } else {
        if (diffusionModel) args.push('-m', path.join(MODELS_DIR, 'diffusion', diffusionModel));
        if (vae) args.push('--vae', path.join(MODELS_DIR, 'vae', vae));
    }

    // Generation parameters
    args.push('-p', prompt || '');
    if (negative_prompt) args.push('-n', negative_prompt);
    args.push('--steps', String(steps || 20));
    args.push('--cfg-scale', String(cfg_scale || 7));
    args.push('-W', String(Math.round((width || 1024) / 64) * 64));
    args.push('-H', String(Math.round((height || 1024) / 64) * 64));
    args.push('-s', String(seed || -1));
    args.push('-o', outputPath);

    // Optional parameters
    if (guidance) args.push('--guidance', String(guidance));
    if (clip_skip && parseInt(clip_skip) !== -1) args.push('--clip-skip', String(clip_skip));
    if (scheduler) args.push('--scheduler', scheduler);
    if (samplingMethod) args.push('--sampling-method', samplingMethod);
    if (loraApplyMode) args.push('--lora-apply-mode', loraApplyMode);
    if (vaeTileSize) args.push('--vae-tile-size', String(vaeTileSize));
    if (rngType) args.push('--rng', rngType);
    if (batchCount && parseInt(batchCount) > 1) args.push('-b', String(batchCount));

    // Hardware flags
    // --diffusion-fa may conflict with LoRA loading on some backends
    const promptStr = prompt || '';
    if ((diffusionFa === true || diffusionFa === 'true') && !promptStr.includes('<lora:')) args.push('--diffusion-fa');
    if (vaeTiling === true || vaeTiling === 'true') args.push('--vae-tiling');
    if (clipOnCpu === true || clipOnCpu === 'true') args.push('--clip-on-cpu');
    if (offloadToCpu === true || offloadToCpu === 'true') args.push('--offload-to-cpu');
    if (diffusionConvDirect === true || diffusionConvDirect === 'true') args.push('--diffusion-conv-direct');
    if (vaeConvDirect === true || vaeConvDirect === 'true') args.push('--vae-conv-direct');
    if (forceSDXLVaeConvScale === true || forceSDXLVaeConvScale === 'true') args.push('--force-sdxl-vae-conv-scale');
    const embeddingsDir = path.join(MODELS_DIR, 'embeddings');
    if (fs.existsSync(embeddingsDir)) {
        args.push('--embd-dir', embeddingsDir);
    }


    // LoRA directory - only add if prompt contains LoRA tags
    if (promptStr.includes('<lora:')) {
        args.push('--lora-model-dir', path.join(MODELS_DIR, 'loras'));
    }

    // Quantization type (--type)
    if (quantizationType) args.push('--type', quantizationType);

    // Kontext reference image (-r)
    if (kontextRefPath && fs.existsSync(kontextRefPath)) {
        args.push('-r', kontextRefPath);
    }

    // ESRGAN Upscale model (--upscale-model)
    if (upscaleModel) args.push('--upscale-model', path.join(MODELS_DIR, 'upscale', upscaleModel));

    // TAESD for faster decoding (--taesd)
    if (taesdModel) args.push('--taesd', path.join(MODELS_DIR, 'taesd', taesdModel));

    // Live preview during generation
    const previewPath = path.join(TEMP_DIR, 'preview.png');
    if (livePreviewMethod) {
        args.push('--preview', livePreviewMethod);
        args.push('--preview-path', previewPath);
        args.push('--preview-interval', '1');
    }

    // PhotoMaker parameters
    if (photoMaker) {
        args.push('--photo-maker', path.join(MODELS_DIR, 'photomaker', photoMaker));

        // ID Images directory (from uploaded files or gallery)
        if (pmImagesDir && fs.existsSync(pmImagesDir) && fs.readdirSync(pmImagesDir).length > 0) {
            args.push('--pm-id-images-dir', pmImagesDir);
        }

        // Style strength (0-100, default 20)
        if (pmStyleStrength) args.push('--pm-style-strength', String(pmStyleStrength));

        // ID Embeds path (for PhotoMaker V2)
        if (pmIdEmbedsPath) args.push('--pm-id-embed-path', pmIdEmbedsPath);
    }

    // ControlNet parameters
    if (controlNet) {
        args.push('--control-net', path.join(MODELS_DIR, 'controlnet', controlNet));

        if (controlImagePath && fs.existsSync(controlImagePath)) {
            args.push('--control-image', controlImagePath);
        }

        // Control strength (0.0-1.0, default 0.9)
        if (controlStrength) args.push('--control-strength', String(controlStrength));

        // Canny preprocessor (edge detection)
        if (applyCanny === true || applyCanny === 'true') args.push('--canny');
    }

    args.push('-v'); // Verbose

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${timestamp}] [CLI-GEN] Starting generation`);
    console.log(`[${timestamp}] [CLI-GEN] Command: ${getSdCliPath()}`);
    console.log(`[${timestamp}] [CLI-GEN] Args: ${args.join(' ')}`);
    console.log(`[${timestamp}] [CLI-GEN] Working directory: ${getActiveBackendPath()}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
        const activeBackend = getActiveBackendPath();
        cliProcess = spawn(getSdCliPath(), args, { 
            cwd: activeBackend,
            stdio: 'inherit'  // Direct output to terminal for proper formatting
        });

        let cancelled = false;

        await new Promise((resolve, reject) => {
            cliProcess.on('close', code => {
                const ts = new Date().toISOString().split('T')[1].split('.')[0];
                console.log(`\n${'='.repeat(80)}`);
                console.log(`[${ts}] [CLI-GEN] Process exited with code: ${code}`);
                console.log(`${'='.repeat(80)}\n`);
                cliProcess = null;
                if (code === 0) resolve();
                else if (code === null) {
                    cancelled = true;
                    resolve(); // Cancelled
                }
                else reject(new Error(`CLI exited with code ${code}`));
            });
            cliProcess.on('error', err => {
                const ts = new Date().toISOString().split('T')[1].split('.')[0];
                console.error(`[${ts}] [CLI-GEN] Process error:`, err);
                cliProcess = null;
                reject(err);
            });
        });

        // Cleanup PM temp directory
        if (pmImagesDir && fs.existsSync(pmImagesDir)) {
            try {
                fs.rmSync(pmImagesDir, { recursive: true, force: true });
            } catch (e) {
                console.error('Failed to cleanup PM temp dir:', e);
            }
        }

        // Cleanup Kontext temp directory
        if (req.kontextRefDir && fs.existsSync(req.kontextRefDir)) {
            try {
                fs.rmSync(req.kontextRefDir, { recursive: true, force: true });
            } catch (e) {
                console.error('Failed to cleanup Kontext temp dir:', e);
            }
        }

        if (cancelled) {
            res.json({ message: 'Cancelled' });
        } else if (fs.existsSync(outputPath)) {
            res.json({ message: 'Complete', filenames: [filename] });
        } else {
            res.status(500).json({ message: 'Generation failed - no output file' });
        }
    } catch (e) {
        cliProcess = null;
        console.error('CLI Gen Error:', e);

        // Cleanup PM temp directory on error
        if (pmImagesDir && fs.existsSync(pmImagesDir)) {
            try {
                fs.rmSync(pmImagesDir, { recursive: true, force: true });
            } catch (cleanupErr) {
                console.error('Failed to cleanup PM temp dir:', cleanupErr);
            }
        }

        // Cleanup Kontext temp directory on error
        if (req.kontextRefDir && fs.existsSync(req.kontextRefDir)) {
            try {
                fs.rmSync(req.kontextRefDir, { recursive: true, force: true });
            } catch (cleanupErr) {
                console.error('Failed to cleanup Kontext temp dir:', cleanupErr);
            }
        }

        res.status(500).json({ message: 'CLI generation failed', error: e.message });
    }
});

// Cancel CLI generation
app.post('/api/cancel-cli', (req, res) => {
    if (cliProcess) {
        console.log('[CLI] Cancelling...');
        cliProcess.kill('SIGTERM');
        res.json({ message: 'Cancelled' });
    } else {
        res.json({ message: 'No CLI process running' });
    }
});

// Get live preview image during generation
app.get('/api/preview-image', (req, res) => {
    const previewPath = path.join(TEMP_DIR, 'preview.png');
    if (fs.existsSync(previewPath)) {
        // Add cache-busting headers
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.sendFile(previewPath);
    } else {
        res.status(404).json({ message: 'No preview available' });
    }
});

// Model Conversion API
app.post('/api/convert', async (req, res) => {
    const { sourceType, sourceModel, outputFormat, outputName } = req.body;

    if (!sourceType || !sourceModel || !outputFormat || !outputName) {
        return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const sourcePath = path.join(MODELS_DIR, sourceType, sourceModel);
    const outputPath = path.join(MODELS_DIR, sourceType, outputName);

    if (!fs.existsSync(sourcePath)) {
        return res.status(400).json({ success: false, error: 'Source model not found' });
    }

    if (fs.existsSync(outputPath)) {
        return res.status(400).json({ success: false, error: 'Output file already exists' });
    }

    const sdCliPath = getSdCliPath();
    if (!fs.existsSync(sdCliPath)) {
        return res.status(500).json({ success: false, error: 'sd-cli not found. Configure backend first.' });
    }

    const args = ['-M', 'convert', '-m', sourcePath, '-o', outputPath, '--type', outputFormat, '-v'];

    console.log(`[CONVERT] Starting: ${sdCliPath} ${args.join(' ')}`);

    try {
        const { spawn } = require('child_process');
        const convertProcess = spawn(sdCliPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let output = '';

        convertProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log('[CONVERT]', data.toString().trim());
        });

        convertProcess.stderr.on('data', (data) => {
            output += data.toString();
            console.log('[CONVERT-ERR]', data.toString().trim());
        });

        convertProcess.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                console.log('[CONVERT] Success:', outputPath);
                res.json({ success: true, outputPath: outputName, output });
            } else {
                console.error('[CONVERT] Failed with code:', code);
                res.json({ success: false, error: `Conversion failed with code ${code}`, output });
            }
        });

        convertProcess.on('error', (err) => {
            console.error('[CONVERT] Process error:', err);
            res.status(500).json({ success: false, error: err.message });
        });
    } catch (e) {
        console.error('[CONVERT] Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================
// INPAINTING API
// ============================================

// Multer config for inpainting uploads
const inpaintStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => cb(null, `${file.fieldname}_${Date.now()}.png`)
});
const inpaintUpload = multer({ storage: inpaintStorage });

app.post('/api/inpaint', inpaintUpload.fields([
    { name: 'initImage', maxCount: 1 },
    { name: 'mask', maxCount: 1 }
]), async (req, res) => {
    const {
        prompt, negative_prompt, strength, steps, cfg_scale, guidance, seed,
        loadMode, diffusionModel, t5xxl, llm, clipL, clipG, vae,
        scheduler, samplingMethod, vaeTiling, clipOnCpu, offloadToCpu,
        initImagePath
    } = req.body;

    // Determine init image path
    let initImg = null;
    if (req.files && req.files.initImage && req.files.initImage[0]) {
        initImg = req.files.initImage[0].path;
    } else if (initImagePath) {
        // Use existing file from output directory
        initImg = path.join(OUTPUT_DIR, initImagePath);
    }

    if (!initImg || !fs.existsSync(initImg)) {
        return res.status(400).json({ message: 'Init image required' });
    }

    // Get mask path
    let maskPath = null;
    if (req.files && req.files.mask && req.files.mask[0]) {
        maskPath = req.files.mask[0].path;
    }

    const filename = `inpaint_${Date.now()}.png`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    // Build arguments for sd-cli
    const args = [];

    // Model loading based on mode
    if (loadMode === 'split') {
        if (diffusionModel) args.push('--diffusion-model', path.join(MODELS_DIR, 'diffusion', diffusionModel));
        if (clipL) args.push('--clip_l', path.join(MODELS_DIR, 'clip', clipL));
        if (clipG) args.push('--clip_g', path.join(MODELS_DIR, 'clip', clipG));
        if (t5xxl) args.push('--t5xxl', path.join(MODELS_DIR, 't5xxl', t5xxl));
        if (llm) args.push('--llm', path.join(MODELS_DIR, 'llm', llm));
        if (vae) args.push('--vae', path.join(MODELS_DIR, 'vae', vae));
    } else {
        if (diffusionModel) args.push('-m', path.join(MODELS_DIR, 'diffusion', diffusionModel));
        if (vae) args.push('--vae', path.join(MODELS_DIR, 'vae', vae));
    }

    // Init image (required for inpainting)
    args.push('-i', initImg);

    // Mask (optional - if provided, it's inpainting; if not, it's img2img)
    if (maskPath) {
        args.push('--mask', maskPath);
    }

    // Strength for img2img/inpainting
    const strengthVal = parseFloat(strength) || 0.75;
    args.push('--strength', String(strengthVal));

    // Generation parameters
    args.push('-p', prompt || '');
    if (negative_prompt) args.push('-n', negative_prompt);
    args.push('--steps', String(steps || 20));
    args.push('--cfg-scale', String(cfg_scale || 7));
    args.push('-s', String(seed || -1));
    args.push('-o', outputPath);

    // Optional parameters
    if (guidance) args.push('--guidance', String(guidance));
    if (scheduler) args.push('--scheduler', scheduler);
    if (samplingMethod) args.push('--sampling-method', samplingMethod);

    // Hardware flags
    if (vaeTiling === 'true' || vaeTiling === true) args.push('--vae-tiling');
    if (clipOnCpu === 'true' || clipOnCpu === true) args.push('--clip-on-cpu');
    if (offloadToCpu === 'true' || offloadToCpu === true) args.push('--offload-to-cpu');

    // LoRA directory - only add if prompt contains LoRA tags
    if (prompt && prompt.includes('<lora:')) {
        args.push('--lora-model-dir', path.join(MODELS_DIR, 'loras'));
    }

    args.push('-v'); // Verbose

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${timestamp}] [INPAINT] Starting inpainting`);
    console.log(`[${timestamp}] [INPAINT] Command: ${getSdCliPath()}`);
    console.log(`[${timestamp}] [INPAINT] Args: ${args.join(' ')}`);
    console.log(`[${timestamp}] [INPAINT] Working directory: ${getActiveBackendPath()}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
        const activeBackend = getActiveBackendPath();
        cliProcess = spawn(getSdCliPath(), args, { cwd: activeBackend });

        let output = '';
        let cancelled = false;

        cliProcess.stdout.on('data', d => {
            const msg = d.toString();
            process.stdout.write(msg);
            output += msg;
            serverLogs.push(msg);
        });
        
        cliProcess.stderr.on('data', d => {
            const msg = d.toString();
            process.stderr.write(msg);
            output += msg;
            serverLogs.push(msg);
        });

        await new Promise((resolve, reject) => {
            cliProcess.on('close', code => {
                const ts = new Date().toISOString().split('T')[1].split('.')[0];
                console.log(`\n${'='.repeat(80)}`);
                console.log(`[${ts}] [INPAINT] Process exited with code: ${code}`);
                console.log(`${'='.repeat(80)}\n`);
                cliProcess = null;
                if (code === 0) resolve();
                else if (code === null) {
                    cancelled = true;
                    resolve();
                }
                else reject(new Error(`CLI exited with code ${code}`));
            });
            cliProcess.on('error', err => {
                const ts = new Date().toISOString().split('T')[1].split('.')[0];
                console.error(`[${ts}] [INPAINT] Process error:`, err);
                cliProcess = null;
                reject(err);
            });
        });

        // Cleanup temp files
        if (req.files) {
            if (req.files.initImage && req.files.initImage[0]) {
                try { fs.unlinkSync(req.files.initImage[0].path); } catch (e) { }
            }
            if (req.files.mask && req.files.mask[0]) {
                try { fs.unlinkSync(req.files.mask[0].path); } catch (e) { }
            }
        }

        if (cancelled) {
            res.json({ message: 'Cancelled' });
        } else if (fs.existsSync(outputPath)) {
            res.json({ message: 'Complete', filenames: [filename] });
        } else {
            res.status(500).json({ message: 'Inpainting failed - no output file', output });
        }
    } catch (e) {
        cliProcess = null;
        console.error('Inpaint Error:', e);

        // Cleanup temp files on error
        if (req.files) {
            if (req.files.initImage && req.files.initImage[0]) {
                try { fs.unlinkSync(req.files.initImage[0].path); } catch (e) { }
            }
            if (req.files.mask && req.files.mask[0]) {
                try { fs.unlinkSync(req.files.mask[0].path); } catch (e) { }
            }
        }

        res.status(500).json({ message: 'Inpainting failed', error: e.message });
    }
});

// ============================================
// VIDEO GENERATION API
// ============================================

const videoUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, TEMP_DIR),
        filename: (req, file, cb) => cb(null, `video_init_${Date.now()}.png`)
    })
});

app.post('/api/generate-video', videoUpload.single('initImage'), async (req, res) => {
    const {
        prompt, negative_prompt, steps, cfg_scale, width, height, seed, guidance,
        diffusionModel, highNoiseDiffusionModel, t5xxl, vae, clipVision,
        scheduler, samplingMethod, videoFrames, flowShift,
        highNoiseCfg, highNoiseSteps, highNoiseSampler,
        diffusionFa, vaeTiling, clipOnCpu, offloadToCpu, quantizationType,
        initImagePath // For I2V from gallery
    } = req.body;

    const filename = `video_${Date.now()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    // Build arguments for sd-cli video generation
    const args = ['-M', 'vid_gen']; // Video generation mode

    // Diffusion model (required)
    if (diffusionModel) args.push('--diffusion-model', path.join(MODELS_DIR, 'diffusion', diffusionModel));

    // High noise diffusion model (for Wan2.2 A14B models)
    if (highNoiseDiffusionModel) args.push('--high-noise-diffusion-model', path.join(MODELS_DIR, 'diffusion', highNoiseDiffusionModel));

    // T5XXL (required for Wan)
    if (t5xxl) args.push('--t5xxl', path.join(MODELS_DIR, 't5xxl', t5xxl));

    // VAE (required)
    if (vae) args.push('--vae', path.join(MODELS_DIR, 'vae', vae));

    // CLIP Vision (for I2V models)
    if (clipVision) args.push('--clip_vision', path.join(MODELS_DIR, 'clip_vision', clipVision));

    // Init image for I2V
    let initImg = null;
    if (req.file) {
        initImg = req.file.path;
    } else if (initImagePath) {
        initImg = path.join(OUTPUT_DIR, initImagePath);
    }
    if (initImg && fs.existsSync(initImg)) {
        args.push('-i', initImg);
    }

    // Generation parameters
    args.push('-p', prompt || 'a beautiful scene');
    if (negative_prompt) args.push('-n', negative_prompt);
    args.push('--steps', String(steps || 20));
    args.push('--cfg-scale', String(cfg_scale || 6.0));
    args.push('-W', String(Math.round((width || 832) / 16) * 16));
    args.push('-H', String(Math.round((height || 480) / 16) * 16));
    args.push('-s', String(seed || -1));
    args.push('-o', outputPath);

    // Video-specific parameters
    args.push('--video-frames', String(videoFrames || 33));
    args.push('--flow-shift', String(flowShift || 3.0));

    // High noise parameters (for A14B models)
    if (highNoiseDiffusionModel) {
        if (highNoiseCfg) args.push('--high-noise-cfg-scale', String(highNoiseCfg));
        if (highNoiseSteps) args.push('--high-noise-steps', String(highNoiseSteps));
        if (highNoiseSampler) args.push('--high-noise-sampling-method', highNoiseSampler);
    }

    // Optional parameters
    if (guidance) args.push('--guidance', String(guidance));
    if (scheduler) args.push('--scheduler', scheduler);
    if (samplingMethod) args.push('--sampling-method', samplingMethod);

    // Hardware flags
    if (diffusionFa === 'true' || diffusionFa === true) args.push('--diffusion-fa');
    if (vaeTiling === 'true' || vaeTiling === true) args.push('--vae-tiling');
    if (clipOnCpu === 'true' || clipOnCpu === true) args.push('--clip-on-cpu');
    if (offloadToCpu === 'true' || offloadToCpu === true) args.push('--offload-to-cpu');

    // LoRA directory
    if (prompt && prompt.includes('<lora:')) {
        args.push('--lora-model-dir', path.join(MODELS_DIR, 'loras'));
    }

    // Quantization type (--type)
    if (quantizationType) args.push('--type', quantizationType);

    args.push('-v'); // Verbose

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${timestamp}] [VIDEO] Starting video generation`);
    console.log(`[${timestamp}] [VIDEO] Command: ${getSdCliPath()}`);
    console.log(`[${timestamp}] [VIDEO] Args: ${args.join(' ')}`);
    console.log(`[${timestamp}] [VIDEO] Working directory: ${getActiveBackendPath()}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
        const activeBackend = getActiveBackendPath();
        cliProcess = spawn(getSdCliPath(), args, { cwd: activeBackend });

        let output = '';
        let cancelled = false;

        cliProcess.stdout.on('data', d => {
            const msg = d.toString();
            process.stdout.write(msg);
            output += msg;
            serverLogs.push(msg);
        });
        
        cliProcess.stderr.on('data', d => {
            const msg = d.toString();
            process.stderr.write(msg);
            output += msg;
            serverLogs.push(msg);
        });

        await new Promise((resolve, reject) => {
            cliProcess.on('close', code => {
                const ts = new Date().toISOString().split('T')[1].split('.')[0];
                console.log(`\n${'='.repeat(80)}`);
                console.log(`[${ts}] [VIDEO] Process exited with code: ${code}`);
                console.log(`${'='.repeat(80)}\n`);
                cliProcess = null;
                if (code === 0) resolve();
                else if (code === null) {
                    cancelled = true;
                    resolve();
                }
                else reject(new Error(`CLI exited with code ${code}`));
            });
            cliProcess.on('error', err => {
                const ts = new Date().toISOString().split('T')[1].split('.')[0];
                console.error(`[${ts}] [VIDEO] Process error:`, err);
                cliProcess = null;
                reject(err);
            });
        });

        // Cleanup temp init image
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
        }

        if (cancelled) {
            res.json({ message: 'Cancelled' });
        } else if (fs.existsSync(outputPath)) {
            res.json({ message: 'Complete', filenames: [filename] });
        } else {
            res.status(500).json({ message: 'Video generation failed - no output file', output });
        }
    } catch (e) {
        cliProcess = null;
        console.error('Video Gen Error:', e);

        // Cleanup temp init image on error
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
        }

        res.status(500).json({ message: 'Video generation failed', error: e.message });
    }
});

// API: Gallery - list output images
app.get('/api/gallery', (req, res) => {
    try {
        if (!fs.existsSync(OUTPUT_DIR)) {
            return res.json([]);
        }
        const files = fs.readdirSync(OUTPUT_DIR)
            .filter(f => /\.(png|jpg|jpeg|webp|gif|mp4)$/i.test(f))
            .sort((a, b) => {
                const statA = fs.statSync(path.join(OUTPUT_DIR, a));
                const statB = fs.statSync(path.join(OUTPUT_DIR, b));
                return statB.mtime.getTime() - statA.mtime.getTime();
            });
        res.json(files);
    } catch (e) {
        console.error('Gallery error:', e);
        res.status(500).json({ error: e.message });
    }
});

// API: Server logs - expose CLI and server output for UI
app.get('/api/logs', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const limit = parseInt(req.query.limit) || 100;
    
    // Return logs with index for streaming
    const logs = serverLogs.slice(since, since + limit);
    res.json({
        logs: logs,
        total: serverLogs.length,
        hasMore: since + logs.length < serverLogs.length
    });
});

// API: Clear logs
app.post('/api/logs/clear', (req, res) => {
    serverLogs = [];
    res.json({ success: true });
});

// API: Network status
app.get('/api/network/status', (req, res) => {
    res.json(networkStatus);
});

// API: Toggle Ngrok
app.post('/api/network/ngrok', async (req, res) => {
    const { enabled, token } = req.body;
    try {
        if (enabled) {
            if (!ngrok) {
                return res.status(500).json({ error: 'Ngrok package not installed' });
            }
            const url = await startNgrok(server.address().port, token || process.env.NGROK_AUTHTOKEN);
            res.json({ success: true, url });
        } else {
            await stopNgrok();
            res.json({ success: true });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Toggle Cloudflare
app.post('/api/network/cloudflare', async (req, res) => {
    const { enabled } = req.body;
    try {
        if (enabled) {
            await startCloudflare(server.address().port);
            // Wait for URL to be detected
            setTimeout(() => {
                res.json({ success: true, url: networkStatus.cloudflare.url });
            }, 3000);
        } else {
            await stopCloudflare();
            res.json({ success: true });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/delete', (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ message: 'Filename required' });

        const p = path.join(OUTPUT_DIR, filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);

        res.json({ message: 'Deleted' });
    } catch (e) {
        res.status(500).json({ message: 'Delete failed', error: e.message });
    }
});

// Open folder in native file explorer (cross-platform)
app.post('/api/open-folder', (req, res) => {
    const { folder } = req.body;

    let folderPath;
    if (folder === 'models') {
        folderPath = MODELS_DIR;
    } else if (folder === 'output') {
        folderPath = OUTPUT_DIR;
    } else {
        return res.status(400).json({ success: false, error: 'Invalid folder' });
    }

    // Ensure the folder exists
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    // Resolve to absolute path to avoid relative path issues
    const absPath = path.resolve(folderPath);

    // Cross-platform open command
    const { exec } = require('child_process');
    let command;

    switch (process.platform) {
        case 'darwin': // macOS
            command = `open "${absPath}"`;
            break;
        case 'win32': // Windows
            command = `start "" "${absPath}"`;
            break;
        default: // Linux and others
            command = `xdg-open "${absPath}"`;
    }

    exec(command, (error) => {
        if (error) {
            console.error('Failed to open folder:', error);
            res.json({ success: false, error: error.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.get('/api/gallery', (req, res) => {
    try {
        if (!fs.existsSync(OUTPUT_DIR)) return res.json([]);
        const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.match(/\.(png|jpg|webp|mp4)$/));
        const sorted = files.map(f => ({
            name: f,
            time: fs.statSync(path.join(OUTPUT_DIR, f)).mtime.getTime()
        })).sort((a, b) => b.time - a.time).map(f => f.name);
        res.json(sorted);
    } catch (e) {
        console.error('Gallery Error:', e);
        res.json([]);
    }
});

// ============================================
// BACKEND BINARY MANAGEMENT APIs
// ============================================

// Helper to fetch JSON from URL
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'User-Agent': 'FlaxeoUI' }
        };
        https.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// Helper to download file
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'User-Agent': 'FlaxeoUi' }
        };

        const doDownload = (downloadUrl) => {
            https.get(downloadUrl, options, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return doDownload(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`Download failed: ${res.statusCode}`));
                }
                const file = createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(destPath);
                });
                file.on('error', (err) => {
                    fs.unlink(destPath, () => { });
                    reject(err);
                });
            }).on('error', reject);
        };

        doDownload(url);
    });
}

// Get available releases from GitHub
app.get('/api/backend/releases', async (req, res) => {
    try {
        // Return cached if fresh
        if (releasesCache && (Date.now() - releasesCacheTime) < CACHE_TTL) {
            return res.json(releasesCache);
        }

        const releases = await fetchJson(GITHUB_RELEASES_URL);

        // Process releases to extract useful info
        const processed = releases.slice(0, 10).map(release => ({
            tag: release.tag_name,
            name: release.name,
            published: release.published_at,
            assets: release.assets.map(a => ({
                name: a.name,
                size: a.size,
                url: a.browser_download_url
            })).filter(a => a.name.endsWith('.zip'))
        }));

        releasesCache = processed;
        releasesCacheTime = Date.now();
        res.json(processed);
    } catch (e) {
        console.error('Releases fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch releases' });
    }
});

// Helper to read PNG parameters from tEXt chunks
function readPngParams(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(1024 * 1024); // Read up to 1MB header/metadata
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);
        
        // PNG Magic
        if (buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
        
        let offset = 8;
        while (offset < bytesRead) {
            const length = buffer.readUInt32BE(offset);
            const type = buffer.toString('utf8', offset + 4, offset + 8);
            const dataOffset = offset + 8;
            
            if (type === 'tEXt') {
                // Keyword + null + Text
                let nullByteIndex = -1;
                for (let i = 0; i < length; i++) {
                    if (buffer[dataOffset + i] === 0) {
                        nullByteIndex = i;
                        break;
                    }
                }
                
                if (nullByteIndex > 0) {
                    const keyword = buffer.toString('utf8', dataOffset, dataOffset + nullByteIndex);
                    const text = buffer.toString('utf8', dataOffset + nullByteIndex + 1, dataOffset + length);
                    
                    if (keyword === 'parameters') {
                        return text;
                    }
                }
            }
            
            // Move to next chunk: Length + Type (4) + Data (length) + CRC (4)
            offset += 12 + length;
        }
    } catch (e) {
        console.error('Error reading PNG params:', e);
    }
    return null;
}

// Get image parameters
app.post('/api/image/params', (req, res) => {
    const { path: relativePath } = req.body;
    if (!relativePath) return res.status(400).json({ error: 'Path required' });
    
    // Resolve safe path
    const filePath = path.join(OUTPUT_DIR, relativePath);
    if (!filePath.startsWith(OUTPUT_DIR)) { // Simple jailbreak check
         return res.status(403).json({ error: 'Access denied' });
    }
    
    const paramsText = readPngParams(filePath);
    const result = {};
    
    if (paramsText) {
        // Parse "Prompt\nNegative prompt: ...\nSteps: 20, ..."
        const lines = paramsText.split('\n');
        
        // First line is usually prompt
        let prompt = lines[0];
        let negativePrompt = '';
        let otherParams = '';
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].startsWith('Negative prompt:')) {
                negativePrompt = lines[i].replace('Negative prompt:', '').trim();
            } else if (lines[i].startsWith('Steps:')) {
                otherParams = lines[i];
            } else if (!negativePrompt && !otherParams) {
                // Continuation of prompt?
                prompt += '\n' + lines[i];
            }
        }
        
        result.prompt = prompt.trim();
        result.negativePrompt = negativePrompt.trim();
        
        // Parse other params line: "Steps: 20, Sampler: Euler a, CFG scale: 7, Seed: 12345, Size: 512x512, ..."
        if (otherParams) {
            const pairs = otherParams.split(', ');
            pairs.forEach(p => {
                const [k, v] = p.split(': ');
                if (k === 'Steps') result.steps = parseInt(v);
                if (k === 'CFG scale') result.cfgScale = parseFloat(v);
                if (k === 'Seed') result.seed = parseInt(v);
                if (k === 'Size') {
                    const dims = v.split('x');
                    if (dims.length === 2) {
                        result.width = parseInt(dims[0]);
                        result.height = parseInt(dims[1]);
                    }
                }
                if (k === 'Sampler') result.sampler = v;
                if (k === 'Scheduler') result.scheduler = v;
                if (k === 'Model') result.diffusionModel = v;
            });
        }
    }
    
    res.json(result);
});

// Detect system info and recommend binary
app.get('/api/backend/detect', (req, res) => {
    const platform = process.platform; // linux, darwin, win32
    const arch = process.arch; // x64, arm64

    let recommendation = {
        platform,
        arch,
        variant: null,
        note: null
    };

    if (platform === 'linux') {
        recommendation.variant = 'Linux-Ubuntu';
        recommendation.note = 'The official Ubuntu build is CPU-only. For Vulkan/ROCm support on Linux, you need to compile from source and place the binaries in the backend/ folder.';
    } else if (platform === 'darwin') {
        recommendation.variant = 'Darwin-macOS';
        recommendation.note = 'macOS build uses Metal acceleration.';
    } else if (platform === 'win32') {
        // Try to detect GPU
        let gpuType = 'vulkan'; // Default fallback
        try {
            // Check for NVIDIA
            execSync('nvidia-smi', { stdio: 'ignore' });
            gpuType = 'cuda12';
            recommendation.note = 'NVIDIA GPU detected. Recommend CUDA 12 build.';
        } catch {
            try {
                // Check for AMD on Windows using PowerShell (wmic is deprecated)
                try {
            const psOutput = execSync('powershell -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { encoding: 'utf8', stdio: 'ignore' });
            if (psOutput.includes('Radeon') || psOutput.includes('AMD')) {
                gpuType = 'rocm';
                recommendation.note = 'AMD GPU detected. Recommend ROCM or Vulkan build.';
            } else if (psOutput.includes('NVIDIA') || psOutput.includes('GeForce') || psOutput.includes('Quadro')) {
                gpuType = 'cuda12';
                recommendation.note = 'NVIDIA GPU detected. Recommend CUDA 12 build.';
            } else {
                recommendation.note = 'Vulkan is recommended as universal fallback.';
            }
        } catch (e) {
            console.log('GPU detection failed (powershell not available)', e.message);
            recommendation.note = 'Could not detect GPU. Vulkan is recommended as universal fallback.';
        }
            } catch {
                recommendation.note = 'Could not detect GPU. Vulkan is recommended as universal fallback.';
            }
        }
        recommendation.variant = `win-${gpuType}-x64`;
    }

    res.json(recommendation);
});

// Get current backend config/status
app.get('/api/backend/config', (req, res) => {
    // Check if custom binaries exist
    const customServerExists = fs.existsSync(path.join(CUSTOM_DIR, 'sd-server')) ||
        fs.existsSync(path.join(CUSTOM_DIR, 'sd-server.exe'));
    const customCliExists = fs.existsSync(path.join(CUSTOM_DIR, 'sd-cli')) ||
        fs.existsSync(path.join(CUSTOM_DIR, 'sd-cli.exe'));
    const customBinaryExists = customServerExists && customCliExists;

    // Scan releases directory for installed versions
    let installedVersions = [];
    try {
        if (fs.existsSync(RELEASES_DIR)) {
            const dirs = fs.readdirSync(RELEASES_DIR, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);

            installedVersions = dirs.filter(dir => {
                const sdServer = fs.existsSync(path.join(RELEASES_DIR, dir, 'sd-server')) ||
                    fs.existsSync(path.join(RELEASES_DIR, dir, 'sd-server.exe'));
                const sdCli = fs.existsSync(path.join(RELEASES_DIR, dir, 'sd-cli')) ||
                    fs.existsSync(path.join(RELEASES_DIR, dir, 'sd-cli.exe'));
                return sdServer && sdCli;
            });
        }
    } catch (e) { console.error('Error scanning releases:', e); }

    // Check active backend
    const activeBackend = getActiveBackendPath();
    const activeServerExists = fs.existsSync(path.join(activeBackend, 'sd-server')) ||
        fs.existsSync(path.join(activeBackend, 'sd-server.exe'));
    const activeCliExists = fs.existsSync(path.join(activeBackend, 'sd-cli')) ||
        fs.existsSync(path.join(activeBackend, 'sd-cli.exe'));

    res.json({
        activeVersion: backendConfig.activeVersion,
        customBinaryExists,
        installedVersions,
        activeBackendPath: activeBackend,
        activeBackendValid: activeServerExists && activeCliExists,
        customDir: CUSTOM_DIR,
        releasesDir: RELEASES_DIR
    });
});

// Save backend config
app.post('/api/backend/config', (req, res) => {
    try {
        backendConfig = { ...backendConfig, ...req.body };
        saveBackendConfig(backendConfig);
        res.json({ success: true, config: backendConfig });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Download and install a release
app.post('/api/backend/download', async (req, res) => {
    const { url, variant, version } = req.body;

    if (!url || !version) {
        return res.status(400).json({ error: 'Download URL and version required' });
    }

    const versionDir = path.join(RELEASES_DIR, version);

    // Determine archive type from URL
    const isZip = url.endsWith('.zip');
    const isTarGz = url.endsWith('.tar.gz') || url.endsWith('.tgz');
    const archiveExt = isZip ? '.zip' : (isTarGz ? '.tar.gz' : '.zip');
    const archivePath = path.join(RELEASES_DIR, `download${archiveExt}`);

    try {
        console.log(`[Backend] Downloading ${version} (${variant}) from ${url}`);

        // Create version directory
        fs.mkdirSync(versionDir, { recursive: true });

        // Download the archive
        await downloadFile(url, archivePath);
        console.log('[Backend] Download complete, extracting...');

        // Extract using npm packages (cross-platform)
        if (isTarGz) {
            // Use tar package for .tar.gz files
            await tar.x({
                file: archivePath,
                cwd: versionDir,
                strip: 0 // Don't strip leading directory components
            });
        } else {
            // Use adm-zip for .zip files (works on all platforms)
            const zip = new AdmZip(archivePath);
            zip.extractAllTo(versionDir, true);
        }

        // Remove archive
        fs.unlinkSync(archivePath);

        // Set executable permissions on Linux/macOS
        if (process.platform !== 'win32') {
            const binaries = ['sd', 'sd-server', 'sd-cli'];
            binaries.forEach(bin => {
                const binPath = path.join(versionDir, bin);
                if (fs.existsSync(binPath)) {
                    fs.chmodSync(binPath, '755');
                }
            });
        }

        // Update config to use this version
        backendConfig.activeVersion = version;
        if (!backendConfig.installedVersions) backendConfig.installedVersions = [];
        if (!backendConfig.installedVersions.includes(version)) {
            backendConfig.installedVersions.push(version);
        }
        saveBackendConfig(backendConfig);

        console.log('[Backend] Installation complete');
        res.json({ success: true, version, path: versionDir });
    } catch (e) {
        console.error('[Backend] Download/install error:', e);
        // Clean up on error
        if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
        res.status(500).json({ error: e.message });
    }
});

// Mark as using custom binary
app.post('/api/backend/use-custom', (req, res) => {
    backendConfig.activeVersion = 'custom';
    saveBackendConfig(backendConfig);
    res.json({ success: true, activeVersion: 'custom' });
});

// Set active backend version
app.post('/api/backend/set-active', (req, res) => {
    const { version } = req.body;
    if (!version) {
        return res.status(400).json({ error: 'Version required' });
    }

    // Validate version exists
    if (version !== 'custom') {
        const versionPath = path.join(RELEASES_DIR, version);
        const sdServer = fs.existsSync(path.join(versionPath, 'sd-server')) ||
            fs.existsSync(path.join(versionPath, 'sd-server.exe'));
        if (!sdServer) {
            return res.status(400).json({ error: `Version ${version} not found` });
        }
    }

    backendConfig.activeVersion = version;
    saveBackendConfig(backendConfig);
    res.json({ success: true, activeVersion: version });
});

// --- Network Sharing Logic ---
let ngrokListener = null;
let cloudflareTunnel = null;
let networkStatus = {
    local: { enabled: hasFlag('--local'), url: null },
    ngrok: { enabled: false, url: null, error: null },
    cloudflare: { enabled: false, url: null, error: null }
};

function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results = [];

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    }
    return results.length > 0 ? results[0] : 'localhost';
}

async function startNgrok(port, authToken) {
    try {
        if (authToken) {
            await ngrok.authtoken(authToken);
        }
        ngrokListener = await ngrok.forward({ addr: port, authtoken: authToken });
        networkStatus.ngrok.enabled = true;
        networkStatus.ngrok.url = ngrokListener.url();
        networkStatus.ngrok.error = null;
        console.log(`[Ngrok] Tunnel active: ${networkStatus.ngrok.url}`);
        return networkStatus.ngrok.url;
    } catch (e) {
        console.error('[Ngrok] Failed to start:', e);
        networkStatus.ngrok.enabled = false;
        networkStatus.ngrok.url = null;
        networkStatus.ngrok.error = e.message;
        throw e;
    }
}

async function stopNgrok() {
    if (ngrokListener) {
        await ngrokListener.close();
        ngrokListener = null;
    }
    networkStatus.ngrok.enabled = false;
    networkStatus.ngrok.url = null;
}

async function startCloudflare(port) {
    try {
        // Use quick tunnel (trycloudflare)
        const { spawn } = require('child_process');

        if (!cloudflared) throw new Error('cloudflared module not loaded');
        const cloudflaredBin = cloudflared.bin;
        console.log('[Cloudflare] Binary path:', cloudflaredBin);

        // On Windows, need shell:true for proper execution
        cloudflareTunnel = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${port}`], {
            shell: process.platform === 'win32'
        });

        cloudflareTunnel.stderr.on('data', (data) => {
            const output = data.toString();
            console.log('[Cloudflare]', output);
            // Parse URL from output - handle potential ANSI codes or surrounding text
            const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
                networkStatus.cloudflare.url = match[0];
                networkStatus.cloudflare.enabled = true;
                networkStatus.cloudflare.error = null;
                console.log(`[Cloudflare] Tunnel active: ${networkStatus.cloudflare.url}`);
            }
        });

        cloudflareTunnel.on('error', (err) => {
            console.error('[Cloudflare] Process error:', err);
            networkStatus.cloudflare.error = err.message;
        });

        networkStatus.cloudflare.enabled = true; // Mark as enabling
    } catch (e) {
        console.error('[Cloudflare] Failed to start:', e);
        networkStatus.cloudflare.error = e.message;
        throw e;
    }
}

async function stopCloudflare() {
    if (cloudflareTunnel) {
        cloudflareTunnel.kill();
        cloudflareTunnel = null;
    }
    networkStatus.cloudflare.enabled = false;
    networkStatus.cloudflare.url = null;
}

// API Endpoints for Network
app.get('/api/network/status', (req, res) => {
    // Always update local URL with current IP and port
    const port = server ? server.address().port : PORT;
    networkStatus.local.url = `http://${getLocalIP()}:${port}`;

    res.json(networkStatus);
});

// Toggle local network access
app.post('/api/network/local', async (req, res) => {
    const { enabled } = req.body;
    try {
        networkStatus.local.enabled = enabled;
        const port = server ? server.address().port : PORT;
        if (enabled) {
            networkStatus.local.url = `http://${getLocalIP()}:${port}`;
        } else {
            networkStatus.local.url = null;
        }
        res.json({ success: true, enabled, url: networkStatus.local.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/network/toggle', async (req, res) => {
    const { service, action, token } = req.body; // action: 'start' | 'stop'
    const port = server.address().port;

    try {
        if (service === 'ngrok') {
            if (action === 'start') {
                if (!token && !process.env.NGROK_AUTHTOKEN) {
                    return res.status(400).json({ 
                        error: 'Ngrok requires an auth token. Get yours from https://dashboard.ngrok.com/get-started/your-authtoken' 
                    });
                }
                const url = await startNgrok(port, token || process.env.NGROK_AUTHTOKEN);
                res.json({ success: true, url });
            } else {
                await stopNgrok();
                res.json({ success: true });
            }
        } else if (service === 'cloudflare') {
            if (action === 'start') {
                await startCloudflare(port);
                // Wait a bit for URL to be generated (polling would be better in frontend)
                res.json({ success: true, message: 'Tunnel starting...' });
            } else {
                await stopCloudflare();
                res.json({ success: true });
            }
        } else {
            res.status(400).json({ error: 'Invalid service' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Dynamic port selection
const net = require('net');
let server; // Reference to http server

function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        // Force IPv4 binding which is more reliable in Wine/Cross-platform
        s.listen(startPort, '0.0.0.0', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
        s.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findAvailablePort(startPort + 1));
            } else {
                reject(err);
            }
        });
    });
}

// Start server
console.log('[Server] Initializing...');

// Keep-alive interval to prevent Node from exiting before server is ready
const keepAlive = setInterval(() => { }, 1000);

findAvailablePort(PORT).then(port => {
    server = app.listen(port, HOST, async () => {
        // Keep-alive interval continues to ensure process stays running

        const localIP = getLocalIP();
        const localURL = `http://${localIP}:${port}`;
        const localhostURL = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}`;

        console.log(`Web UI: ${localhostURL}`);
        if (HOST === '0.0.0.0') {
            console.log(`Local Network: ${localURL}`);
            networkStatus.local.url = localURL;
        }
        console.log(`[Server] Running on port: ${port}`); // Signal for Electron

        // Handle CLI flags for tunnels
        if (hasFlag('--ngrok')) {
            const token = process.env.NGROK_AUTHTOKEN;
            if (token) {
                console.log('[Ngrok] Starting tunnel...');
                await startNgrok(port, token);
            } else {
                console.warn('[Ngrok] No authtoken found in environment (NGROK_AUTHTOKEN). Tunnel not started.');
            }
        }
        if (hasFlag('--cloudflare')) {
            console.log('[Cloudflare] Starting tunnel...');
            await startCloudflare(port);
        }
    });
}).catch(err => {
    clearInterval(keepAlive);
    console.error('Failed to find available port:', err);
    process.exit(1);
});

// Cleanup on exit
// Cleanup on exit
const cleanup = async () => {
    console.log('[Server] Cleanup...');
    try {
        await stopNgrok();
    } catch (e) { console.error('Error stopping ngrok:', e); }

    try {
        await stopCloudflare();
    } catch (e) { console.error('Error stopping cloudflare:', e); }

    if (cliProcess) {
        console.log('[Server] Killing sd-cli process');
        try {
            cliProcess.kill();
        } catch (e) { console.error('Error killing sd-cli:', e); }
    }
    process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

