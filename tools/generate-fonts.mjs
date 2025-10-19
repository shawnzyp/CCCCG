import fs from 'fs';
import path from 'path';
import ttf2woff2 from 'ttf2woff2';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'images');

const FONTS = [
  {
    input: 'CFTechnoMania-Slanted.ttf',
    output: 'CFTechnoMania-Slanted.woff2',
  },
  {
    input: 'Race Sport.ttf',
    output: 'Race Sport.woff2',
  },
];

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let updates = 0;

for (const { input, output } of FONTS) {
  const inputPath = path.join(ROOT, input);
  const outputPath = path.join(OUTPUT_DIR, output);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing source font: ${input}`);
  }

  const sourceBuffer = fs.readFileSync(inputPath);
  const woff2Buffer = Buffer.from(ttf2woff2(sourceBuffer));

  if (fs.existsSync(outputPath)) {
    const existingBuffer = fs.readFileSync(outputPath);
    if (existingBuffer.equals(woff2Buffer)) {
      console.log(`No changes for ${path.relative(ROOT, outputPath)}.`);
      continue;
    }
  }

  fs.writeFileSync(outputPath, woff2Buffer);
  updates += 1;
  console.log(`Wrote ${path.relative(ROOT, outputPath)} (${woff2Buffer.length} bytes).`);
}

if (updates === 0) {
  console.log('All WOFF2 fonts are already up to date.');
}
