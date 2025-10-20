import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'images', 'b02fb7b3-095b-4e40-9e4e-20fb5ee3b4b9.mov');
const OUTPUT_DIR = path.join(ROOT, 'media');
const OUTPUTS = [
  {
    file: path.join(OUTPUT_DIR, 'launch-animation.webm'),
    args: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-an'],
  },
  {
    file: path.join(OUTPUT_DIR, 'launch-animation.mp4'),
    args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-movflags', 'faststart', '-an'],
  },
];

async function checkFfmpeg() {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', reject);
    proc.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error('ffmpeg exited with non-zero status'));
    });
  });
}

async function runFfmpeg(args, outputFile) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', '-i', SOURCE, ...args, outputFile], { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with status ${code} for ${path.basename(outputFile)}`));
    });
  });
}

async function transcodeLaunchAnimation() {
  try {
    await fs.access(SOURCE);
  } catch (err) {
    throw new Error(`Source launch animation not found at ${path.relative(ROOT, SOURCE)}`);
  }

  let ffmpegAvailable = true;
  try {
    await checkFfmpeg();
  } catch (err) {
    ffmpegAvailable = false;
    const details = err && err.message ? ` (${err.message})` : '';
    console.warn(`ffmpeg not available, skipping launch animation transcoding${details}`);
  }

  if (!ffmpegAvailable) {
    const fallbackMp4 = OUTPUTS.find(({ file }) => path.extname(file).toLowerCase() === '.mp4');
    if (fallbackMp4) {
      try {
        await fs.mkdir(path.dirname(fallbackMp4.file), { recursive: true });
        await fs.copyFile(SOURCE, fallbackMp4.file);
        console.warn(`Copied source animation to ${path.relative(ROOT, fallbackMp4.file)} as a fallback.`);
      } catch (copyErr) {
        console.warn(`Failed to create fallback launch animation copy: ${copyErr.message}`);
      }
    }
    return;
  }

  for (const { file, args } of OUTPUTS) {
    await runFfmpeg(args, file);
    console.log(`Created ${path.relative(ROOT, file)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === CURRENT_FILE) {
  transcodeLaunchAnimation().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

export { transcodeLaunchAnimation };
