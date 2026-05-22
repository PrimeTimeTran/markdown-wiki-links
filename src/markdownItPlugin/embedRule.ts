import type MarkdownIt from 'markdown-it';

export type Resolved =
  | { kind: 'markdown'; text: string; sourcePath: string }
  | { kind: 'image'; src: string };
export type ResolveFn = (targetWithOptionalFragment: string, sizeHint?: string) => Resolved | null;

const EMBED_RE = /!\[\[([^[\]|#\r\n]+)(?:#([^[\]|\r\n]+))?(?:\|([^[\]\r\n]+))?\]\]/g;

export function embedPlugin(md: MarkdownIt, opts: { resolve: ResolveFn; maxDepth?: number }): void {
  const maxDepth = opts.maxDepth ?? 3;
  md.core.ruler.before('normalize', 'wiki-embed-preprocess', (state) => {
    state.src = expand(state.src, opts.resolve, maxDepth, new Set<string>());
  });
}

function expand(src: string, resolve: ResolveFn, depth: number, ancestors: Set<string>): string {
  if (depth <= 0) return src.replace(EMBED_RE, '> ⚠️ Embed depth exceeded');
  return src.replace(EMBED_RE, (_full, target, fragment, sizeHint) => {
    const key = fragment ? `${target}#${fragment}` : target;
    const r = resolve(key, sizeHint);
    if (!r) return `*Unresolved embed: ${mdEscape(target)}*`;
    if (r.kind === 'image') {
      const w = sizeHint && /^\d+$/.test(sizeHint) ? ` width="${sizeHint}"` : '';
      return `<img src="${escapeAttr(r.src)}"${w} alt="${escapeAttr(target)}">`;
    }
    if (ancestors.has(r.sourcePath)) return `> ⚠️ Cyclic embed: ${mdEscape(target)}`;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(r.sourcePath);
    return expand(r.text, resolve, depth - 1, nextAncestors);
  });
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
