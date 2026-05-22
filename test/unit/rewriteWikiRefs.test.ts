import * as assert from 'assert';

import { rewriteWikiRefs } from '../../src/core/rename/rewriteWikiRefs';
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

function applyReplacements(
  src: string,
  edits: { start: number; end: number; newText: string }[],
): string {
  let out = src;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.newText + out.slice(e.end);
  }
  return out;
}

suite('rewriteWikiRefs (logic paths)', () => {
  test('bare → bare when new name is still unique', () => {
    const src = 'See [[old]] here.';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[new]] here.');
  });

  test('preserves display text on links', () => {
    const src = '[[old|Display]]';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[new|Display]]');
  });

  test('preserves fragment on links', () => {
    const src = '[[old#H]]';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[new#H]]');
  });

  test('preserves size hint on image-like embed targets', () => {
    const src = '![[old|300]]';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '![[new|300]]');
  });

  test('bare → bare even when post-rename name now collides', () => {
    const src = 'See [[old]].';
    const s = snap(['/root/old.md', '/root/notes/new.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[new]].');
  });

  test('bare → bare when post-rename name is still unique', () => {
    const src = 'See [[old]].';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[new]].');
  });

  test('relative target stays relative after rename', () => {
    const src = '[[notes/old]]';
    const s = snap(['/root/notes/old.md', '/root/other.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/notes/old.md', newFsPath: '/root/notes/new.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[notes/new]]');
  });

  test('no rewrite when nothing in the rename batch is referenced', () => {
    const src = '[[unrelated]]';
    const s = snap(['/root/unrelated.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('rename to an unsafe name (containing [ ] | # newline) is skipped, not inserted', () => {
    const src = 'See [[old]].';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/weird]name.md' }],
      s,
    );
    assert.deepStrictEqual(edits, [], 'no edits emitted for unsafe filename');
  });

  test('slashed rewrite is workspace-root-relative, never source-relative with ".."', () => {
    // Referring file in Inbox/, renamed target in the sibling Drafts/. A source-relative path
    // would be "../Drafts/README3", which the resolver rejects. It must be root-relative.
    const src = '![[Drafts/README]]';
    const s = snap(['/root/Drafts/README.md', '/root/Inbox/note.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/Inbox/home.md',
      [{ oldFsPath: '/root/Drafts/README.md', newFsPath: '/root/Drafts/README3.md' }],
      s,
    );
    const result = applyReplacements(src, edits);
    assert.strictEqual(result, '![[Drafts/README3]]');
    assert.ok(!result.includes('..'), `rewritten link must not contain "..": ${result}`);
  });

  test('renamed slashed target stays root-relative when source is deeply nested', () => {
    const src = '[[Drafts/README]]';
    const s = snap(['/root/Drafts/README.md', '/root/a/b/c/note.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/a/b/c/home.md',
      [{ oldFsPath: '/root/Drafts/README.md', newFsPath: '/root/Drafts/README3.md' }],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[Drafts/README3]]');
  });

  test('occurrences inside fenced code are not rewritten', () => {
    const src = 'normal [[old]]\n\n```\nsee [[old]] in fence\n```';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      '/root/home.md',
      [{ oldFsPath: '/root/old.md', newFsPath: '/root/new.md' }],
      s,
    );
    const result = applyReplacements(src, edits);
    assert.ok(result.includes('normal [[new]]'));
    assert.ok(result.includes('see [[old]] in fence'));
  });
});
