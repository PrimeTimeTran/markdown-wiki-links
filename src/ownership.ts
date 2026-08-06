import * as vscode from "vscode";

import { AppStore } from "./app";

export const flowitryMode = "";
export const icons = [
  "alias",
  "binding",
  "declaration",
  "identifier",
  "memory",
  "shadowing",
  "symbol",
];
export type SymbolAnnotation = {
  line: number;
  symbol: string;
  roles: ["binding", "owner", "child", "borrow"];
  actions: ["showChildren", "showLineage"];
};
export type SymbolDecoration = {
  kind: "binding" | "shadowing" | "alias";
  state: {
    selected: boolean;
    focused: boolean;
    muted: boolean;
  };
};
export class OwnershipInlayProvider implements vscode.InlayHintsProvider {
  private readonly _onDidChangeInlayHints = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;
  private currentLine = 0;
  constructor(
    private app: AppStore,
    // private ctx: vscode.ExtensionContext,
    // private activityStore: ActivityStore,
    // private anchorStore: AnchorStore,
  ) {
    console.log("OwnershipInlayProvider constructor");
    app.activity.subscribe((activity) => {
      //   console.log('click', activity);
      this.currentLine = activity.editor.line;
      this.refresh();
    });
  }

  public refresh() {
    // console.log('Refreshing inlay hints');
    this._onDidChangeInlayHints.fire();
  }

  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken,
  ): vscode.InlayHint[] {
    // console.log('provideInlayHints', this.currentLine);
    const hints: vscode.InlayHint[] = [];
    const line = this.currentLine;
    hints.push(this.createRightAlignedHint(document, line, 80, "🔒 owns: 3 children"));
    // hints.push(
    //   new vscode.InlayHint(new vscode.Position(line, 0), '🔒 Binding', vscode.InlayHintKind.Type),
    // );

    // hints.push(
    //   new vscode.InlayHint(
    //     new vscode.Position(line, 12),
    //     '👶 2 children',
    //     vscode.InlayHintKind.Parameter,
    //   ),
    // );

    // hints.push(
    //   new vscode.InlayHint(new vscode.Position(line, 30), '🧠 Stack', vscode.InlayHintKind.Type),
    // );

    return hints;
  }
  private createRightAlignedHint(
    document: vscode.TextDocument,
    line: number,
    targetColumn: number,
    text: string,
  ): vscode.InlayHint {
    const lineText = document.lineAt(line).text;
    const currentColumn = lineText.length;
    const padding = Math.max(1, targetColumn - currentColumn);
    const hint = new vscode.InlayHint(
      new vscode.Position(line, currentColumn),
      " ".repeat(padding) + text,
      vscode.InlayHintKind.Type,
    );
    hint.paddingLeft = false;
    hint.paddingRight = false;
    return hint;
  }
}
