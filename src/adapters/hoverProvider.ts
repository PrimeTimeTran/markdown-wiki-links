import * as fs from 'fs/promises';

import * as vscode from 'vscode';

import { parseLinks } from '../core/parser/linkParser';
import { parseEmbeds } from '../core/parser/embedParser';
import { resolveTarget } from '../core/resolver/resolveTarget';
import { sliceSection } from '../core/blocks/sectionSlice';
import { stripFrontmatter } from '../core/frontmatter';

import { IndexService } from './indexService';
import { isInsideWorkspaceReal } from './workspaceBoundary';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

export class WikiHoverProvider implements vscode.HoverProvider {
  constructor(private idx: IndexService) {}

  async provideHover(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const text = doc.getText();
    const offset = doc.offsetAt(pos);
    const snap = this.idx.snapshotFor(doc.uri.fsPath);

    const embed = parseEmbeds(text).find((r) => offset >= r.range.start && offset <= r.range.end);
    if (embed) return this.hoverForEmbed(embed, doc, snap);

    const link = parseLinks(text).find((r) => offset >= r.range.start && offset <= r.range.end);
    if (link) return this.hoverForLink(link, doc, snap);

    return undefined;
  }

  private async hoverForLink(
    ref: { target: string; fragment?: string; range: { start: number; end: number } },
    doc: vscode.TextDocument,
    snap: ReturnType<IndexService['snapshotFor']>,
  ): Promise<vscode.Hover | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolved = resolveTarget(ref as any, doc.uri.fsPath, snap);
    if (!resolved) return;
    // A plain [[image.png]] link still points at a binary file — preview it, don't dump bytes.
    if (IMAGE_RE.test(resolved.fsPath)) {
      return imageHover(vscode.Uri.file(resolved.fsPath), ref.target);
    }
    const targetText =
      resolved.fsPath === doc.uri.fsPath
        ? doc.getText()
        : await fs.readFile(resolved.fsPath, 'utf8').catch(() => '');
    const snippet = ref.fragment
      ? sliceSection(ref.fragment, targetText)
      : firstLines(stripFrontmatter(targetText), 40);
    return new vscode.Hover(new vscode.MarkdownString(snippet));
  }

  private async hoverForEmbed(
    ref: {
      target: string;
      fragment?: string;
      sizeHint?: string;
      range: { start: number; end: number };
    },
    doc: vscode.TextDocument,
    snap: ReturnType<IndexService['snapshotFor']>,
  ): Promise<vscode.Hover | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolved = resolveTarget({ ...ref, kind: 'embed' } as any, doc.uri.fsPath, snap);
    if (!resolved) return;
    if (IMAGE_RE.test(resolved.fsPath)) {
      return imageHover(vscode.Uri.file(resolved.fsPath), ref.target, ref.sizeHint);
    }
    const targetText = await fs.readFile(resolved.fsPath, 'utf8').catch(() => '');
    const body = ref.fragment
      ? sliceSection(ref.fragment, targetText)
      : stripFrontmatter(targetText);
    return new vscode.Hover(new vscode.MarkdownString(body));
  }
}

async function imageHover(
  uri: vscode.Uri,
  displayName: string,
  sizeHint?: string,
): Promise<vscode.Hover | undefined> {
  if (!(await isInsideWorkspaceReal(uri))) return;
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.baseUri = uri.with({ path: uri.path.replace(/[^/]+$/, '') });
  const w = sizeHint && /^\d+$/.test(sizeHint) ? ` =${sizeHint}x` : '';
  const altEscaped = displayName.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
  md.appendMarkdown(`![${altEscaped}](${uri.toString()}${w})`);
  return new vscode.Hover(md);
}

function firstLines(text: string, n: number): string {
  return text.split(/\r?\n/).slice(0, n).join('\n');
}
