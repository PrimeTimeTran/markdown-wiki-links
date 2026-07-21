import * as assert from 'assert';
import * as path from 'path';

import {
  resolveTarget,
  buildLookup,
  createSnapshot,
  isContained,
  relSuffixMatches,
  makeIndexEntry,
  IndexSnapshot,
} from '../../src/core/resolver/resolveTarget';
import { np } from '../helpers/nativePath';

// Fixture paths are written POSIX-style and translated to native paths by np(), so these
// tests pin the same behavior on Windows and POSIX. See test/helpers/nativePath.ts.
function mkIndex(paths: string[]): IndexSnapshot {
  return {
    entries: paths.map((p) => makeIndexEntry(np(p), np('/root'))),
    workspaceRoot: np('/root'),
  };
}

suite('resolveTarget', () => {
  test('unique base name resolves', () => {
    const idx = mkIndex(['/root/a/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'alpha' } as any, np('/root/x.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/a/alpha.md'));
  });
  test('ambiguous base name returns null', () => {
    const idx = mkIndex(['/root/a/dup.md', '/root/b/dup.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: 'dup' } as any, np('/root/x.md'), idx), null);
  });
  test('slashed target: unique global suffix match (single hit)', () => {
    const idx = mkIndex(['/root/x/y/z.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'y/z' } as any, np('/root/other.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/x/y/z.md'));
  });
  test('slashed target: two suffix matches → null (no walk)', () => {
    const idx = mkIndex(['/root/a/dup.md', '/root/b/a/dup.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'a/dup' } as any, np('/root/b/a/sub/ref.md'), idx);
    assert.strictEqual(r, null);
  });
  test('.markdown extension supported', () => {
    const idx = mkIndex(['/root/a/gamma.markdown']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'gamma' } as any, np('/root/x.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/a/gamma.markdown'));
  });
  test('empty target returns same file', () => {
    const idx = mkIndex([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: '' } as any, np('/root/x.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/x.md'));
  });
  test('closest-parent: picks the nearest ancestor when multiple ancestors contain a match', () => {
    const idx = mkIndex(['/root/notes.md', '/root/a/notes.md', '/root/a/b/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, np('/root/a/b/c/ref.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/notes.md'));
  });
  test('relative path with .md extension typed by user still resolves', () => {
    const idx = mkIndex(['/root/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes.md' } as any, np('/root/x.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/notes.md'));
  });
  test('case-insensitive base-name match', () => {
    const idx = mkIndex(['/root/Notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, np('/root/x.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/Notes.md'));
  });
  test('global suffix match used only when unique', () => {
    const idx = mkIndex(['/root/x/y/z.md', '/root/other/y/z.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'y/z' } as any, np('/root/elsewhere.md'), idx);
    assert.strictEqual(r, null);
  });
  test('target containing .. segment returns null', () => {
    const idx = mkIndex(['/root/a/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: '../alpha' } as any, np('/root/x.md'), idx), null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: 'a/../alpha' } as any, np('/root/x.md'), idx), null);
  });
  test('absolute target (POSIX or Windows) returns null', () => {
    const idx = mkIndex(['/root/alpha.md']);
    // The targets here are link text, not filesystem paths — they stay literal on purpose.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(resolveTarget({ target: '/abs/alpha' } as any, np('/root/x.md'), idx), null);
    assert.strictEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveTarget({ target: 'C:/abs/alpha' } as any, np('/root/x.md'), idx),
      null,
    );
  });
  test('walk never reaches an ancestor outside the workspace root', () => {
    const idx = mkIndex(['/root2/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, np('/root/sub/ref.md'), idx);
    assert.strictEqual(r, null);
  });
  test('similarly-prefixed sibling root is NOT considered inside the workspace', () => {
    const idx = mkIndex(['/root2/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'alpha' } as any, np('/root/x.md'), idx);
    assert.strictEqual(r, null);
  });
  test('from a file AT the workspace root, the walk stops at root without escaping', () => {
    const idx = mkIndex(['/root/alpha.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'alpha' } as any, np('/root/ref.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/alpha.md'));
  });
  test('walk skips intermediate ancestors that have no match (2-level up)', () => {
    const idx = mkIndex(['/root/a/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'a/notes' } as any, np('/root/a/b/ref.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/a/notes.md'));
  });
  test('workspace-root preference: single root-level match wins over mid-tree ancestor match', () => {
    const idx = mkIndex(['/root/notes.md', '/root/a/b/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, np('/root/a/b/c/d/ref.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/notes.md'));
  });
  test('worked example: root preference applies regardless of source location', () => {
    const idx = mkIndex(['/root/note.md', '/root/a/note.md', '/root/b/note.md']);
    assert.strictEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveTarget({ target: 'note' } as any, np('/root/a/sub/ref.md'), idx)?.fsPath,
      np('/root/note.md'),
    );
    assert.strictEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveTarget({ target: 'note' } as any, np('/root/b/x.md'), idx)?.fsPath,
      np('/root/note.md'),
    );
    assert.strictEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveTarget({ target: 'note' } as any, np('/root/x.md'), idx)?.fsPath,
      np('/root/note.md'),
    );
  });
  test('root preference does NOT apply when no candidate sits at the workspace root', () => {
    const idx = mkIndex(['/root/a/dup.md', '/root/b/dup.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'dup' } as any, np('/root/a/sub/ref.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/a/dup.md'));
  });
  test('candidate in a sibling branch (not on the ancestor chain) is NOT picked by the walk', () => {
    const idx = mkIndex(['/root/x/notes.md', '/root/y/notes.md']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'notes' } as any, np('/root/a/b/ref.md'), idx);
    assert.strictEqual(r, null);
  });
  test('slashed target matches an entry whose relPath uses backslashes (Windows)', () => {
    // relPath is spelled with literal backslashes on purpose: this pins the separator
    // normalization, so it must NOT go through np().
    const idx: IndexSnapshot = {
      entries: [{ fsPath: np('/root/x/y/z.md'), relPath: 'x\\y\\z.md', baseNoExt: 'z' }],
      workspaceRoot: np('/root'),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveTarget({ target: 'y/z' } as any, np('/root/other.md'), idx);
    assert.strictEqual(r?.fsPath, np('/root/x/y/z.md'));
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
      const r = resolveTarget({ target: 'alpha' } as any, np('/root/x.md'), idx);
      assert.strictEqual(r?.fsPath, np('/root/a/alpha.md'));
    });
    test('ambiguous base name is still null through the lookup', () => {
      const idx = lookupOnly(['/root/a/dup.md', '/root/b/dup.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual(resolveTarget({ target: 'dup' } as any, np('/root/x.md'), idx), null);
    });
    test('root-level preference applies through the lookup', () => {
      const idx = lookupOnly(['/root/notes.md', '/root/a/b/notes.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'notes' } as any, np('/root/a/b/c/ref.md'), idx);
      assert.strictEqual(r?.fsPath, np('/root/notes.md'));
    });
    test('closest-parent ancestor walk works through the lookup', () => {
      const idx = lookupOnly(['/root/a/dup.md', '/root/b/dup.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'dup' } as any, np('/root/a/sub/ref.md'), idx);
      assert.strictEqual(r?.fsPath, np('/root/a/dup.md'));
    });
    test('slashed target: unique suffix match through the lookup', () => {
      const idx = lookupOnly(['/root/x/y/z.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'y/z' } as any, np('/root/other.md'), idx);
      assert.strictEqual(r?.fsPath, np('/root/x/y/z.md'));
    });
    test('slashed target: ambiguous suffix is still null through the lookup', () => {
      const idx = lookupOnly(['/root/x/y/z.md', '/root/other/y/z.md']);
      assert.strictEqual(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolveTarget({ target: 'y/z' } as any, np('/root/elsewhere.md'), idx),
        null,
      );
    });
    test('case-insensitive base-name match through the lookup', () => {
      const idx = lookupOnly(['/root/Notes.md']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'notes' } as any, np('/root/x.md'), idx);
      assert.strictEqual(r?.fsPath, np('/root/Notes.md'));
    });
    test('buildLookup excludes entries outside the workspace root', () => {
      const full = mkIndex(['/root2/alpha.md']);
      const idx: IndexSnapshot = {
        entries: [],
        workspaceRoot: np('/root'),
        lookup: buildLookup(full.entries, np('/root')),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual(resolveTarget({ target: 'alpha' } as any, np('/root/x.md'), idx), null);
    });
  });

  suite('createSnapshot factory', () => {
    test('attaches a lookup so resolution works without the per-call fallback', () => {
      const entries = [makeIndexEntry(np('/root/a/alpha.md'), np('/root'))];
      const s = createSnapshot(entries, np('/root'));
      assert.ok(s.lookup, 'factory must attach the precomputed lookup');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = resolveTarget({ target: 'alpha' } as any, np('/root/x.md'), s);
      assert.strictEqual(r?.fsPath, np('/root/a/alpha.md'));
    });
  });

  suite('isContained', () => {
    test('path inside the root is contained', () => {
      assert.strictEqual(isContained(np('/root/a/b.md'), np('/root')), true);
    });
    test('the root itself is contained', () => {
      assert.strictEqual(isContained(np('/root'), np('/root')), true);
    });
    test('a sibling root sharing a prefix is NOT contained', () => {
      assert.strictEqual(isContained(np('/root2/a.md'), np('/root')), false);
    });
    test('empty root contains a path only when it starts with the platform separator', () => {
      // Files outside any workspace folder get root ''. isContained then reduces to
      // `p.startsWith(path.sep)`, which is platform-dependent: every POSIX absolute path
      // qualifies, but a Windows path starts with a drive letter and does not. Pinned
      // per-platform because it is the containment rule, not the fixture, that differs.
      assert.strictEqual(isContained(path.sep + 'anywhere' + path.sep + 'a.md', ''), true);
      assert.strictEqual(isContained(np('/anywhere/a.md'), ''), process.platform !== 'win32');
    });
  });

  suite('makeIndexEntry', () => {
    test('builds fsPath, root-relative relPath, and extension-stripped baseNoExt', () => {
      const e = makeIndexEntry(np('/root/a/Note.md'), np('/root'));
      assert.strictEqual(e.fsPath, np('/root/a/Note.md'));
      assert.strictEqual(e.relPath, ['a', 'Note.md'].join(path.sep));
      assert.strictEqual(e.baseNoExt, 'Note');
    });
    test('strips .markdown case-insensitively but keeps media extensions', () => {
      assert.strictEqual(makeIndexEntry(np('/root/x.MARKDOWN'), np('/root')).baseNoExt, 'x');
      assert.strictEqual(makeIndexEntry(np('/root/pic.png'), np('/root')).baseNoExt, 'pic.png');
    });
  });

  suite('relSuffixMatches', () => {
    // Pure string matching over relPath text — no filesystem navigation, so these literals
    // stay platform-independent by design (both separator styles are exercised directly).
    test('matches a forward-slash target against a backslash (Windows) relPath', () => {
      assert.strictEqual(relSuffixMatches('pics\\photo.png', 'pics/photo.png'), true);
    });
    test('matches a bare file name as the last segment', () => {
      assert.strictEqual(relSuffixMatches('pics/photo.png', 'photo.png'), true);
    });
    test('is segment-safe: a name that merely ends with the target does not match', () => {
      assert.strictEqual(relSuffixMatches('my-pics/photo.png', 'pics/photo.png'), false);
      assert.strictEqual(relSuffixMatches('a/my-photo.png', 'photo.png'), false);
    });
    test('exact relPath match and case-insensitive compare', () => {
      assert.strictEqual(relSuffixMatches('Pics/Photo.PNG', 'pics/photo.png'), true);
    });
  });

  suite('worked example: a/1/note, a/2/note, b/1/note', () => {
    const idx = mkIndex(['/root/a/1/note.md', '/root/a/2/note.md', '/root/b/1/note.md']);
    const from = np('/root/b/1/note.md');
    test('[[a/1/note]] resolves to /root/a/1/note.md (unique suffix)', () => {
      assert.strictEqual(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolveTarget({ target: 'a/1/note' } as any, from, idx)?.fsPath,
        np('/root/a/1/note.md'),
      );
    });
    test('[[2/note]] resolves to /root/a/2/note.md (unique suffix)', () => {
      assert.strictEqual(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolveTarget({ target: '2/note' } as any, from, idx)?.fsPath,
        np('/root/a/2/note.md'),
      );
    });
    test('[[1/note]] is ambiguous (two entries end with 1/note) → null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual(resolveTarget({ target: '1/note' } as any, from, idx), null);
    });
  });
});
