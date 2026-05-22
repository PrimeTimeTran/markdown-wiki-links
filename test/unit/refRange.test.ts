import * as assert from 'assert';

import { parseLinks } from '../../src/core/parser/linkParser';
import { parseEmbeds } from '../../src/core/parser/embedParser';
import { innerRange } from '../../src/core/parser/refRange';

suite('refRange.innerRange', () => {
  test('a link inner range excludes the [[ ]] brackets', () => {
    const src = 'see [[alpha|Bravo]] end';
    const [r] = parseLinks(src);
    const ir = innerRange(r);
    assert.strictEqual(src.slice(ir.start, ir.end), 'alpha|Bravo');
  });

  test('an embed inner range excludes the ![[ ]] brackets', () => {
    const src = '![[diagram.png|300]]';
    const [r] = parseEmbeds(src);
    const ir = innerRange(r);
    assert.strictEqual(src.slice(ir.start, ir.end), 'diagram.png|300');
  });

  test('a same-file fragment link inner range is the fragment', () => {
    const src = '[[#Local]]';
    const [r] = parseLinks(src);
    const ir = innerRange(r);
    assert.strictEqual(src.slice(ir.start, ir.end), '#Local');
  });
});
