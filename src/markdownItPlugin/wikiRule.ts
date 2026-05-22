import type MarkdownIt from 'markdown-it';

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
    // VSCode's preview puts the source document on env.currentDocument.
    const env = state.env as { currentDocument?: { fsPath?: string } } | undefined;
    const from = env?.currentDocument?.fsPath ?? '';
    state.src = expand(state.src, opts.resolver, from, maxDepth, new Set<string>());
  });
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
      const w = sizeHint && /^\d+$/.test(sizeHint) ? ` width="${sizeHint}"` : '';
      return `<img src="${escapeAttr(r.src)}"${w} alt="${escapeAttr(target)}">`;
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

// Escape characters that have special meaning in HTML attribute values.
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escape characters that have special meaning in markdown inline-text positions.
function mdEscape(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}
