import * as assert from 'assert';

import { resolveTarget, buildLookup, IndexSnapshot } from '../../src/core/resolver/resolveTarget';

function mkIndex(paths: string[]): IndexSnapshot {
  return {
    entries: paths.map((p) => ({
      fsPath: p,
      relPath: p.replace(/^\/root\//, ''),
      baseNoExt: p
        .split('/')
        .pop()!
        .replace(/\.(md|markdown)$/, ''),
    })),
    workspaceRoot: '/root',
  };
}

suite('resolveTarget', () => {
  test('unique base name resolves', () => {
    const idx = mkIndex(['/root/a/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'alpha' } as any, '/root/x.md', idx);
    assert.strictEqual(r?.fsPath, '/root/a/alpha.md');
  });
  test('ambiguous base name returns null', () => {
    const idx = mkIndex(['/root/a/dup.md', '/root/b/dup.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: 'dup' } as any, '/root/x.md', idx), null);
  });
  test('slashed target: unique global suffix match (single hit)', () => {
    const idx = mkIndex(['/root/x/y/z.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'y/z' } as any, '/root/other.md', idx);
    assert.strictEqual(r?.fsPath, '/root/x/y/z.md');
  });
  test('slashed target: two suffix matches → null (no walk)', () => {
    const idx = mkIndex(['/root/a/dup.md', '/root/b/a/dup.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'a/dup' } as any, '/root/b/a/sub/ref.md', idx);
    assert.strictEqual(r, null);
  });
  test('.markdown extension supported', () => {
    const idx = mkIndex(['/root/a/gamma.markdown']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'gamma' } as any, '/root/x.md', idx);
    assert.strictEqual(r?.fsPath, '/root/a/gamma.markdown');
  });
  test('empty target returns same file', () => {
    const idx = mkIndex([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: '' } as any, '/root/x.md', idx);
    assert.strictEqual(r?.fsPath, '/root/x.md');
  });
  test('closest-parent: picks the nearest ancestor when multiple ancestors contain a match', () => {
    const idx = mkIndex(['/root/notes.md', '/root/a/notes.md', '/root/a/b/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, '/root/a/b/c/ref.md', idx);
    assert.strictEqual(r?.fsPath, '/root/notes.md');
  });
  test('relative path with .md extension typed by user still resolves', () => {
    const idx = mkIndex(['/root/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes.md' } as any, '/root/x.md', idx);
    assert.strictEqual(r?.fsPath, '/root/notes.md');
  });
  test('case-insensitive base-name match', () => {
    const idx = mkIndex(['/root/Notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, '/root/x.md', idx);
    assert.strictEqual(r?.fsPath, '/root/Notes.md');
  });
  test('global suffix match used only when unique', () => {
    const idx = mkIndex(['/root/x/y/z.md', '/root/other/y/z.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'y/z' } as any, '/root/elsewhere.md', idx);
    assert.strictEqual(r, null);
  });
  test('target containing .. segment returns null', () => {
    const idx = mkIndex(['/root/a/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: '../alpha' } as any, '/root/x.md', idx), null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: 'a/../alpha' } as any, '/root/x.md', idx), null);
  });
  test('absolute target (POSIX or Windows) returns null', () => {
    const idx = mkIndex(['/root/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: '/abs/alpha' } as any, '/root/x.md', idx), null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: 'C:/abs/alpha' } as any, '/root/x.md', idx), null);
  });
  test('walk never reaches an ancestor outside the workspace root', () => {
    const idx = mkIndex(['/root2/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, '/root/sub/ref.md', idx);
    assert.strictEqual(r, null);
  });
  test('similarly-prefixed sibling root is NOT considered inside the workspace', () => {
    const idx = mkIndex(['/root2/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'alpha' } as any, '/root/x.md', idx);
    assert.strictEqual(r, null);
  });
  test('from a file AT the workspace root, the walk stops at root without escaping', () => {
    const idx = mkIndex(['/root/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'alpha' } as any, '/root/ref.md', idx);
    assert.strictEqual(r?.fsPath, '/root/alpha.md');
  });
  test('walk skips intermediate ancestors that have no match (2-level up)', () => {
    const idx = mkIndex(['/root/a/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'a/notes' } as any, '/root/a/b/ref.md', idx);
    assert.strictEqual(r?.fsPath, '/root/a/notes.md');
  });
  test('workspace-root preference: single root-level match wins over mid-tree ancestor match', () => {
    const idx = mkIndex(['/root/notes.md', '/root/a/b/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, '/root/a/b/c/d/ref.md', idx);
    assert.strictEqual(r?.fsPath, '/root/notes.md');
  });
  test('worked example: root preference applies regardless of source location', () => {
    const idx = mkIndex(['/root/note.md', '/root/a/note.md', '/root/b/note.md']);
    assert.strictEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveTarget({ target: 'note' } as any, '/root/a/sub/ref.md', idx)?.fsPath,
      '/root/note.md',
    );
    assert.strictEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveTarget({ target: 'note' } as any, '/root/b/x.md', idx)?.fsPath,
      '/root/note.md',
    );
    assert.strictEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveTarget({ target: 'note' } as any, '/root/x.md', idx)?.fsPath,
      '/root/note.md',
    );
  });
  test('root preference does NOT apply when no candidate sits at the workspace root', () => {
    const idx = mkIndex(['/root/a/dup.md', '/root/b/dup.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'dup' } as any, '/root/a/sub/ref.md', idx);
    assert.strictEqual(r?.fsPath, '/root/a/dup.md');
  });
  test('candidate in a sibling branch (not on the ancestor chain) is NOT picked by the walk', () => {
    const idx = mkIndex(['/root/x/notes.md', '/root/y/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, '/root/a/b/ref.md', idx);
    assert.strictEqual(r, null);
  });
  suite('precomputed lookup (buildLookup)', () => {
    // The lookup is authoritative when present: resolution must read it, not idx.entries.
    // Each test passes an empty entries array so a pass proves the lookup was consulted.
    function lookupOnly(paths: string[]): IndexSnapshot {
      const full = mkIndex(paths);
      return {
        entries: [],
        workspaceRoot: full.workspaceRoot,
        lookup: buildLookup(full.entries, full.workspaceRoot),
      };
    }

    test('bare target resolves through the lookup', () => {
      const idx = lookupOnly(['/root/a/alpha.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'alpha' } as any, '/root/x.md', idx);
      assert.strictEqual(r?.fsPath, '/root/a/alpha.md');
    });
    test('ambiguous base name is still null through the lookup', () => {
      const idx = lookupOnly(['/root/a/dup.md', '/root/b/dup.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual(resolveTarget({ target: 'dup' } as any, '/root/x.md', idx), null);
    });
    test('root-level preference applies through the lookup', () => {
      const idx = lookupOnly(['/root/notes.md', '/root/a/b/notes.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'notes' } as any, '/root/a/b/c/ref.md', idx);
      assert.strictEqual(r?.fsPath, '/root/notes.md');
    });
    test('closest-parent ancestor walk works through the lookup', () => {
      const idx = lookupOnly(['/root/a/dup.md', '/root/b/dup.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'dup' } as any, '/root/a/sub/ref.md', idx);
      assert.strictEqual(r?.fsPath, '/root/a/dup.md');
    });
    test('slashed target: unique suffix match through the lookup', () => {
      const idx = lookupOnly(['/root/x/y/z.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'y/z' } as any, '/root/other.md', idx);
      assert.strictEqual(r?.fsPath, '/root/x/y/z.md');
    });
    test('slashed target: ambiguous suffix is still null through the lookup', () => {
      const idx = lookupOnly(['/root/x/y/z.md', '/root/other/y/z.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual(resolveTarget({ target: 'y/z' } as any, '/root/elsewhere.md', idx), null);
    });
    test('case-insensitive base-name match through the lookup', () => {
      const idx = lookupOnly(['/root/Notes.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'notes' } as any, '/root/x.md', idx);
      assert.strictEqual(r?.fsPath, '/root/Notes.md');
    });
    test('buildLookup excludes entries outside the workspace root', () => {
      const full = mkIndex(['/root2/alpha.md']);
      const idx: IndexSnapshot = {
        entries: [],
        workspaceRoot: '/root',
        lookup: buildLookup(full.entries, '/root'),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual(resolveTarget({ target: 'alpha' } as any, '/root/x.md', idx), null);
    });
  });

  suite('worked example: a/1/note, a/2/note, b/1/note', () => {
    const idx = mkIndex(['/root/a/1/note.md', '/root/a/2/note.md', '/root/b/1/note.md']);
    const from = '/root/b/1/note.md';
    test('[[a/1/note]] resolves to /root/a/1/note.md (unique suffix)', () => {
      assert.strictEqual(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolveTarget({ target: 'a/1/note' } as any, from, idx)?.fsPath,
        '/root/a/1/note.md',
      );
    });
    test('[[2/note]] resolves to /root/a/2/note.md (unique suffix)', () => {
      assert.strictEqual(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolveTarget({ target: '2/note' } as any, from, idx)?.fsPath,
        '/root/a/2/note.md',
      );
    });
    test('[[1/note]] is ambiguous (two entries end with 1/note) → null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual(resolveTarget({ target: '1/note' } as any, from, idx), null);
    });
  });
});
