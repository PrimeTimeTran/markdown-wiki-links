import * as vscode from 'vscode';

import { parseLinks } from '../core/parser/linkParser';
import { resolveTarget } from '../core/resolver/resolveTarget';

import { IndexService } from './indexService';

export class WikiDiagnostics {
  private coll = vscode.languages.createDiagnosticCollection('wikiLinks');

  constructor(private idx: IndexService) {}

  register(ctx: vscode.ExtensionContext): void {
    const update = (doc: vscode.TextDocument): void => {
      if (doc.languageId !== 'markdown') return;
      const text = doc.getText();
      const snap = this.idx.snapshotFor(doc.uri.fsPath);
      const diags: vscode.Diagnostic[] = [];
      for (const r of parseLinks(text)) {
        if (!resolveTarget(r, doc.uri.fsPath, snap)) {
          const range = new vscode.Range(
            doc.positionAt(r.range.start),
            doc.positionAt(r.range.end),
          );
          diags.push(
            new vscode.Diagnostic(
              range,
              'Unresolved or ambiguous wiki-link',
              vscode.DiagnosticSeverity.Information,
            ),
          );
        }
      }
      this.coll.set(doc.uri, diags);
    };
    ctx.subscriptions.push(
      this.coll,
      vscode.workspace.onDidOpenTextDocument(update),
      vscode.workspace.onDidChangeTextDocument((e) => update(e.document)),
      vscode.workspace.onDidCloseTextDocument((d) => this.coll.delete(d.uri)),
    );
    for (const doc of vscode.workspace.textDocuments) update(doc);
  }
}
