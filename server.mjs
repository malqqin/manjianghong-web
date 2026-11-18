import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2':'font/woff2', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost'), pathname = decodeURIComponent(url.pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part=>part.startsWith('.') || /^(key\.txt|node_modules|tmp)$/i.test(part)) || (await stat(filename)).isDirectory()) { response.writeHead(403); response.end('Forbidden'); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '0.0.0.0', () => {
  console.log(`\n满江红 · 铁骑红颜\n电脑打开：http://localhost:${port}\n`);
  for (const [name, interfaces] of Object.entries(os.networkInterfaces())) for (const address of interfaces || []) {
    if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.') && !/trust|vpn|virtual|vnic|loopback|蓝牙/i.test(name)) console.log(`手机连接相同网络后打开（${name}）：http://${address.address}:${port}`);
  }
  console.log('\n保持此窗口运行。按 Ctrl+C 结束。');
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `${port} 端口已被占用。尝试直接打开 http://localhost:${port}，或用 PORT 环境变量指定其他端口。` : error); process.exitCode = 1; });
