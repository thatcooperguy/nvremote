/**
 * Generate all platform icons from SVG sources.
 *
 * Run: node generate-icons.mjs
 * Requires: npm install @resvg/resvg-js (dev dependency)
 *
 * Outputs:
 *   icon.png     - 1024x1024 PNG (electron-builder uses for Linux + generates icns)
 *   icon.ico     - Windows multi-size ICO (16,24,32,48,64,128,256)
 *   tray-icon.png - 32x32 tray icon
 *   tray-iconTemplate.png    - 22x22 macOS template (white on transparent)
 *   tray-iconTemplate@2x.png - 44x44 macOS template @2x
 */

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function renderSvgToPng(svgContent, width, height) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: width },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

function generateIcons() {
  const iconSvg = readFileSync(join(__dirname, 'icon.svg'), 'utf-8');
  const traySvg = readFileSync(join(__dirname, 'tray-icon.svg'), 'utf-8');

  // 1. Main icon PNG (1024x1024) — electron-builder uses this as source
  console.log('Generating icon.png (1024x1024)...');
  const iconPng = renderSvgToPng(iconSvg, 1024, 1024);
  writeFileSync(join(__dirname, 'icon.png'), iconPng);

  // 2. Generate individual PNGs for ICO
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = [];
  for (const size of icoSizes) {
    console.log(`  Generating ${size}x${size} for ICO...`);
    const buf = renderSvgToPng(iconSvg, size, size);
    icoBuffers.push(Buffer.from(buf));
  }

  // 3. Build ICO file manually
  console.log('Building icon.ico...');
  const icoBuffer = buildIco(icoBuffers);
  writeFileSync(join(__dirname, 'icon.ico'), icoBuffer);

  // 4. Tray icon (32x32 PNG)
  console.log('Generating tray-icon.png (32x32)...');
  const trayPng = renderSvgToPng(traySvg, 32, 32);
  writeFileSync(join(__dirname, 'tray-icon.png'), trayPng);

  // 5. macOS tray icon template (white on transparent, for Template image)
  console.log('Generating tray-iconTemplate.png (22x22)...');
  const trayWhiteSvg = traySvg.replace(/#76B900/g, '#FFFFFF');
  const trayTemplate = renderSvgToPng(trayWhiteSvg, 22, 22);
  writeFileSync(join(__dirname, 'tray-iconTemplate.png'), trayTemplate);

  // 6. @2x version for macOS Retina
  console.log('Generating tray-iconTemplate@2x.png (44x44)...');
  const trayTemplate2x = renderSvgToPng(trayWhiteSvg, 44, 44);
  writeFileSync(join(__dirname, 'tray-iconTemplate@2x.png'), trayTemplate2x);

  console.log('\nDone! Generated:');
  console.log('  build/icon.png          (1024x1024 — source for all platforms)');
  console.log('  build/icon.ico          (Windows multi-size ICO)');
  console.log('  build/tray-icon.png     (32x32 tray icon)');
  console.log('  build/tray-iconTemplate.png    (22x22 macOS template)');
  console.log('  build/tray-iconTemplate@2x.png (44x44 macOS template @2x)');
  console.log('\nNote: icon.icns is generated automatically by electron-builder from icon.png');
}

/**
 * Build a minimal ICO file from an array of PNG buffers.
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function buildIco(pngBuffers) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * numImages;
  let dataOffset = headerSize + dirSize;

  // ICO header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);     // Reserved
  header.writeUInt16LE(1, 2);     // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries
  const dirEntries = Buffer.alloc(dirSize);
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  let currentOffset = dataOffset;
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i];
    const pngBuf = pngBuffers[i];
    const offset = i * dirEntrySize;

    dirEntries.writeUInt8(size >= 256 ? 0 : size, offset);     // Width (0 = 256)
    dirEntries.writeUInt8(size >= 256 ? 0 : size, offset + 1); // Height (0 = 256)
    dirEntries.writeUInt8(0, offset + 2);     // Color palette
    dirEntries.writeUInt8(0, offset + 3);     // Reserved
    dirEntries.writeUInt16LE(1, offset + 4);  // Color planes
    dirEntries.writeUInt16LE(32, offset + 6); // Bits per pixel
    dirEntries.writeUInt32LE(pngBuf.length, offset + 8);  // Image size
    dirEntries.writeUInt32LE(currentOffset, offset + 12);  // Image offset

    currentOffset += pngBuf.length;
  }

  return Buffer.concat([header, dirEntries, ...pngBuffers]);
}

generateIcons();
