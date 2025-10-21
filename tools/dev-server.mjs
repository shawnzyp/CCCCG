#!/usr/bin/env node
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mime from 'mime-types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '..');
const FALLBACK_FILE = 'index.html';

function parseOptions() {
  const options = {
    port: Number.parseInt(process.env.PORT ?? '', 10) || 4174,
    host: process.env.HOST ?? '127.0.0.1',
    root: process.env.CCCCG_SERVE_ROOT
      ? path.resolve(process.env.CCCCG_SERVE_ROOT)
      : defaultRoot,
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      options.port = Number.parseInt(args[i + 1], 10) || options.port;
      i += 1;
    } else if (arg.startsWith('--port=')) {
      options.port = Number.parseInt(arg.split('=')[1], 10) || options.port;
    } else if (arg === '--host' && args[i + 1]) {
      options.host = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--host=')) {
      options.host = arg.split('=')[1] ?? options.host;
    } else if (arg === '--root' && args[i + 1]) {
      options.root = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--root=')) {
      options.root = path.resolve(arg.split('=')[1] ?? options.root);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  const help = `Usage: node tools/dev-server.mjs [options]\n\n` +
    `Options:\n` +
    `  --port <number>   Port to listen on (default: 4174)\n` +
    `  --host <value>    Host interface to bind (default: 127.0.0.1)\n` +
    `  --root <path>     Directory to serve (default: repository root)\n` +
    `  -h, --help        Show this help message\n` +
    `\nEnvironment variables:\n` +
    `  PORT, HOST, CCCCG_SERVE_ROOT\n`;

  process.stdout.write(help);
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function resolveFile(requestPath, root) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch (error) {
    throw Object.assign(new Error('Bad Request'), { statusCode: 400 });
  }

  const segments = decodedPath.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..')) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  const normalized = path.normalize(decodedPath);
  const safeSegment = normalized.replace(/^\/+/, '');
  const filePath = path.resolve(root, safeSegment);

  if (!isPathInside(root, filePath) && filePath !== root) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  try {
    let fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      const directoryIndex = path.join(filePath, FALLBACK_FILE);
      fileStat = await stat(directoryIndex);
      return { filePath: directoryIndex, fileStat };
    }
    return { filePath, fileStat };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    const extension = path.extname(filePath);
    if (extension && extension !== '.html') {
      const notFound = new Error('Not Found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const fallbackPath = path.join(root, FALLBACK_FILE);
    try {
      await access(fallbackPath);
      const fallbackStat = await stat(fallbackPath);
      return { filePath: fallbackPath, fileStat: fallbackStat };
    } catch {
      const notFound = new Error('Not Found');
      notFound.statusCode = 404;
      throw notFound;
    }
  }
}

function handleError(res, error) {
  const status = error.statusCode ?? 500;
  const headers = error.headers ?? {};
  const message = error.statusCode === 404
    ? 'Not Found'
    : error.message || 'Internal Server Error';

  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(`${status} ${message}\n`);
}

function startServer({ host, port, root }) {
  const rootDir = path.resolve(root);

  const server = createServer(async (req, res) => {
    if (!req.url) {
      handleError(res, Object.assign(new Error('Bad Request'), { statusCode: 400 }));
      return;
    }

    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      const methodError = new Error('Method Not Allowed');
      methodError.statusCode = 405;
      methodError.headers = { Allow: 'GET, HEAD' };
      handleError(res, methodError);
      return;
    }

    let resolved;
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host ?? `${host}:${port}`}`);
      resolved = await resolveFile(requestUrl.pathname, rootDir);
    } catch (error) {
      handleError(res, error);
      return;
    }

    const { filePath, fileStat } = resolved;
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileStat.size);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');

    if (method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on('error', (error) => {
      handleError(res, error);
    });
    stream.pipe(res);
  });

  server.on('listening', () => {
    const address = server.address();
    if (address && typeof address === 'object') {
      console.log(`Serving ${rootDir} at http://${address.address}:${address.port}`);
    } else {
      console.log(`Serving ${rootDir}`);
    }
  });

  server.on('error', (error) => {
    console.error('Server error:', error);
    process.exitCode = 1;
  });

  server.listen(port, host);
}

const options = parseOptions();
startServer(options);
