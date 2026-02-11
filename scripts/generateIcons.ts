/**
 * Generate PWA icons from SVG.
 * Uses sharp for PNG generation.
 *
 * Run: npm run generate-icons
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// oXide favicon SVG (matching index.html)
const createSvg = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#ff00ff"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="12" fill="#0a0a0a"/>
  <text x="50" y="68" font-family="Arial Black,sans-serif" font-size="52" font-weight="900" fill="url(#g)" text-anchor="middle">oX</text>
  <rect x="8" y="8" width="84" height="84" rx="8" fill="none" stroke="url(#g)" stroke-width="2"/>
</svg>`;

async function generateIcons() {
  try {
    // Try to use sharp if available
    const sharp = await import('sharp').catch(() => null);

    if (sharp) {
      console.log('Using sharp to generate PNG icons...');

      // Generate 192x192 icon
      const svg192 = Buffer.from(createSvg(192));
      await sharp.default(svg192)
        .resize(192, 192)
        .png()
        .toFile(join(publicDir, 'icon-192.png'));
      console.log('✓ Created icon-192.png');

      // Generate 512x512 icon
      const svg512 = Buffer.from(createSvg(512));
      await sharp.default(svg512)
        .resize(512, 512)
        .png()
        .toFile(join(publicDir, 'icon-512.png'));
      console.log('✓ Created icon-512.png');

    } else {
      // Fallback: save as SVG (modern browsers support SVG in manifest)
      console.log('sharp not found. Creating SVG icons instead...');
      console.log('To create PNG icons, run: npm install -D sharp && npm run generate-icons');

      writeFileSync(join(publicDir, 'icon-192.svg'), createSvg(192));
      writeFileSync(join(publicDir, 'icon-512.svg'), createSvg(512));
      console.log('✓ Created SVG icons (update manifest.json to use .svg extension)');

      // Also create a simple fallback PNG using base64 encoded minimal icon
      // This is a 192x192 dark gray square with rounded corners
      console.log('\nAlternatively, install sharp: npm install -D sharp');
    }

    console.log('\n✅ Icon generation complete!');

  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
