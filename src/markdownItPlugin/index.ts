import type MarkdownIt from 'markdown-it';

import { embedPlugin, ResolveFn } from './embedRule';

let activeResolve: ResolveFn = () => null;

export function setResolver(r: ResolveFn): void {
  activeResolve = r;
}

export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  return md.use(embedPlugin, { resolve: (k: string, h?: string) => activeResolve(k, h) });
}
