import * as assert from 'assert';

import { parseLinks } from '../../src/core/parser/linkParser';

suite('linkParser (contract)', () => {
  test('plain link captures the target', () => {
    const [r] = parseLinks('see [[alpha]].');
    assert.strictEqual(r.target, 'alpha');
  });
  test('display segment is captured and does not contaminate target', () => {
    const [r] = parseLinks('[[alpha|Bravo]]');
    assert.strictEqual(r.target, 'alpha');
    assert.strictEqual(r.display, 'Bravo');
  });
  test('heading fragment is captured verbatim', () => {
    assert.strictEqual(parseLinks('[[alpha#Intro]]')[0].fragment, 'Intro');
  });
  test('block-id fragment preserves the caret prefix', () => {
    assert.strictEqual(parseLinks('[[alpha#^para-a]]')[0].fragment, '^para-a');
  });
  test('same-file fragment yields empty target + fragment', () => {
    const [r] = parseLinks('[[#Local]]');
    assert.strictEqual(r.target, '');
    assert.strictEqual(r.fragment, 'Local');
  });
  test('range slices source back to the original [[...]] substring', () => {
    const src = 'see [[alpha|Bravo]] and more';
    const [r] = parseLinks(src);
    assert.strictEqual(src.slice(r.range.start, r.range.end), '[[alpha|Bravo]]');
  });
  test('embeds are not returned as links', () => {
    assert.strictEqual(parseLinks('![[alpha]]').length, 0);
  });
  test('occurrences inside fenced code are excluded', () => {
    assert.strictEqual(parseLinks('```\n[[no]]\n```').length, 0);
  });
  test('occurrences inside inline code are excluded', () => {
    assert.strictEqual(parseLinks('`[[no]]` [[yes]]').length, 1);
  });
});
