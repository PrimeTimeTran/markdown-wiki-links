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
    // VSCode does not expose the source document at tokenization time — env.currentDocument is
    // undefined for core rules. Resolved output paths are therefore workspace-root-absolute
    // (leading slash) rather than document-relative. The read is kept for forward compatibility.
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
      // Emit a markdown image token (not raw <img>) so VSCode's preview rewrites the src
      // to a webview-loadable resource URI. Raw HTML img srcs are not rewritten.
      return `![${mdEscape(target)}](${r.src})`;
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
