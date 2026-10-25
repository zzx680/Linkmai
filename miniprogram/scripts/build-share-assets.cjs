const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')

async function brandLogoDataUri(root) {
  const logo = await sharp(path.join(root, 'design/brand/linkmai-logo.svg'))
    .png()
    .trim()
    .toBuffer()
  return `data:image/png;base64,${logo.toString('base64')}`
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const out = path.join(root, 'src/assets/share')
  const logoUri = await brandLogoDataUri(root)
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800">
    <defs>
      <clipPath id="image"><rect width="1000" height="530"/></clipPath>
    </defs>
    <g clip-path="url(#image)">
      <rect width="1000" height="530" fill="#1358D8"/>
      <rect x="0" y="0" width="238" height="530" fill="#073B9D"/>
      <circle cx="155" cy="112" r="76" fill="#F4C542"/>
      <circle cx="155" cy="112" r="34" fill="#1358D8"/>
      <rect x="0" y="408" width="1000" height="122" fill="#0C2868"/>
      <g transform="translate(-80 420) rotate(-31)">
        <rect x="0" y="0" width="238" height="94" fill="#F7F5EF"/>
        <rect x="282" y="0" width="238" height="94" fill="#F7F5EF"/>
        <rect x="564" y="0" width="238" height="94" fill="#F7F5EF"/>
        <rect x="846" y="0" width="238" height="94" fill="#F7F5EF"/>
        <rect x="1128" y="0" width="238" height="94" fill="#F7F5EF"/>
      </g>
      <g transform="translate(704 58)">
        <rect x="70" y="0" width="22" height="408" fill="#111820"/>
        <rect x="0" y="0" width="162" height="330" fill="#111820"/>
        <rect x="17" y="17" width="128" height="296" fill="#F7F5EF"/>
        <rect x="28" y="28" width="106" height="274" fill="#111820"/>
        <circle cx="81" cy="79" r="38" fill="#E7473C"/>
        <circle cx="81" cy="165" r="38" fill="#F4C542"/>
        <circle cx="81" cy="251" r="38" fill="#27A86D"/>
      </g>
    </g>
    <rect y="530" width="1000" height="270" fill="#F9F9F6"/>
    <g font-family="'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif">
      <image x="72" y="586" width="340" height="92" href="${logoUri}" preserveAspectRatio="xMinYMid meet"/>
      <text x="72" y="745" font-size="56" font-weight="500" letter-spacing="2" fill="#273142">交通事故处理，每一步更清晰</text>
    </g>
  </svg>`

  await fs.mkdir(out, { recursive: true })
  await sharp(Buffer.from(card)).png({ palette: true, colours: 192 }).toFile(path.join(out, 'home-card.png'))
  await sharp(Buffer.from(card)).resize({ width: 750 }).png().toFile(path.join(root, 'design/share/preview.png'))
  console.log('Generated home-card.png (1000 × 800).')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
