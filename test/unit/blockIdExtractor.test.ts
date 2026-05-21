import * as assert from 'assert';

import { extractBlockIds } from '../../src/core/blocks/blockIdExtractor';

suite('blockIdExtractor (contract)', () => {
  test('paragraph suffix form: id resolves to its paragraph line', () => {
    assert.strictEqual(extractBlockIds('Para A. ^para-a').get('para-a')?.line, 0);
  });
  test('standalone form after list: id resolves to first line of the list', () => {
    assert.strictEqual(
      extractBlockIds('- item one\n- item two\n\n^list-id').get('list-id')?.line,
      0,
    );
  });
  test('standalone form after quote: id resolves to first line of the quote', () => {
    assert.strictEqual(extractBlockIds('> quoted line\n\n^quote-id').get('quote-id')?.line, 0);
  });
  test('block-ids inside fenced code are not registered', () => {
    assert.strictEqual(extractBlockIds('```\nfoo ^nope\n```').has('nope'), false);
  });
  test('# heading suffix is not a block-id target', () => {
    assert.strictEqual(extractBlockIds('# Title ^id').has('id'), false);
  });
  test('two independent ids in same document both register', () => {
    const m = extractBlockIds('Para one. ^one\n\nPara two. ^two');
    assert.strictEqual(m.get('one')?.line, 0);
    assert.strictEqual(m.get('two')?.line, 2);
  });
  test('standalone ^id after a paragraph (not a list/quote) does not register', () => {
    assert.strictEqual(extractBlockIds('Just a paragraph.\n\n^pid').has('pid'), false);
  });
  test('standalone ^id captures first line of a multi-line list', () => {
    const text = '- one\n- two\n- three\n\n^all';
    assert.strictEqual(extractBlockIds(text).get('all')?.line, 0);
  });
  test('standalone ^id captures first line of a multi-line quote', () => {
    const text = '> line one\n> line two\n\n^q';
    assert.strictEqual(extractBlockIds(text).get('q')?.line, 0);
  });
});
