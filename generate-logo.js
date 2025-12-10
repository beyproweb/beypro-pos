const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Beypro Logo SVG - light version
const logoSvg = `
<svg width="256" height="256" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0EA5E9" stop-opacity="1" />
      <stop offset="100%" stop-color="#6D28D9" stop-opacity="1" />
    </linearGradient>
    <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EC4899" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#6D28D9" stop-opacity="0.8" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect x="1" y="1" rx="10" ry="10" width="40" height="40" fill="#FFFFFF" />

  <!-- Spine (left vertical) -->
  <rect x="8" y="6" rx="3" ry="3" width="6" height="30" fill="#0EA5E9" opacity="0.95" />

  <!-- Upper loop -->
  <path d="M15 7 C22 7 28 10 28 16 C28 20 24 22 19 22 C16 22 15 21 15 21 Z" fill="url(#g1)" opacity="0.96" />

  <!-- Lower loop -->
  <path d="M15 22 C21 22 28 23 28 29 C28 33 24 35 19 35 C16 35 15 34 15 34 Z" fill="url(#g2)" opacity="0.96" />

  <!-- Accent dots -->
  <circle cx="33" cy="10" r="1.6" fill="#0EA5E9" opacity="0.96" />
  <circle cx="37" cy="16" r="1.2" fill="#EC4899" opacity="0.9" />
  <circle cx="34" cy="26" r="1" fill="#6D28D9" opacity="0.9" />
</svg>
`;

const outputDir = path.join(__dirname, 'public');
const outputPath = path.join(outputDir, 'beypro-logo.png');

// Ensure public dir exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Convert SVG to PNG
sharp(Buffer.from(logoSvg))
  .png()
  .toFile(outputPath)
  .then(() => {
    console.log(`✅ Beypro logo PNG created at: ${outputPath}`);
    console.log(`📎 Use this URL in the printer page: /beypro-logo.png`);
  })
  .catch((err) => {
    console.error('❌ Error generating logo:', err);
    process.exit(1);
  });
