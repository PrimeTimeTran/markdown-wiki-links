import * as vscode from 'vscode';

import { parseLinks } from '../core/parser/linkParser';
import { resolveTarget } from '../core/resolver/resolveTarget';

import { IndexService } from './indexService';

// Edits fire onDidChangeTextDocument on every keystroke; coalesce re-parsing to one run per
// idle window so fast typing in a large document does not re-scan it on each character.
const DEBOUNCE_MS = 300;

export class WikiDiagnostics {
  private coll = vscode.languages.createDiagnosticCollection('wikiLinks');
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private idx: IndexService) {}

  register(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      this.coll,
      vscode.workspace.onDidOpenTextDocument((doc) => this.update(doc)),
      vscode.workspace.onDidChangeTextDocument((e) => this.scheduleUpdate(e.document)),
      vscode.workspace.onDidCloseTextDocument((d) => {
        this.cancel(d.uri.toString());
        this.coll.delete(d.uri);
      }),
      { dispose: () => this.cancelAll() },
    );
    for (const doc of vscode.workspace.textDocuments) this.update(doc);
  }

  private scheduleUpdate(doc: vscode.TextDocument): void {
    if (doc.languageId !== 'markdown') return;
    const key = doc.uri.toString();
    this.cancel(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.update(doc);
      }, DEBOUNCE_MS),
    );
  }

  private update(doc: vscode.TextDocument): void {
    if (doc.languageId !== 'markdown') return;
    const text = doc.getText();
    const snap = this.idx.snapshotFor(doc.uri.fsPath);
    const diags: vscode.Diagnostic[] = [];
    for (const r of parseLinks(text)) {
      if (!resolveTarget(r, doc.uri.fsPath, snap)) {
        const range = new vscode.Range(doc.positionAt(r.range.start), doc.positionAt(r.range.end));
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
  }

  private cancel(key: string): void {
    const t = this.timers.get(key);
    if (t) {
      clearTimeout(t);
      this.timers.delete(key);
    }
  }

  private cancelAll(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
