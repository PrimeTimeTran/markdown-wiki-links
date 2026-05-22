import * as assert from 'assert';

import { rankCompletions } from '../../src/core/completion/rankCompletions';
import { IndexSnapshot } from '../../src/core/resolver/resolveTarget';

function snap(paths: string[]): IndexSnapshot {
  return {
    workspaceRoot: '/root',
    entries: paths.map((p) => ({
      fsPath: p,
      relPath: p.replace(/^\/root\//, ''),
      baseNoExt: p
        .split('/')
        .pop()!
        .replace(/\.(md|markdown)$/, ''),
    })),
  };
}

suite('rankCompletions (logic paths)', () => {
  test('empty query returns all candidates (minus the source file)', () => {
    const s = snap(['/root/a.md', '/root/b.md', '/root/c.md']);
    const items = rankCompletions('', '/root/b.md', s);
    assert.deepStrictEqual(items.map((i) => i.label).sort(), ['a', 'c']);
  });

  test('prefix match filters by baseNoExt OR by relPath segment', () => {
    const s = snap(['/root/alpha.md', '/root/beta.md', '/root/notes/alpha-extra.md']);
    const items = rankCompletions('alpha', '/root/home.md', s);
    assert.deepStrictEqual(items.map((i) => i.fsPath).sort(), [
      '/root/alpha.md',
      '/root/notes/alpha-extra.md',
    ]);
  });

  test('unique base-name candidate uses bare insertText', () => {
    const s = snap(['/root/notes/unique.md']);
    const [item] = rankCompletions('uniq', '/root/home.md', s);
    assert.strictEqual(item.insertText, 'unique');
  });

  test('ambiguous base-name candidates use uniquely-resolving suffix insertText', () => {
    const s = snap(['/root/a/1/note.md', '/root/a/2/note.md', '/root/b/1/note.md']);
    const items = rankCompletions('note', '/root/home.md', s);
    assert.deepStrictEqual(items.map((i) => i.insertText).sort(), [
      'a/1/note',
      'a/2/note',
      'b/1/note',
    ]);
  });

  test('workspace-root candidate gets bare insertText even when its base is otherwise ambiguous', () => {
    const s = snap(['/root/note.md', '/root/a/note.md', '/root/b/note.md']);
    const items = rankCompletions('note', '/root/home.md', s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.insertText]));
    assert.strictEqual(byFs.get('/root/note.md'), 'note', 'root-level entry uses bare form');
    assert.strictEqual(byFs.get('/root/a/note.md'), 'a/note', 'sibling entry uses slashed form');
    assert.strictEqual(byFs.get('/root/b/note.md'), 'b/note', 'sibling entry uses slashed form');
  });

  test('ranking: closer common ancestor with source comes first', () => {
    const s = snap([
      '/root/a/1/note.md',
      '/root/a/2/note.md',
      '/root/b/1/note.md',
      '/root/b/sibling.md',
    ]);
    const items = rankCompletions('', '/root/b/1/note.md', s);
    assert.strictEqual(
      items[0].label,
      'sibling',
      `sibling should rank first; order was: ${items.map((i) => i.label).join(', ')}`,
    );
  });

  test('source file is excluded from results', () => {
    const s = snap(['/root/me.md', '/root/other.md']);
    const items = rankCompletions('', '/root/me.md', s);
    assert.deepStrictEqual(
      items.map((i) => i.fsPath),
      ['/root/other.md'],
    );
  });

  test('an unambiguous name carries no description', () => {
    const s = snap(['/root/notes/alpha.md', '/root/beta.md']);
    const [item] = rankCompletions('alpha', '/root/home.md', s);
    assert.strictEqual(item.description, undefined);
  });

  test('duplicated names carry a folder description, file name omitted', () => {
    const s = snap(['/root/Inbox/README.md', '/root/Notes/README.md']);
    const items = rankCompletions('readme', '/root/home.md', s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.description]));
    assert.strictEqual(byFs.get('/root/Inbox/README.md'), 'Inbox/');
    assert.strictEqual(byFs.get('/root/Notes/README.md'), 'Notes/');
  });

  test('a workspace-root duplicate gets "/" as its folder description', () => {
    const s = snap(['/root/README.md', '/root/Inbox/README.md']);
    const items = rankCompletions('readme', '/root/home.md', s);
    const byFs = new Map(items.map((i) => [i.fsPath, i.description]));
    assert.strictEqual(byFs.get('/root/README.md'), '/');
    assert.strictEqual(byFs.get('/root/Inbox/README.md'), 'Inbox/');
  });

  test('a name duplicated in the workspace but unique among results stays plain', () => {
    // Two READMEs exist, but the query "inbox" matches only one via its path segment.
    const s = snap(['/root/Inbox/README.md', '/root/Notes/README.md']);
    const items = rankCompletions('inbox', '/root/home.md', s);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].description, undefined);
  });
});
