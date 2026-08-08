import * as fs from "fs/promises";

import * as vscode from "vscode";

import { AppStore } from "../app";
import { lineForFragment } from "../core/blocks/sectionSlice";
import { buildFenceMask } from "../core/fenceMask";
import { parseEmbeds } from "../core/parser/embedParser";
import { parseLinks } from "../core/parser/linkParser";
import { IndexService } from "./indexService";

export class WikiDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(
    private app: AppStore,
    private idx: IndexService,
  ) {}

  async provideDocumentLinks(doc: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
    this.app.click.info("WikiDocumentLinkProvider.provideDocumentLinks");
    const text = doc.getText();
    const mask = buildFenceMask(text);
    const refs = [...parseLinks(text, mask), ...parseEmbeds(text, mask)];

    const resolver = this.idx.getResolver();
    const out: vscode.DocumentLink[] = [];

    for (const r of refs) {
      const entry = resolver.resolveLink(r, doc.uri.fsPath);
      if (!entry) continue;
      const targetUri = entry.linkUri();
      if (!targetUri) continue;
      let final = targetUri;
      if (r.fragment) {
        const fsPath = targetUri.fsPath;
        const targetText = fsPath === doc.uri.fsPath ? text : await safeRead(fsPath);

        const line = lineForFragment(r.fragment, targetText);

        if (line !== undefined) {
          final = targetUri.with({
            fragment: `L${line + 1}`,
          });
        }
      }

      const start = doc.positionAt(r.range.start);
      const end = doc.positionAt(r.range.end);
      let item = new vscode.DocumentLink(new vscode.Range(start, end), final);
      out.push(new vscode.DocumentLink(new vscode.Range(start, end), final));
    }
    return out;
  }
}

async function safeRead(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}
