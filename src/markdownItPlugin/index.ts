import type MarkdownIt from 'markdown-it';

import { wikiPlugin, WikiResolver } from './wikiRule';

const NULL_RESOLVER: WikiResolver = {
  resolveEmbed: () => null,
  resolveLink: () => null,
};

let activeResolver: WikiResolver = NULL_RESOLVER;

export function setResolver(r: WikiResolver): void {
  activeResolver = r;
}

// Drop the active resolver on deactivate so its closure stops pinning the IndexService.
export function resetResolver(): void {
  activeResolver = NULL_RESOLVER;
}

export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  // Delegate through a stable indirection so setResolver can swap the active resolver later.
  const resolver: WikiResolver = {
    resolveEmbed: (from, key, hint) => activeResolver.resolveEmbed(from, key, hint),
    resolveLink: (from, target, frag) => activeResolver.resolveLink(from, target, frag),
  };
  return md.use(wikiPlugin, { resolver });
}
