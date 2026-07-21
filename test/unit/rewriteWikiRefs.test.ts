import * as assert from 'assert';

import { rewriteWikiRefs, buildRenameContext } from '../../src/core/rename/rewriteWikiRefs';
import { IndexSnapshot, makeIndexEntry } from '../../src/core/resolver/resolveTarget';
import { np } from '../helpers/nativePath';

// Fixture paths are written POSIX-style and translated to native paths by np(), so these
// tests pin the same behavior on Windows and POSIX. See test/helpers/nativePath.ts.
// The wiki-link text in `src` and in the expected results is always forward-slash — that is
// link syntax, not a filesystem path — so it stays literal.
function snap(paths: string[]): IndexSnapshot {
  return {
    workspaceRoot: np('/root'),
    entries: paths.map((p) => makeIndexEntry(np(p), np('/root'))),
  };
}

/** Rename pair from POSIX-style literals. */
function pair(oldPosix: string, newPosix: string) {
  return { oldFsPath: np(oldPosix), newFsPath: np(newPosix) };
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
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[new]] here.');
  });

  test('preserves display text on links', () => {
    const src = '[[old|Display]]';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[new|Display]]');
  });

  test('preserves fragment on links', () => {
    const src = '[[old#H]]';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[new#H]]');
  });

  test('preserves size hint on image-like embed targets', () => {
    const src = '![[old|300]]';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '![[new|300]]');
  });

  test('bare → bare even when post-rename name now collides', () => {
    const src = 'See [[old]].';
    const s = snap(['/root/old.md', '/root/notes/new.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[new]].');
  });

  test('bare → bare when post-rename name is still unique', () => {
    const src = 'See [[old]].';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[new]].');
  });

  test('relative target stays relative after rename', () => {
    const src = '[[notes/old]]';
    const s = snap(['/root/notes/old.md', '/root/other.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/notes/old.md', '/root/notes/new.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[notes/new]]');
  });

  test('same-file [[#fragment]] refs inside a renamed file are left untouched', () => {
    // A same-file link survives any rename of its own file by definition.
    const src = 'Jump to [[#Heading]].';
    const s = snap(['/root/moving/inner.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/moving/inner.md'),
      [pair('/root/moving/inner.md', '/root/moved/inner.md')],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('no edit is emitted when the rewritten text would be identical (folder move, bare link)', () => {
    // A folder move keeps base names, so bare links need no textual change — emitting
    // identical replacements would dirty every referrer and pollute undo stacks.
    const src = 'See [[inner]].';
    const s = snap(['/root/moving/inner.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/moving/inner.md', '/root/moved/inner.md')],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('no rewrite when nothing in the rename batch is referenced', () => {
    const src = '[[unrelated]]';
    const s = snap(['/root/unrelated.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('rename to an unsafe name (containing [ ] | # newline) is skipped, not inserted', () => {
    const src = 'See [[old]].';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/weird]name.md')],
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
      np('/root/Inbox/home.md'),
      [pair('/root/Drafts/README.md', '/root/Drafts/README3.md')],
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
      np('/root/a/b/c/home.md'),
      [pair('/root/Drafts/README.md', '/root/Drafts/README3.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '[[Drafts/README3]]');
  });

  test('renaming an image file rewrites both ![[...]] embeds and [[...]] links to it', () => {
    const src = 'Diagram: ![[diagram.png]] and a link [[diagram.png]].';
    const s = snap(['/root/diagram.png']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/diagram.png', '/root/chart.png')],
      s,
    );
    assert.strictEqual(
      applyReplacements(src, edits),
      'Diagram: ![[chart.png]] and a link [[chart.png]].',
    );
  });

  test('image rename preserves the embed size hint', () => {
    const src = '![[diagram.png|300]]';
    const s = snap(['/root/diagram.png']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/diagram.png', '/root/chart.png')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), '![[chart.png|300]]');
  });

  test('re-anchors a walk-resolved bare link when its own file moves', () => {
    // ref.md's [[notes]] resolves via the ancestor walk to a/notes.md. Moving ref.md out
    // of a/ breaks that walk, so the link must be rewritten to keep its old target.
    const src = 'See [[notes]].';
    const s = snap(['/root/a/notes.md', '/root/b/notes.md', '/root/a/sub/ref.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/a/sub/ref.md'),
      [pair('/root/a/sub/ref.md', '/root/moved/ref.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[a/notes]].');
  });

  test('case-variant [[Note]] is not rewritten on a folder move when it still resolves', () => {
    const src = 'See [[Note]].';
    const s = snap(['/root/docs/note.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/docs/note.md', '/root/archive/note.md')],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('extension-variant [[note.md]] is not rewritten on a folder move when it still resolves', () => {
    const src = 'See [[note.md]].';
    const s = snap(['/root/docs/note.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/docs/note.md', '/root/archive/note.md')],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('a bare link made ambiguous by an incoming rename is pinned to its old target', () => {
    // [[dup]] resolved uniquely to a/dup.md; renaming other.md to b/dup.md would make the
    // bare form ambiguous (and the walk from /root finds nothing), silently breaking it.
    const src = 'See [[dup]].';
    const s = snap(['/root/a/dup.md', '/root/other.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/other.md', '/root/b/dup.md')],
      s,
    );
    assert.strictEqual(applyReplacements(src, edits), 'See [[a/dup]].');
  });

  test('overwrite rename: a link to the overwritten file is not spuriously rewritten', () => {
    // A.md is renamed onto docs/B.md (overwrite). The effective index must hold ONE entry
    // for docs/B.md — a duplicate makes [[B]] look ambiguous (no root-level match, walk
    // finds nothing) and triggers a bogus pin to the slashed form.
    const src = 'See [[B]].';
    const s = snap(['/root/A.md', '/root/docs/B.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/A.md', '/root/docs/B.md')],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('no edit when neither the bare nor the slashed form would resolve to the target', () => {
    // old.md moves to a/b.md, but the root-relative form "a/b" is an ambiguous suffix
    // (x/a/b.md also matches). Writing [[a/b]] would produce a link that resolves to
    // nothing — leave the (already broken) original text alone instead.
    const src = 'See [[old]].';
    const s = snap(['/root/old.md', '/root/x/a/b.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/a/b.md')],
      s,
    );
    assert.deepStrictEqual(edits, []);
  });

  test('an explicitly passed rename context produces the same edits', () => {
    const src = 'See [[notes]].';
    const s = snap(['/root/a/notes.md', '/root/b/notes.md', '/root/a/sub/ref.md']);
    const renames = [pair('/root/a/sub/ref.md', '/root/moved/ref.md')];
    const ctx = buildRenameContext(renames, s);
    const edits = rewriteWikiRefs(src, np('/root/a/sub/ref.md'), renames, s, ctx);
    assert.strictEqual(applyReplacements(src, edits), 'See [[a/notes]].');
  });

  test('occurrences inside fenced code are not rewritten', () => {
    const src = 'normal [[old]]\n\n```\nsee [[old]] in fence\n```';
    const s = snap(['/root/old.md']);
    const edits = rewriteWikiRefs(
      src,
      np('/root/home.md'),
      [pair('/root/old.md', '/root/new.md')],
      s,
    );
    const result = applyReplacements(src, edits);
    assert.ok(result.includes('normal [[new]]'));
    assert.ok(result.includes('see [[old]] in fence'));
  });
});
