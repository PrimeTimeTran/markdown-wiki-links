import * as path from 'path';

import * as vscode from 'vscode';

import {
  rewriteWikiRefs,
  buildRenameContext,
  RenameContext,
  RenamePair,
} from '../core/rename/rewriteWikiRefs';
import { IndexSnapshot, createSnapshot, isContained } from '../core/resolver/resolveTarget';
import { computeLineStarts, positionAt } from '../core/textPosition';
import { buildExcludeGlob } from '../core/pathFilter';
import { IndexEntry } from '../core/types';

import { excludedFolders } from './indexService';

// Files a wiki-link can target: Markdown documents plus embeddable media.
const LINKABLE_RE = /\.(md|markdown|png|jpe?g|gif|webp|svg)$/i;
// Files that can *contain* wiki-links — only these are scanned and rewritten.
const MARKDOWN_RE = /\.(md|markdown)$/i;
const INDEX_GLOB = '**/*.{md,markdown,png,jpg,jpeg,gif,webp,svg}';

// The rename participant blocks VSCode's file operation until the edit is built (waitUntil),
// so this path must stay fast even in multi-thousand-file workspaces: referrers are read in
// parallel with vscode.workspace.fs (no TextDocument per file — opening one fires
// onDidOpenTextDocument and a diagnostics pass per referrer), and files that cannot possibly
// reference a renamed target are skipped by a cheap substring pre-filter.
const READ_CONCURRENCY = 16;
// Above this many distinct base names, scanning every referrer for every needle costs more
// than just parsing each referrer, so the pre-filter disables itself.
const MAX_PREFILTER_NEEDLES = 16;

// Throws a TypeError on malformed UTF-8 instead of silently substituting U+FFFD — the only
// reliable signal that raw bytes cannot be trusted to match VSCode's own decoding.
const FATAL_UTF8 = new TextDecoder('utf-8', { fatal: true });

// The fast path decodes raw bytes as UTF-8; that is only sound when VSCode will decode the
// file identically when applying the WorkspaceEdit.
function mustUseVSCodeDecoder(ref: vscode.Uri): boolean {
  // {uri, languageId} scope, not the bare Uri: files.encoding is language-overridable, and a
  // bare-Uri scope cannot see "[markdown]": {"files.encoding": ...} overrides. Every referrer
  // on this path is Markdown by construction (MARKDOWN_RE filter).
  const files = vscode.workspace.getConfiguration('files', { uri: ref, languageId: 'markdown' });
  return (
    files.get<string>('encoding', 'utf8') !== 'utf8' ||
    files.get<boolean>('autoGuessEncoding', false)
  );
}

