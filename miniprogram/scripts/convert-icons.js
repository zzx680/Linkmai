const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const iconsDir = path.join(__dirname, '../src/assets/icons')
const iconFiles = fs.readdirSync(iconsDir).filter(f => f.endsWith('.svg'))

async function convertIcons() {
  for (const file of iconFiles) {
    const svgPath = path.join(iconsDir, file)
    const pngPath = path.join(iconsDir, file.replace('.svg', '.png'))

    await sharp(svgPath)
      .resize(81, 81)
      .png()
      .toFile(pngPath)

    console.log(`✓ ${file} → ${file.replace('.svg', '.png')}`)
  }
}

convertIcons().then(() => {
  console.log('All icons converted!')
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
