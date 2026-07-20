import * as assert from 'assert';

import { computeLineStarts, positionAt } from '../../src/core/textPosition';

suite('textPosition', () => {
  test('offset 0 is line 0, character 0', () => {
    const starts = computeLineStarts('hello');
    assert.deepStrictEqual(positionAt(starts, 0), { line: 0, character: 0 });
  });

  test('mid-line offset on the first line', () => {
    const starts = computeLineStarts('hello world');
    assert.deepStrictEqual(positionAt(starts, 6), { line: 0, character: 6 });
  });

  test('LF: offset right after a newline starts the next line', () => {
    const text = 'ab\ncd\nef';
    const starts = computeLineStarts(text);
    assert.deepStrictEqual(positionAt(starts, 3), { line: 1, character: 0 });
    assert.deepStrictEqual(positionAt(starts, 7), { line: 2, character: 1 });
  });

  test('CRLF: character offsets on later lines match VSCode line/character semantics', () => {
    // "See [[old]]" starts at offset 12 on line 2; the [[ is at character 4.
    const text = 'ab\r\ncd\r\nSee [[old]]';
    const starts = computeLineStarts(text);
    assert.deepStrictEqual(positionAt(starts, 12), { line: 2, character: 4 });
  });

  test('lone \\r (classic Mac) is a line break, matching VSCode text-buffer semantics', () => {
    const text = 'ab\rSee [[old]]';
    const starts = computeLineStarts(text);
    assert.deepStrictEqual(positionAt(starts, 3), { line: 1, character: 0 });
    assert.deepStrictEqual(positionAt(starts, 7), { line: 1, character: 4 });
  });

  test('\\r\\n still counts as a single line break after the lone-\\r rule', () => {
    const text = 'ab\r\ncd\ref\ngh';
    const starts = computeLineStarts(text);
    assert.deepStrictEqual(positionAt(starts, 4), { line: 1, character: 0 });
    assert.deepStrictEqual(positionAt(starts, 7), { line: 2, character: 0 });
    assert.deepStrictEqual(positionAt(starts, 10), { line: 3, character: 0 });
  });

  test('offset at end of text lands on the last line', () => {
    const text = 'ab\ncd';
    const starts = computeLineStarts(text);
    assert.deepStrictEqual(positionAt(starts, 5), { line: 1, character: 2 });
  });

  test('empty text: only offset 0 exists', () => {
    const starts = computeLineStarts('');
    assert.deepStrictEqual(positionAt(starts, 0), { line: 0, character: 0 });
  });

  test('many lines: binary search picks the correct middle line', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
    const text = lines.join('\n');
    const starts = computeLineStarts(text);
    // offset of "line42" start = sum of len("line0..41") + 42 newlines
    const offset = text.indexOf('line42');
    assert.deepStrictEqual(positionAt(starts, offset), { line: 42, character: 0 });
    assert.deepStrictEqual(positionAt(starts, offset + 3), { line: 42, character: 3 });
  });
});
