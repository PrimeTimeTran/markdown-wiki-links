import path from "node:path";

import type MarkdownIt from "markdown-it";
import * as vscode from "vscode";

import { WikiResolver } from "../adapters/indexService";
import { slugify } from "../core/blocks/headingExtractor";
import { wikiPlugin } from "./wikiRule";

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

export function extendMarkdownIt(
  md: MarkdownIt,
  maxDepth?: number,
  getDocumentPath?: () => string | undefined,
): MarkdownIt {
  const resolver = {
    resolveEmbed(from: string, key: string, hint?: string) {
      const [target, fragment] = key.split("#");

      return activeResolver.resolveEmbed(target, fragment);
    },

    resolveLink(from: string, target: string, fragment?: string) {
      const entry = activeResolver.resolveLink(
        {
          target,
          fragment,
        },
        from,
      );

      if (!entry) {
        return null;
      }

      let href =
        "/" +
        path
          .relative(vscode.workspace.workspaceFolders![0].uri.fsPath, entry.uri.fsPath)
          .split(path.sep)
          .join("/");

      if (fragment && !fragment.startsWith("^")) {
        href += "#" + slugify(fragment);
      }

      return href;
    },
  };

  return md.use(wikiPlugin, {
    resolver,
    maxDepth,
    getDocumentPath,
  });
}
