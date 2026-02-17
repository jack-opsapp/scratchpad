// Run with: node generate-icons.js
// Generates PNG icons for the Chrome extension
// Requires: npm install canvas (or use the generate.html file in a browser)

const fs = require('fs');

// Create minimal 1-pixel PNG files as placeholders
// For production, use the generate.html file to create proper icons

function createMinimalPNG(size) {
  // This creates a minimal valid PNG with a colored pixel
  // For proper icons, open generate.html in a browser and save the canvases
  const { createCanvas } = require('canvas');
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.15);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#d1b18f';
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.roundRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.12);
  ctx.stroke();

  // S letter
  ctx.fillStyle = '#d1b18f';
  ctx.font = `bold ${size * 0.55}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', size / 2, size / 2 + size * 0.02);

  return canvas.toBuffer('image/png');
}

try {
  [16, 48, 128].forEach(size => {
    const buf = createMinimalPNG(size);
    fs.writeFileSync(`icon${size}.png`, buf);
    console.log(`Created icon${size}.png`);
  });
} catch (e) {
  console.log('canvas module not available. Use generate.html in a browser instead.');
  console.log('Or create simple colored square PNGs manually.');
}
