import * as assert from 'assert';

import { stripFrontmatter } from '../../src/core/frontmatter';

suite('stripFrontmatter', () => {
  test('removes a leading YAML frontmatter block', () => {
    const text = '---\ntitle: X\ndescription: hi\n---\n# Heading\n\nbody';
    assert.strictEqual(stripFrontmatter(text), '# Heading\n\nbody');
  });
  test('leaves a document with no frontmatter unchanged', () => {
    const text = '# Heading\n\nbody';
    assert.strictEqual(stripFrontmatter(text), text);
  });
  test('does not strip a `---` thematic break that is not at the start', () => {
    const text = 'intro\n\n---\n\nmore';
    assert.strictEqual(stripFrontmatter(text), text);
  });
  test('requires a closing --- (unterminated block is left intact)', () => {
    const text = '---\ntitle: X\n# Heading';
    assert.strictEqual(stripFrontmatter(text), text);
  });
  test('handles frontmatter immediately followed by end of file', () => {
    assert.strictEqual(stripFrontmatter('---\ntitle: X\n---\n'), '');
  });
});
