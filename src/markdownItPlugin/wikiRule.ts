import type MarkdownIt from 'markdown-it';

import { splitFrontmatter } from '../core/frontmatter';

export type EmbedResolved =
  | { kind: 'markdown'; text: string; sourcePath: string }
  | { kind: 'image'; src: string };

export type WikiResolver = {
  // Resolve an embed (![[...]]). `key` is `target` or `target#fragment`.
  resolveEmbed: (fromFsPath: string, key: string, sizeHint?: string) => EmbedResolved | null;
  // Resolve a link ([[...]]) to an href the Markdown preview can navigate; null = unresolved.
  resolveLink: (fromFsPath: string, target: string, fragment?: string) => string | null;
};

const EMBED_RE = /!\[\[([^[\]|#\r\n]+)(?:#([^[\]|\r\n]+))?(?:\|([^[\]\r\n]+))?\]\]/g;
const LINK_RE = /(?<!!)\[\[([^[\]|#\r\n]*)(?:#([^[\]|\r\n]+))?(?:\|([^[\]\r\n]+))?\]\]/g;

export function wikiPlugin(
  md: MarkdownIt,
  opts: { resolver: WikiResolver; maxDepth?: number },
): void {
  const maxDepth = opts.maxDepth ?? 3;
  md.core.ruler.before('normalize', 'wiki-links', (state) => {
    // VSCode does not expose the source document at tokenization time — env.currentDocument is
    // undefined for core rules. Resolved output paths are therefore workspace-root-absolute
    // (leading slash) rather than document-relative. The read is kept for forward compatibility.
    const env = state.env as { currentDocument?: { fsPath?: string } } | undefined;
    const from = env?.currentDocument?.fsPath ?? '';
    // Leave a leading YAML frontmatter block untouched — rewriting a [[...]] value there would
    // corrupt the metadata (escaped markdown is not valid YAML).
    const { frontmatter, body } = splitFrontmatter(state.src);
    state.src = frontmatter + expand(body, opts.resolver, from, maxDepth, new Set<string>());
  });
  // Embed size hints are carried as a `wl-size:` image title (no markdown syntax expresses image
  // dimensions); this rule turns that title into real width/height attributes after tokenization.
  md.core.ruler.push('wiki-image-size', applyImageSizes);
}

type AttrToken = {
  type: string;
  children?: AttrToken[] | null;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
  attrIndex(name: string): number;
  attrs: [string, string][] | null;
};

const SIZE_TITLE_RE = /^wl-size:(\d+)(?:x(\d+))?$/;

function applyImageSizes(state: { tokens: AttrToken[] }): void {
  for (const block of state.tokens) {
    for (const tok of block.children ?? []) {
      if (tok.type !== 'image') continue;
      const m = (tok.attrGet('title') ?? '').match(SIZE_TITLE_RE);
      if (!m) continue;
      tok.attrSet('width', m[1]);
      if (m[2]) tok.attrSet('height', m[2]);
      const titleIndex = tok.attrIndex('title');
      if (titleIndex >= 0 && tok.attrs) tok.attrs.splice(titleIndex, 1);
    }
  }
}

function expand(
  src: string,
  resolver: WikiResolver,
  fromFsPath: string,
  depth: number,
  ancestors: Set<string>,
): string {
  return rewriteLinks(
    expandEmbeds(src, resolver, fromFsPath, depth, ancestors),
    resolver,
    fromFsPath,
  );
}

function expandEmbeds(
  src: string,
  resolver: WikiResolver,
  fromFsPath: string,
  depth: number,
  ancestors: Set<string>,
): string {
  if (depth <= 0) return src.replace(EMBED_RE, '> ⚠️ Embed depth exceeded');
  return src.replace(EMBED_RE, (_full, target, fragment, sizeHint) => {
    const key = fragment ? `${target}#${fragment}` : target;
    const r = resolver.resolveEmbed(fromFsPath, key, sizeHint);
    if (!r) return `*Unresolved embed: ${mdEscape(target)}*`;
    if (r.kind === 'image') {
      // Emit a markdown image token (not raw <img>) so VSCode's preview rewrites the src to a
      // webview-loadable resource URI. The <> destination form tolerates spaces in the path; the
      // size hint rides along as a title that the wiki-image-size rule converts to width/height.
      const size = sizeHint && /^\d+(?:x\d+)?$/.test(sizeHint) ? ` "wl-size:${sizeHint}"` : '';
      return `![${mdEscape(target)}](<${r.src}>${size})`;
    }
    if (ancestors.has(r.sourcePath)) return `> ⚠️ Cyclic embed: ${mdEscape(target)}`;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(r.sourcePath);
    // Embedded content resolves its own [[links]] / ![[embeds]] relative to the embedded file.
    return expand(r.text, resolver, r.sourcePath, depth - 1, nextAncestors);
  });
}

function rewriteLinks(src: string, resolver: WikiResolver, fromFsPath: string): string {
  return src.replace(LINK_RE, (_full, target, fragment, display) => {
    const t = (target as string).trim();
    const frag = (fragment as string | undefined)?.trim();
    const label = (display as string | undefined)?.trim() ?? labelFor(t, frag);
    const href = resolver.resolveLink(fromFsPath, t, frag);
    if (!href) return mdEscape(label); // unresolved → plain text, no link
    return `[${mdEscape(label)}](<${href}>)`;
  });
}

function labelFor(target: string, fragment?: string): string {
  if (target === '') return fragment ?? '';
  return fragment ? `${target} › ${fragment}` : target;
}

// Escape characters that have special meaning in markdown inline-text positions.
function mdEscape(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}
