import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'dist');
const precache = JSON.parse(await readFile(path.join(project, 'precache.json'), 'utf8'));
const files = new Set(['index.html', 'sw.js', 'precache.json', ...precache.map(file => file === './' ? 'index.html' : file)]);
// Cutscenes also load image names dynamically from the original event records.
const story = await readFile(path.join(project, 'assets/native-story.json'), 'utf8');
for (const image of new Set(story.match(/[A-Za-z0-9_/-]+\.png/g) || [])) {
  const file = 'assets/' + image.replace(/^\//, '');
  if (!files.has(file)) throw new Error(`Cutscene image is missing from precache.json: ${file}`);
}
let bytes = 0;
for (const file of files) {
  if (typeof file !== 'string' || path.isAbsolute(file) || file.includes('\\') || file.split('/').includes('..')) {
    throw new Error(`Invalid site path: ${file}`);
  }
  const source = path.join(project, file);
  const info = await stat(source);
  if (!info.isFile()) throw new Error(`Missing site file: ${file}`);
  const target = path.join(output, file);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  bytes += info.size;
}
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built ${files.size} runtime files (${(bytes / 1024 / 1024).toFixed(2)} MiB) in dist/`);
