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
  test('CRLF line endings do not shift fence intervals', () => {
    // Tilde fences, deliberately: backtick fences can be accidentally re-masked by the
    // inline-code pass pairing stray fence backticks, hiding a drifted line pass. Enough
    // preceding CRLF breaks that a per-line one-char undercount would push the fenced
    // link past the computed interval end.
    const prose = 'p\r\n'.repeat(20);
    const text = prose + '~~~\r\n[[in]]\r\n~~~\r\nout [[l2]]';
    const m = buildFenceMask(text);
    assert.strictEqual(isMasked(m, text.indexOf('[[in]]')), true, 'fenced link must be masked');
    assert.strictEqual(isMasked(m, text.indexOf('[[l2]]')), false, 'post-fence link must not be');
  });
  test('CRLF closing fence line is recognized despite its trailing carriage return', () => {
    const text = '~~~\r\n[[x]]\r\n~~~\r\ntail [[y]]';
    const m = buildFenceMask(text);
    assert.strictEqual(isMasked(m, text.indexOf('[[x]]')), true);
    assert.strictEqual(isMasked(m, text.indexOf('[[y]]')), false);
  });
});
