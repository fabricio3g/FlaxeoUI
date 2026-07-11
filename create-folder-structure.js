const fs = require('fs')
const path = require('path')

/**
 * Creates empty folder structure by scanning directories and creating .gitkeep files
 * This preserves the directory structure without copying large model/binary files
 */

const dirsToProcess = ['models', 'backend', 'temp']
const outputDir = 'build-structure'

// Clean up and create output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true })
}
fs.mkdirSync(outputDir, { recursive: true })

console.log('Creating folder structures...')
for (const dir of dirsToProcess) {
  const sourceDir = path.join(__dirname, dir)
  const targetDir = path.join(__dirname, outputDir, dir)
  console.log(`Processing ${dir}...`)
  createFolderStructure(sourceDir, targetDir)
}

// Explicitly ensure standard model subfolders exist (with .gitkeep)
// This ensures they are present in the build even if missing locally
const modelSubdirs = [
  'diffusion',
  'vae',
  'llm',
  't5xxl',
  'clip',
  'clip_vision',
  'loras',
  'controlnet',
  'photomaker',
  'upscale',
  'taesd',
  'embeddings'
]

const modelsTargetRoot = path.join(__dirname, outputDir, 'models')
if (!fs.existsSync(modelsTargetRoot)) fs.mkdirSync(modelsTargetRoot, { recursive: true })

for (const subdir of modelSubdirs) {
  const targetSub = path.join(modelsTargetRoot, subdir)
  if (!fs.existsSync(targetSub)) {
    console.log(`Creating missing model folder: ${subdir}`)
    fs.mkdirSync(targetSub, { recursive: true })
  }
  // Ensure .gitkeep exists so electron-builder copies the directory
  const gitkeepPath = path.join(targetSub, '.gitkeep')
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '')
  }
}

function createFolderStructure(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    // If it's one of our core folders (like temp) that might not exist yet, creates it
    if (dirsToProcess.includes(path.basename(sourceDir))) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    return
  }

  // Create target directory
  fs.mkdirSync(targetDir, { recursive: true })

  // Read all items in the directory
  const items = fs.readdirSync(sourceDir, { withFileTypes: true })

  for (const item of items) {
    const sourcePath = path.join(sourceDir, item.name)
    const targetPath = path.join(targetDir, item.name)

    if (item.isDirectory()) {
      // Recursively create subdirectory structure
      createFolderStructure(sourcePath, targetPath)

      // Add .gitkeep to ensure empty folders are preserved
      const gitkeepPath = path.join(targetPath, '.gitkeep')
      if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '')
      }
    }
  }
}

console.log(`Folder structures created in ${outputDir}/`)
