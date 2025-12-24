const fs = require('fs');
const path = require('path');

/**
 * Creates empty folder structure by scanning directories and creating .gitkeep files
 * This preserves the directory structure without copying large model/binary files
 */

const dirsToProcess = ['models', 'backend'];
const outputDir = 'build-structure';

// Clean up and create output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir, { recursive: true });

function createFolderStructure(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    console.log(`Source directory ${sourceDir} does not exist, skipping...`);
    return;
  }

  // Create target directory
  fs.mkdirSync(targetDir, { recursive: true });
  
  // Read all items in the directory
  const items = fs.readdirSync(sourceDir, { withFileTypes: true });
  
  for (const item of items) {
    const sourcePath = path.join(sourceDir, item.name);
    const targetPath = path.join(targetDir, item.name);
    
    if (item.isDirectory()) {
      // Recursively create subdirectory structure (no files)
      createFolderStructure(sourcePath, targetPath);
    }
  }
}

console.log('Creating folder structures...');
for (const dir of dirsToProcess) {
  const sourceDir = path.join(__dirname, dir);
  const targetDir = path.join(__dirname, outputDir, dir);
  console.log(`Processing ${dir}...`);
  createFolderStructure(sourceDir, targetDir);
}

console.log(`Folder structures created in ${outputDir}/`);