export class RenameHandler {
  register(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      vscode.workspace.onWillRenameFiles((e) => {
        // Workspace-trust gate: in untrusted workspaces, do not modify files on disk.
        if (!vscode.workspace.isTrusted) return;
        e.waitUntil(this.buildEdit(e.files));
      }),
    );
  }

  private async buildEdit(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>,
  ): Promise<vscode.WorkspaceEdit> {
    const edit = new vscode.WorkspaceEdit();
    // The will-event fires before the move, so old paths are still on disk: stat classifies
    // each pair (a folder can carry a linkable-looking name), and the scan below still sees
    // the old paths of files inside a moved folder.
    const filePairs: RenamePair[] = [];
    const dirPairs: RenamePair[] = [];
    // The stats are independent — run them concurrently so a large multi-select rename
    // (500 .ts files on a remote filesystem) doesn't serialize round trips in waitUntil.
    const classified = await Promise.all(
      files.map(async (f) => {
        const pair = { oldFsPath: f.oldUri.fsPath, newFsPath: f.newUri.fsPath };
        try {
          const st = await vscode.workspace.fs.stat(f.oldUri);
          return { pair, isDirectory: (st.type & vscode.FileType.Directory) !== 0 };
        } catch {
          // Stat can fail transiently (remote FS hiccup, permissions) while the path still
          // exists. Falling back on the extension is strictly safer than assuming "file":
          // treating a vanished path as a directory just expands to zero children, while
          // misclassifying a real folder as a file would silently drop every rewrite for
          // the move.
          return { pair, isDirectory: !LINKABLE_RE.test(pair.oldFsPath) };
        }
      }),
    );
    for (const { pair, isDirectory } of classified) {
      if (isDirectory) dirPairs.push(pair);
      else if (LINKABLE_RE.test(pair.oldFsPath)) filePairs.push(pair);
    }
    if (filePairs.length === 0 && dirPairs.length === 0) return edit;

    // Build the snapshot from a fresh scan rather than the cached index: rename is rare,
    // correctness matters more than the cache, and the cache can lag fixture/file creation.
    // The scan must include media so embeds like ![[image.png]] resolve to the renamed file;
    // only Markdown files are scanned for occurrences to rewrite. The exclude list matches
    // the index, so vendor/VCS folders are neither scanned nor treated as link targets.
    const exclude = buildExcludeGlob(excludedFolders());
    const allFiles = await vscode.workspace.findFiles(INDEX_GLOB, exclude);
    const referrers = allFiles.filter((u) => MARKDOWN_RE.test(u.fsPath));

    // A moved folder arrives as one directory pair; every linkable file beneath its old
    // path moves with it, so expand the pair to those files at their new locations.
    const renames: RenamePair[] = [...filePairs];
    for (const dir of dirPairs) {
      const prefix = dir.oldFsPath + path.sep;
      for (const u of allFiles) {
        if (u.fsPath.startsWith(prefix) && LINKABLE_RE.test(u.fsPath)) {
          renames.push({
            oldFsPath: u.fsPath,
            newFsPath: path.join(dir.newFsPath, u.fsPath.slice(prefix.length)),
          });
        }
      }
    }
    if (renames.length === 0) return edit;
    // Referrers in the same workspace folder share one snapshot and one rename context —
    // built once per root so the per-ref rewrite work stays independent of batch size.
    const newPathByOld = new Map(renames.map((r) => [r.oldFsPath, r.newFsPath]));
    const perRoot = new Map<string, { snap: IndexSnapshot; ctx: RenameContext }>();
    const contextFor = (ref: vscode.Uri): { snap: IndexSnapshot; ctx: RenameContext } => {
      // Key on where the referrer will live AFTER the rename: a referrer moved across
      // workspace roots must be judged against its destination root's snapshot, or the
      // rewrite verification approves forms only the old root can resolve — writing
      // links that are dead where the file actually ends up.
      const post = newPathByOld.get(ref.fsPath) ?? ref.fsPath;
      const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(post))?.uri.fsPath ?? '';
      let entry = perRoot.get(root);
      if (!entry) {
        const snap = buildSnapshot(root, allFiles);
        entry = { snap, ctx: buildRenameContext(renames, snap) };
        perRoot.set(root, entry);
      }
      return entry;
    };

    // A ref whose rewrite can be affected by this batch must textually contain either an old
    // base name (its target moved, or a departing entry changed its resolution) or a new base
    // name (an arriving entry collides with it), so a referrer lacking all of them can be
    // skipped without parsing. Renamed files themselves are exempt: their own move can
    // re-anchor refs that name no renamed file at all. Past a handful of needles (a large
    // folder move) the per-referrer substring sweep costs more than the parse it avoids, so
    // the filter turns itself off and every referrer is parsed instead.
    const needles = [
      ...new Set(
        renames.flatMap((r) => [
          path.basename(r.oldFsPath).replace(LINKABLE_RE, '').toLowerCase(),
          path.basename(r.newFsPath).replace(LINKABLE_RE, '').toLowerCase(),
        ]),
      ),
    ];
    const preFilter = needles.length <= MAX_PREFILTER_NEEDLES;
    const renamedFsPaths = new Set(renames.map((r) => r.oldFsPath));

    await forEachConcurrent(referrers, READ_CONCURRENCY, async (ref) => {
      try {
        await this.collectEdits(ref, edit, renames, contextFor, needles, preFilter, renamedFsPaths);
      } catch (e) {
        // One bad referrer must not reject the whole waitUntil edit — that would silently
        // discard every other file's already-computed rewrites while the rename proceeds.
        console.error(`wiki-links: skipping link rewrite for ${ref.fsPath}:`, e);
      }
    });
    return edit;
  }

  private async collectEdits(
    ref: vscode.Uri,
    edit: vscode.WorkspaceEdit,
    renames: RenamePair[],
    contextFor: (ref: vscode.Uri) => { snap: IndexSnapshot; ctx: RenameContext },
    needles: string[],
    preFilter: boolean,
    renamedFsPaths: Set<string>,
  ): Promise<void> {
    // A doc already open (possibly dirty) must be read and positioned through its buffer.
    let doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === ref.toString());
    let text: string;
    if (doc) {
      text = doc.getText();
    } else {
      try {
        if (mustUseVSCodeDecoder(ref)) {
          // A non-UTF-8 files.encoding (or auto-guessing) can decode the same bytes to a
          // different character count than a raw UTF-8 decode — positions computed on the
          // wrong text splice mid-link when VSCode applies the edit. Only VSCode's own
          // decoder is guaranteed to agree with how the edit will be applied.
          doc = await vscode.workspace.openTextDocument(ref);
          text = doc.getText();
        } else {
          const bytes = await vscode.workspace.fs.readFile(ref);
          // NUL bytes mean UTF-16 (a BOM-less UTF-16 ASCII file is byte-valid UTF-8), and
          // FATAL_UTF8 throws on malformed input (UTF-16 BOMs, legacy codepages) — both
          // fall back to VSCode's encoding detection. Clean UTF-8 stays on the fast path.
          if (bytes.includes(0)) {
            doc = await vscode.workspace.openTextDocument(ref);
            text = doc.getText();
          } else {
            text = FATAL_UTF8.decode(bytes);
          }
        }
      } catch (e) {
        if (e instanceof TypeError) {
          // Malformed UTF-8 from FATAL_UTF8 — retry through VSCode's decoder.
          try {
            doc = await vscode.workspace.openTextDocument(ref);
            text = doc.getText();
          } catch {
            return;
          }
        } else {
          // Deleted between the scan and the read is expected churn. Anything else
          // (permissions, transient FS failure) means this referrer's links silently
          // break with the rename — surface it, as the changelog promises.
          if (!(e instanceof vscode.FileSystemError && e.code === 'FileNotFound')) {
            console.error(`wiki-links: cannot read ${ref.fsPath}; its links were not rewritten:`, e);
          }
          return;
        }
      }
    }
    if (preFilter && !renamedFsPaths.has(ref.fsPath)) {
      const lower = text.toLowerCase();
      if (!needles.some((n) => lower.includes(n))) return;
    }
    const { snap, ctx } = contextFor(ref);
    const replacements = rewriteWikiRefs(text, ref.fsPath, renames, snap, ctx);
    if (replacements.length === 0) return;
    const starts = doc ? undefined : computeLineStarts(text);
    const toPosition = (offset: number): vscode.Position => {
      if (doc) return doc.positionAt(offset);
      const p = positionAt(starts!, offset);
      return new vscode.Position(p.line, p.character);
    };
    for (const r of replacements) {
      edit.replace(ref, new vscode.Range(toPosition(r.start), toPosition(r.end)), r.newText);
    }
  }
}

function buildSnapshot(root: string, allFiles: readonly vscode.Uri[]): IndexSnapshot {
  // isContained (separator-safe), not startsWith: a sibling root like /ws/docs must not
  // leak into /ws/doc's entries, or completion/collision checks diverge from resolution.
  const entries: IndexEntry[] = allFiles
    .filter((u) => isContained(u.fsPath, root))
    .map((u) => ({
      fsPath: u.fsPath,
      relPath: path.relative(root, u.fsPath),
      baseNoExt: path.basename(u.fsPath).replace(/\.(md|markdown)$/i, ''),
    }));
  return createSnapshot(entries, root);
}

async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
