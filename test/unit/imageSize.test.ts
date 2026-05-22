import * as assert from 'assert';

import { imageSize } from '../../src/core/imageSize';

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  b.set([(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255], 16);
  b.set([(height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255], 20);
  return b;
}

function gif(width: number, height: number): Uint8Array {
  const b = new Uint8Array(10);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  b[6] = width & 255;
  b[7] = (width >>> 8) & 255;
  b[8] = height & 255;
  b[9] = (height >>> 8) & 255;
  return b;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI then a SOF0 segment carrying precision, height and width.
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >>> 8) & 255,
    height & 255,
    (width >>> 8) & 255,
    width & 255,
    0x03,
    0x00,
  ]);
}

suite('imageSize', () => {
  test('reads PNG dimensions from the IHDR chunk', () => {
    assert.deepStrictEqual(imageSize(png(800, 600)), { width: 800, height: 600 });
  });
  test('reads GIF dimensions from the little-endian screen descriptor', () => {
    assert.deepStrictEqual(imageSize(gif(300, 200)), { width: 300, height: 200 });
  });
  test('reads JPEG dimensions from the start-of-frame segment', () => {
    assert.deepStrictEqual(imageSize(jpeg(1024, 768)), { width: 1024, height: 768 });
  });
  test('returns undefined for non-image bytes', () => {
    assert.strictEqual(imageSize(new Uint8Array([1, 2, 3, 4, 5])), undefined);
  });
  test('returns undefined for an empty buffer', () => {
    assert.strictEqual(imageSize(new Uint8Array(0)), undefined);
  });
});
