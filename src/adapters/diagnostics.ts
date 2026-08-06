import * as vscode from "vscode";

import { buildFenceMask } from "../core/fenceMask";
import { parseLinks } from "../core/parser/linkParser";
import { IndexService } from "./indexService";

// Edits fire onDidChangeTextDocument on every keystroke; coalesce re-parsing to one run per
// idle window so fast typing in a large document does not re-scan it on each character.
const DEBOUNCE_MS = 300;

export class WikiDiagnostics {
  private coll = vscode.languages.createDiagnosticCollection("wikiLinks");
  private estateDiag = vscode.languages.createDiagnosticCollection("estate");
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
    if (doc.languageId !== "markdown") return;
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
    if (doc.languageId !== "markdown") return;

    const text = doc.getText();
    const resolver = this.idx.getResolver();
    const mask = buildFenceMask(text);

    const diags: vscode.Diagnostic[] = [];

    for (const r of parseLinks(text, mask)) {
      const entry = resolver.resolveLink(
        {
          target: r.target,
          fragment: r.fragment,
        },
        doc.uri.fsPath,
      );

      if (!entry) {
        const range = new vscode.Range(doc.positionAt(r.range.start), doc.positionAt(r.range.end));
        const diagnostic = new vscode.Diagnostic(
          range,
          `Unresolved link for "${r.target}". Create an estate bookmark for use in all future workspaces or just this one.`,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.code = "estate.unresolved-estate-link";
        // this.estateDiag.set(diagnostic);
        this.estateDiag.set(doc.uri, [diagnostic]);
        let wikiMsg = new vscode.Diagnostic(
          range,
          `Unresolved wiki-link: "${r.target}"`,
          vscode.DiagnosticSeverity.Information,
        );
        wikiMsg.code = "estate.unresolved-wikilink";
        diags.push(wikiMsg);
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
