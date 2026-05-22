// Reads intrinsic pixel dimensions from common raster image headers. Pure: takes bytes, returns
// dimensions or undefined for unsupported or corrupt input.
export type ImageDimensions = { width: number; height: number };

export function imageSize(buf: Uint8Array): ImageDimensions | undefined {
  return pngSize(buf) ?? gifSize(buf) ?? jpegSize(buf);
}

function pngSize(b: Uint8Array): ImageDimensions | undefined {
  // 8-byte signature, then the IHDR chunk: 4 length + "IHDR" + width (4 BE) + height (4 BE).
  if (b.length < 24) return undefined;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((v, i) => b[i] === v)) return undefined;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return undefined;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function gifSize(b: Uint8Array): ImageDimensions | undefined {
  // "GIF" then a logical-screen descriptor with width/height as 2-byte little-endian values.
  if (b.length < 10) return undefined;
  if (String.fromCharCode(b[0], b[1], b[2]) !== 'GIF') return undefined;
  return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
}

function jpegSize(b: Uint8Array): ImageDimensions | undefined {
  // SOI (FFD8), then walk segment markers by length until a Start-Of-Frame segment.
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return undefined;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (isStartOfFrame(marker)) {
      return { width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return undefined;
    i += 2 + len;
  }
  return undefined;
}

function isStartOfFrame(marker: number): boolean {
  // SOF0..SOF15, excluding the non-frame markers DHT (C4), JPG (C8) and DAC (CC).
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function u32be(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}
