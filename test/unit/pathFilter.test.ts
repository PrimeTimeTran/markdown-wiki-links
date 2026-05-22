import * as assert from 'assert';

import { isExcludedPath, buildExcludeGlob } from '../../src/core/pathFilter';

suite('pathFilter', () => {
  suite('isExcludedPath', () => {
    test('a path with an excluded folder segment is excluded', () => {
      assert.strictEqual(isExcludedPath('node_modules/pkg/readme.md', ['node_modules']), true);
    });
    test('an excluded folder anywhere in the path is excluded', () => {
      assert.strictEqual(isExcludedPath('a/b/.git/notes.md', ['.git']), true);
    });
    test('a path with no excluded segment is kept', () => {
      assert.strictEqual(isExcludedPath('docs/notes/page.md', ['node_modules', '.git']), false);
    });
    test('matches whole segments only, not substrings', () => {
      // "my-node_modules" must not be excluded by the "node_modules" rule.
      assert.strictEqual(isExcludedPath('my-node_modules/page.md', ['node_modules']), false);
    });
    test('handles Windows-style separators', () => {
      assert.strictEqual(isExcludedPath('a\\.svn\\page.md', ['.svn']), true);
    });
    test('empty exclude list excludes nothing', () => {
      assert.strictEqual(isExcludedPath('node_modules/page.md', []), false);
    });
  });

  suite('buildExcludeGlob', () => {
    test('single folder produces a simple glob', () => {
      assert.strictEqual(buildExcludeGlob(['node_modules']), '**/node_modules/**');
    });
    test('multiple folders produce a brace glob', () => {
      assert.strictEqual(
        buildExcludeGlob(['node_modules', '.git', '.svn']),
        '**/{node_modules,.git,.svn}/**',
      );
    });
    test('empty list produces undefined (no exclusion)', () => {
      assert.strictEqual(buildExcludeGlob([]), undefined);
    });
    test('blank entries are dropped', () => {
      assert.strictEqual(buildExcludeGlob(['', '  ', 'node_modules']), '**/node_modules/**');
    });
  });
});
