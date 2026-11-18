"""Restore existing AI masters into isolated battle cells; no generation or API calls.

The original BIN geometry defines each actor's foot anchor and weapon extents.
Rebuilding frames from assets/<actor>.png would silently restore the pixel art.
"""
import hashlib
import json
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / 'output/imagegen/full-20261117'
jobs = json.loads((BATCH / 'jobs.json').read_text(encoding='utf8'))['jobs']
battle = json.loads((ROOT / 'assets/battle.json').read_text(encoding='utf8'))
native = json.loads((ROOT / 'assets/native-combat.json').read_text(encoding='utf8'))['sprites']
report = {}

def occupied(image):
    return image.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()

def clean(image):
    # Ignore isolated dust and neighbouring-cell fragments at the outer border.
    alpha = image.getchannel('A')
    support = alpha.point(lambda a: 255 if a > 80 else 0).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.MaxFilter(5))
    image.putalpha(ImageChops.multiply(alpha, support))
    return image

def separate_poses(image, cols, rows):
    # Segment the whole master before dividing it. A polearm can cross the
    # reference grid, so cropping cells first both clips it and pollutes its neighbour.
    w, h = image.size
    pixels = bytearray(image.getchannel('A').point(lambda a: 255 if a > 16 else 0).tobytes())
    groups = [[] for _ in range(cols * rows)]
    for start in range(w * h):
        if not pixels[start]:
            continue
        queue = deque([start]); pixels[start] = 0; points = []; sx = sy = 0
        while queue:
            p = queue.popleft(); x, y = p % w, p // w
            points.append(p); sx += x; sy += y
            for q in ([p - 1] if x else []) + ([p + 1] if x < w - 1 else []) + ([p - w] if y else []) + ([p + w] if y < h - 1 else []):
                if pixels[q]: pixels[q] = 0; queue.append(q)
        if len(points) < 5:
            continue
        col = min(cols - 1, int(sx / len(points) * cols / w))
        row = min(rows - 1, int(sy / len(points) * rows / h))
        groups[row * cols + col].append(points)
    poses = []
    for group in groups:
        if not group:
            poses.append(None); continue
        largest = max(map(len, group)); mask = bytearray(w * h)
        for points in group:
            if len(points) < max(5, largest * .005): continue
            for p in points: mask[p] = 255
        support = Image.frombytes('L', (w, h), bytes(mask)).filter(ImageFilter.MaxFilter(3))
        result = image.copy(); result.putalpha(ImageChops.multiply(image.getchannel('A'), support))
        poses.append(result.crop(occupied(result)))
    return poses

for job in jobs:
    if job['kind'] != 'strip' or not job['id'].split('-', 1)[1].startswith('battle-'):
        continue
    name = job['id'].split('battle-', 1)[1]
    if name not in battle:
        continue
    master = BATCH / 'masters-v2' / (job['id'] + '.png')
    if not master.exists():
        master = BATCH / job['master']
    art = Image.open(master).convert('RGBA')
    old = Image.open(BATCH / 'backup' / job['paths'][0]).convert('RGBA')
    layout, meta = job['layout'], battle[name]
    poses = separate_poses(art, layout['cols'], layout['rows'])
    width, height = meta['cellWidth'], meta['cellHeight']
    origin_x, origin_y = meta['originX'], meta['originY']
    output = Image.new('RGBA', (width * 4 * meta['frames'], height * 4))
    for index in range(meta['frames']):
        tile = poses[index]
        box = occupied(tile) if tile else None
        if box is None:
            raise ValueError(f'{name}: empty AI frame {index}')
        if name in native:
            bounds = []
            for part, flags, x, y in native[name]['frames'][index]:
                _, _, w, h = native[name]['parts'][part]
                x -= w if flags & 1 else 0
                y -= h if flags & 2 else 0
                bounds.append((x, y, x + w, y + h))
            x, y = min(b[0] for b in bounds), min(b[1] for b in bounds)
            right, bottom = max(b[2] for b in bounds), max(b[3] for b in bounds)
        else:
            cell = layout['cell']
            old_box = occupied(old.crop((index * cell, 0, (index + 1) * cell, cell)))
            if old_box is None:
                continue
            x, y, right, bottom = old_box
            x -= 48; right -= 48; y -= 80; bottom -= 80
        fitted = tile.crop(box).resize(((right - x) * 4, (bottom - y) * 4), Image.Resampling.LANCZOS)
        output.alpha_composite(fitted, ((index * width + origin_x + x) * 4, (origin_y + y) * 4))
    destination = ROOT / 'assets/native' / ('battle-' + name + '.png')
    output.save(destination)
    meta['artwork'] = 'ai-redraw'
    report[name] = dict(kind='ai-redraw', master=str(master.relative_to(ROOT)), frames=meta['frames'], sha256=hashlib.sha256(destination.read_bytes()).hexdigest())

# Taimeng already had a dedicated derivative from the generated creature artwork.
processed = BATCH / 'processed/assets/native/battle-taimeng.png'
if processed.exists():
    destination = ROOT / 'assets/native/battle-taimeng.png'
    destination.write_bytes(processed.read_bytes())
    battle['taimeng']['artwork'] = 'ai-derivative'
    report['taimeng'] = dict(kind='ai-derivative', master=str(processed.relative_to(ROOT)), frames=battle['taimeng']['frames'], sha256=hashlib.sha256(destination.read_bytes()).hexdigest())

for name in battle:
    if name not in report:
        battle[name]['artwork'] = 'original-composite'
        report[name] = dict(kind='original-composite', source=native.get(name, {}).get('source'), frames=battle[name]['frames'])

(ROOT / 'assets/battle.json').write_text(json.dumps(battle, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
(ROOT / 'assets/battle-art.json').write_text(json.dumps(dict(actors=report), ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({kind: sum(v['kind'] == kind for v in report.values()) for kind in ['ai-redraw', 'ai-derivative', 'original-composite']}))
