import * as assert from 'assert';

import { buildFenceMask, isMasked } from '../../src/core/fenceMask';

suite('fenceMask', () => {
  test('marks triple-backtick blocks', () => {
    const text = 'a\n```\n[[no]]\n```\nb [[yes]] c';
    const m = buildFenceMask(text);
    assert.strictEqual(isMasked(m, text.indexOf('[[no]]')), true);
    assert.strictEqual(isMasked(m, text.indexOf('[[yes]]')), false);
  });
  test('marks inline code', () => {
    const text = 'see `[[hidden]]` and [[shown]]';
    const m = buildFenceMask(text);
    assert.strictEqual(isMasked(m, text.indexOf('[[hidden]]')), true);
    assert.strictEqual(isMasked(m, text.indexOf('[[shown]]')), false);
  });
  test('marks tilde fences', () => {
    const text = '~~~\n[[x]]\n~~~';
    const m = buildFenceMask(text);
    assert.strictEqual(isMasked(m, text.indexOf('[[x]]')), true);
  });
});
