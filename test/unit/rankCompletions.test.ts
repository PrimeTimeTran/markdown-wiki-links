import * as assert from 'assert';

import { rankCompletions } from '../../src/core/completion/rankCompletions';
import { IndexSnapshot, makeIndexEntry } from '../../src/core/resolver/resolveTarget';
import { np } from '../helpers/nativePath';

// Fixture paths are written POSIX-style and translated to native paths by np(), so these
// tests pin the same behavior on Windows and POSIX. See test/helpers/nativePath.ts.
// insertText and description values are wiki-link forms — always forward-slash — so those
// stay literal.
function snap(paths: string[]): IndexSnapshot {
  return {
    workspaceRoot: np('/root'),
    entries: paths.map((p) => makeIndexEntry(np(p), np('/root'))),
  };
}

suite('rankCompletions (logic paths)', () => {
  test('empty query returns all candidates (minus the source file)', () => {
    const s = snap(['/root/a.md', '/root/b.md', '/root/c.md']);
    const items = rankCompletions('', np('/root/b.md'), s);
    assert.deepStrictEqual(items.map((i) => i.label).sort(), ['a', 'c']);
  });

  test('prefix match filters by baseNoExt OR by relPath segment', () => {
    const s = snap(['/root/alpha.md', '/root/beta.md', '/root/notes/alpha-extra.md']);
    const items = rankCompletions('alpha', np('/root/home.md'), s);
    assert.deepStrictEqual(items.map((i) => i.fsPath).sort(), [
      np('/root/alpha.md'),
      np('/root/notes/alpha-extra.md'),
    ]);
  });

  test('unique base-name candidate uses bare insertText', () => {
    const s = snap(['/root/notes/unique.md']);
    const [item] = rankCompletions('uniq', np('/root/home.md'), s);
    assert.strictEqual(item.insertText, 'unique');
  });

  test('ambiguous base-name candidates use the shortest uniquely-resolving suffix', () => {
    const s = snap(['/root/a/1/note.md', '/root/a/2/note.md', '/root/b/1/note.md']);
    const items = rankCompletions('note', np('/root/home.md'), s);
    // `2/note` already resolves uniquely (only one file ends with it) so it stays short;
    // `1/note` is shared by two files, so those need the full `a/1/note` / `b/1/note`.
    assert.deepStrictEqual(items.map((i) => i.insertText).sort(), [
      '2/note',
      'a/1/note',
      'b/1/note',
    ]);
  });

  test('insertText is the closest parent, not the full path from the workspace root', () => {
    // Two files share the deep prefix "Inbox/wiki-links tests/"; `subN/dup-topic` resolves
    // uniquely, so the prefix must not appear in the inserted text.
    const s = snap([
      '/root/Inbox/wiki-links tests/sub1/dup-topic.md',
      '/root/Inbox/wiki-links tests/sub2/dup-topic.md',
    ]);
    const items = rankCompletions('dup', np('/root/home.md'), s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.insertText]));
    assert.strictEqual(
      byFs.get(np('/root/Inbox/wiki-links tests/sub1/dup-topic.md')),
      'sub1/dup-topic',
    );
    assert.strictEqual(
      byFs.get(np('/root/Inbox/wiki-links tests/sub2/dup-topic.md')),
      'sub2/dup-topic',
    );
  });

  test('insertText falls back to the full path when no suffix can resolve uniquely', () => {
    // dup.md and dup.markdown in the same folder share every path suffix (`dup`, `x/dup`),
    // so no candidate resolves uniquely — chooseInsertText returns the full relative path.
    const s = snap(['/root/x/dup.md', '/root/x/dup.markdown']);
    const items = rankCompletions('dup', np('/root/home.md'), s);
    for (const item of items) {
      assert.strictEqual(
        item.insertText,
        'x/dup',
        `expected full-path fallback, got ${item.insertText}`,
      );
    }
  });

  test('workspace-root candidate gets bare insertText even when its base is otherwise ambiguous', () => {
    const s = snap(['/root/note.md', '/root/a/note.md', '/root/b/note.md']);
    const items = rankCompletions('note', np('/root/home.md'), s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.insertText]));
    assert.strictEqual(byFs.get(np('/root/note.md')), 'note', 'root-level entry uses bare form');
    assert.strictEqual(
      byFs.get(np('/root/a/note.md')),
      'a/note',
      'sibling entry uses slashed form',
    );
    assert.strictEqual(
      byFs.get(np('/root/b/note.md')),
      'b/note',
      'sibling entry uses slashed form',
    );
  });

  test('ranking: closer common ancestor with source comes first', () => {
    const s = snap([
      '/root/a/1/note.md',
      '/root/a/2/note.md',
      '/root/b/1/note.md',
      '/root/b/sibling.md',
    ]);
    const items = rankCompletions('', np('/root/b/1/note.md'), s);
    assert.strictEqual(
      items[0].label,
      'sibling',
      `sibling should rank first; order was: ${items.map((i) => i.label).join(', ')}`,
    );
  });

  test('source file is excluded from results', () => {
    const s = snap(['/root/me.md', '/root/other.md']);
    const items = rankCompletions('', np('/root/me.md'), s);
    assert.deepStrictEqual(
      items.map((i) => i.fsPath),
      [np('/root/other.md')],
    );
  });

  test('an unambiguous name carries no description', () => {
    const s = snap(['/root/notes/alpha.md', '/root/beta.md']);
    const [item] = rankCompletions('alpha', np('/root/home.md'), s);
    assert.strictEqual(item.description, undefined);
  });

  test('duplicated names carry a folder description, file name omitted', () => {
    const s = snap(['/root/Inbox/README.md', '/root/Notes/README.md']);
    const items = rankCompletions('readme', np('/root/home.md'), s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.description]));
    assert.strictEqual(byFs.get(np('/root/Inbox/README.md')), 'Inbox/');
    assert.strictEqual(byFs.get(np('/root/Notes/README.md')), 'Notes/');
  });

  test('a workspace-root duplicate gets "/" as its folder description', () => {
    const s = snap(['/root/README.md', '/root/Inbox/README.md']);
    const items = rankCompletions('readme', np('/root/home.md'), s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.description]));
    assert.strictEqual(byFs.get(np('/root/README.md')), '/');
    assert.strictEqual(byFs.get(np('/root/Inbox/README.md')), 'Inbox/');
  });

  test('a name duplicated in the workspace but unique among results stays plain', () => {
    // Two READMEs exist, but the query "inbox" matches only one via its path segment.
    const s = snap(['/root/Inbox/README.md', '/root/Notes/README.md']);
    const items = rankCompletions('inbox', np('/root/home.md'), s);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].description, undefined);
  });

  test('description shows only the closest distinguishing parent, not the shared prefix', () => {
    // Both files sit under "Inbox/wiki-links tests/" — that shared prefix must be dropped,
    // leaving just sub1/ and sub2/.
    const s = snap([
      '/root/Inbox/wiki-links tests/sub1/dup-topic.md',
      '/root/Inbox/wiki-links tests/sub2/dup-topic.md',
    ]);
    const items = rankCompletions('dup', np('/root/home.md'), s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.description]));
    assert.strictEqual(byFs.get(np('/root/Inbox/wiki-links tests/sub1/dup-topic.md')), 'sub1/');
    assert.strictEqual(byFs.get(np('/root/Inbox/wiki-links tests/sub2/dup-topic.md')), 'sub2/');
  });

  test('description deepens to two segments when the immediate parents also collide', () => {
    // Immediate parent "x" is shared, so one segment is not enough — show a/x and b/x.
    const s = snap(['/root/a/x/note.md', '/root/b/x/note.md']);
    const items = rankCompletions('note', np('/root/home.md'), s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.description]));
    assert.strictEqual(byFs.get(np('/root/a/x/note.md')), 'a/x/');
    assert.strictEqual(byFs.get(np('/root/b/x/note.md')), 'b/x/');
  });
});
