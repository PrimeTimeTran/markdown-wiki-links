// import * as fs from "fs";
// import { slugify } from "../core/blocks/headingExtractor";
// import { sliceSection } from "../core/blocks/sectionSlice";
// import { stripFrontmatter } from "../core/frontmatter";
// import { resolveTarget, relSuffixMatches, IndexSnapshot } from "../core/resolver/resolveTarget";
import * as path from "path";

import * as vscode from "vscode";

import { IndexSnapshot } from "../core/resolver/resolveTarget";
import { EmbedResolved } from "../markdownItPlugin/wikiRule";
import { EstateEntry, WikiResolver } from "./indexService";
import { IndexService } from "./indexService";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

export function createPreviewResolver(resolver: WikiResolver) {
  return {
    resolveLink: (fromFsPath: string, target: string, fragment?: string) => {
      return resolver.resolveLink(fromFsPath, target, fragment);
    },
    resolveEmbed: (fromFsPath: string, key: string) => {
      const [target, fragment] = key.split("#");
      const entry = resolver.resolve(target);
      if (!entry) {
        return null;
      }
      if (IMAGE_RE.test(entry.uri.fsPath)) {
        return resolveImage(entry, resolver.root);
      }
      return resolveMarkdownEmbed(entry.uri.fsPath, fragment);
    },
  };
}

function resolveImage(entry: EstateEntry, workspaceRoot: string): EmbedResolved | null {
  const fsPath = entry.uri.fsPath;
  if (!IMAGE_RE.test(fsPath)) {
    return null;
  }

  // if (!isInsideWorkspaceRealSync(entry.uri)) {
  //   return null;
  // }

  if (!entry.uri) return null;

  const src = "/" + path.relative(workspaceRoot, fsPath).split(path.sep).join("/");

  return {
    kind: "image",
    src,
  };
}

function snapshotFrom(idx: IndexService, fromFsPath: string): IndexSnapshot {
  return idx.snapshotFor(fromFsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "");
}

function basePath(fromFsPath: string, snap: IndexSnapshot): string {
  return fromFsPath || path.join(snap.workspaceRoot, "_.md");
}
