const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function generateSplash() {
  // Crear canvas de 2732x2732 (tamaño máximo para splash screens)
  const canvas = createCanvas(2732, 2732);
  const ctx = canvas.getContext('2d');

  // Crear degradado futurista
  const gradient = ctx.createLinearGradient(0, 0, 2732, 2732);
  gradient.addColorStop(0, '#0a0e27');
  gradient.addColorStop(0.5, '#1a1f3a');
  gradient.addColorStop(1, '#2d1b4e');

  // Fondo con degradado
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2732, 2732);

  // Efecto de luz radial en el centro
  const radialGradient = ctx.createRadialGradient(1366, 1366, 0, 1366, 1366, 800);
  radialGradient.addColorStop(0, 'rgba(74, 95, 217, 0.3)');
  radialGradient.addColorStop(1, 'rgba(45, 27, 78, 0)');
  ctx.fillStyle = radialGradient;
  ctx.fillRect(0, 0, 2732, 2732);

  // Círculos decorativos
  ctx.strokeStyle = 'rgba(74, 95, 217, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(1366, 1366, 500, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(107, 127, 217, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(1366, 1366, 600, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(139, 159, 217, 0.05)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(1366, 1366, 700, 0, 2 * Math.PI);
  ctx.stroke();

  // Cargar y dibujar el logo en el centro
  try {
    const logo = await loadImage('public/logo.png');

    // Hacer el logo más pequeño y mantener proporción (máximo 600x600)
    const maxSize = 600;
    let logoWidth = logo.width;
    let logoHeight = logo.height;

    // Siempre escalar el logo para que quepa bien
    const ratio = Math.min(maxSize / logoWidth, maxSize / logoHeight);
    logoWidth = Math.round(logoWidth * ratio);
    logoHeight = Math.round(logoHeight * ratio);

    // Centrar el logo perfectamente
    const x = Math.round((2732 - logoWidth) / 2);
    const y = Math.round((2732 - logoHeight) / 2);

    // Usar interpolación de mejor calidad para evitar distorsión
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(logo, x, y, logoWidth, logoHeight);

    console.log(`📐 Logo renderizado: ${logoWidth}x${logoHeight} en posición (${x}, ${y})`);
  } catch (error) {
    console.log('⚠️  Logo no encontrado, generando splash sin logo');
  }

  // Guardar la imagen
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('resources/splash.png', buffer);
  console.log('✅ Splash screen generada: resources/splash.png');
}

generateSplash().catch(console.error);
