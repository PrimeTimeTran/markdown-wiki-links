import * as path from 'path';

import * as vscode from 'vscode';

import {
  rewriteWikiRefs,
  buildRenameContext,
  RenameContext,
  RenamePair,
} from '../core/rename/rewriteWikiRefs';
import { IndexSnapshot, buildLookup } from '../core/resolver/resolveTarget';
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
    for (const f of files) {
      const pair = { oldFsPath: f.oldUri.fsPath, newFsPath: f.newUri.fsPath };
      let isDirectory = false;
      try {
        const st = await vscode.workspace.fs.stat(f.oldUri);
        isDirectory = (st.type & vscode.FileType.Directory) !== 0;
      } catch {
        // gone already — fall back to the extension check below
      }
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
    const perRoot = new Map<string, { snap: IndexSnapshot; ctx: RenameContext }>();
    const contextFor = (ref: vscode.Uri): { snap: IndexSnapshot; ctx: RenameContext } => {
      const root = vscode.workspace.getWorkspaceFolder(ref)?.uri.fsPath ?? '';
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
      // A doc already open (possibly dirty) must be read and positioned through its buffer.
      let doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === ref.toString());
      let text: string;
      if (doc) {
        text = doc.getText();
      } else {
        try {
          text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(ref));
          if (text.includes('�')) {
            // Replacement chars mean the bytes are not clean UTF-8 (UTF-16, legacy codepage).
            // Decoding wrong would skip or misplace rewrites, so take VSCode's encoding-aware
            // document load for this file only — the slow path stays off clean-UTF-8 files.
            doc = await vscode.workspace.openTextDocument(ref);
            text = doc.getText();
          }
        } catch {
          return; // deleted or unreadable between the scan and the read — nothing to rewrite
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
    });
    return edit;
  }
}

function buildSnapshot(root: string, allFiles: readonly vscode.Uri[]): IndexSnapshot {
  const entries: IndexEntry[] = allFiles
    .filter((u) => u.fsPath.startsWith(root))
    .map((u) => ({
      fsPath: u.fsPath,
      relPath: path.relative(root, u.fsPath),
      baseNoExt: path.basename(u.fsPath).replace(/\.(md|markdown)$/i, ''),
    }));
  return { entries, workspaceRoot: root, lookup: buildLookup(entries, root) };
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
