import * as vscode from 'vscode';

import { rankCompletions } from '../core/completion/rankCompletions';

import { IndexService } from './indexService';

export class WikiCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private idx: IndexService) {}

  provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem[] {
    const lineText = doc.lineAt(pos.line).text.slice(0, pos.character);
    const m = lineText.match(/!?\[\[([^[\]\r\n]*)$/);
    if (!m) return [];
    const query = m[1];
    const snap = this.idx.snapshotFor(doc.uri.fsPath);
    const ranked = rankCompletions(query, doc.uri.fsPath, snap);
    return ranked.map((c) => {
      const item = new vscode.CompletionItem(c.label, vscode.CompletionItemKind.File);
      item.insertText = c.insertText;
      item.detail = c.detail;
      item.range = new vscode.Range(pos.translate(0, -query.length), pos);
      return item;
    });
  }
}
