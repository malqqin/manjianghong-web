// All exploration and flight sheets are horizontal strips of square cells.
// Derive source cells from the decoded texture, while keeping world units at 64.
export function spriteRegion(image, frame) {
  const cell = image.naturalHeight || image.height;
  const width = image.naturalWidth || image.width;
  const count = Math.max(1, Math.floor(width / cell));
  const index = Math.min(count - 1, Math.max(0, Math.floor(frame)));
  return [index * cell, 0, cell, cell];
}
