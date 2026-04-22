const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

/**
 * Genera resources/splash.png a partir de public/logo.png (logo circular).
 * Fondo sólido #2563EB y logo centrado. Este PNG lo consume
 * `npx @capacitor/assets generate` para producir los assets de iOS/Android.
 */
async function generateSplash() {
  const SIZE = 2732;
  const BG_COLOR = '#2563EB';
  const LOGO_MAX = 800; // ~29% del lado

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Fondo sólido
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Logo centrado
  try {
    const logo = await loadImage('public/logo.png');
    const ratio = Math.min(LOGO_MAX / logo.width, LOGO_MAX / logo.height);
    const w = Math.round(logo.width * ratio);
    const h = Math.round(logo.height * ratio);
    const x = Math.round((SIZE - w) / 2);
    const y = Math.round((SIZE - h) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo, x, y, w, h);

    console.log(`📐 Logo: ${w}x${h} centrado en (${x}, ${y})`);
  } catch (error) {
    console.log('⚠️  public/logo.png no encontrado, splash sin logo');
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('resources/splash.png', buffer);
  console.log('✅ Generado: resources/splash.png');
}

generateSplash().catch(console.error);
