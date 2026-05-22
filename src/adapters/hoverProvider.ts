import * as fs from 'fs/promises';

import * as vscode from 'vscode';

import { parseLinks } from '../core/parser/linkParser';
import { parseEmbeds } from '../core/parser/embedParser';
import { resolveTarget } from '../core/resolver/resolveTarget';
import { sliceSection } from '../core/blocks/sectionSlice';
import { stripFrontmatter } from '../core/frontmatter';
import { imageSize } from '../core/imageSize';

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
      return imageHover(vscode.Uri.file(resolved.fsPath), ref.target);
    }
    const targetText = await fs.readFile(resolved.fsPath, 'utf8').catch(() => '');
    const body = ref.fragment
      ? sliceSection(ref.fragment, targetText)
      : stripFrontmatter(targetText);
    return new vscode.Hover(new vscode.MarkdownString(body));
  }
}

// Width bounds (px) for image hovers. The height bound is the wikiLinks.hover.imageMaxHeight
// setting: VSCode's hover height limit is not exposed to extensions, so the user tunes it.
const HOVER_IMAGE_MAX_WIDTH = 600;
const HOVER_IMAGE_MIN_WIDTH = 300;
const HOVER_IMAGE_DEFAULT_MAX_HEIGHT = 240;

function hoverImageMaxHeight(): number {
  const configured = vscode.workspace
    .getConfiguration('wikiLinks')
    .get<number>('hover.imageMaxHeight', HOVER_IMAGE_DEFAULT_MAX_HEIGHT);
  return typeof configured === 'number' && configured > 0
    ? configured
    : HOVER_IMAGE_DEFAULT_MAX_HEIGHT;
}

async function imageHover(uri: vscode.Uri, displayName: string): Promise<vscode.Hover | undefined> {
  if (!(await isInsideWorkspaceReal(uri))) return;
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  // VSCode hovers have no markdown syntax for image dimensions; an <img> tag is the only way to
  // size the preview. supportHtml enables VSCode's sanitized HTML subset, which permits <img>.
  md.supportHtml = true;
  md.baseUri = uri.with({ path: uri.path.replace(/[^/]+$/, '') });
  const width = await hoverImageWidth(uri);
  md.appendMarkdown(
    `<img src="${escapeHtmlAttr(uri.toString())}" width="${width}" ` +
      `alt="${escapeHtmlAttr(displayName)}">`,
  );
  return new vscode.Hover(md);
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Inline ![[image|size]] hints are intentionally ignored — the hover always fits the image to
// the popup. Scale to fit both bounds (aspect ratio preserved, never upscaled); if that drops
// below the minimum width, clamp the width so the over-tall result scrolls within the hover.
async function hoverImageWidth(uri: vscode.Uri): Promise<number> {
  const dims = await fs
    .readFile(uri.fsPath)
    .then((bytes) => imageSize(bytes))
    .catch(() => undefined);
  if (!dims || dims.width < 1 || dims.height < 1) return HOVER_IMAGE_MAX_WIDTH;
  const scale = Math.min(
    1,
    HOVER_IMAGE_MAX_WIDTH / dims.width,
    hoverImageMaxHeight() / dims.height,
  );
  const width = Math.round(dims.width * scale);
  if (width >= HOVER_IMAGE_MIN_WIDTH) return width;
  return Math.min(HOVER_IMAGE_MIN_WIDTH, dims.width);
}

function firstLines(text: string, n: number): string {
  return text.split(/\r?\n/).slice(0, n).join('\n');
}
