import * as vscode from "vscode";

import { AppActivity } from "./activity";
import { AppStore } from "./app";

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
    console.log("[OwnershipInlayProvider.constructor]");
    app.activity.subscribe((activity: AppActivity) => {
      console.log("[-- 8 -- OwnershipInlayProvider.windowClick().provideInlayHints()]");
      if (activity.type == "analysis") {
        this.currentLine = activity.editor.snapshot.line;
      }
      this.refresh();
    });
  }

  public refresh() {
    this._onDidChangeInlayHints.fire();
  }

  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken,
  ): vscode.InlayHint[] {
    const hints: vscode.InlayHint[] = [];
    const line = this.currentLine;
    hints.push(this.createRightAlignedHint(document, line, 80, "🔒 owns: 3 children"));
    hints.push(
      new vscode.InlayHint(new vscode.Position(line, 0), "🔒 Binding", vscode.InlayHintKind.Type),
    );

    hints.push(
      new vscode.InlayHint(
        new vscode.Position(line, 12),
        "👶 2 children",
        vscode.InlayHintKind.Parameter,
      ),
    );

    hints.push(
      new vscode.InlayHint(new vscode.Position(line, 30), "🧠 Stack", vscode.InlayHintKind.Type),
    );

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
export class OwnershipCodeActionProvider implements vscode.CodeActionProvider {
  constructor(ctx: vscode.ExtensionContext) {
    const commands = [
      "estate.ownership.lineage",
      "estate.ast.ancestors",
      "estate.ast.children",
      "estate.ast.siblings",
      "estate.node.pin",
      "estate.node.recent",
      "estate.symbol.references",
      "estate.value.lineage",
      "estate.scope.show",
      "estate.graph.open",
      "estate.symbol.rename",
    ];
    commands.forEach((command) => {
      ctx.subscriptions.push(
        vscode.commands.registerCommand(command, (ctx) => {
          console.log("[ESTATE COMMAND]", command, ctx);
        }),
      );
    });
  }

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const ctx = {
      uri: document.uri.toString(),
      line: range.start.line,
      column: range.start.character,
    };
    return [
      this.action("🔗 Trace ownership lineage", "estate.ownership.lineage", ctx),
      this.action("⬆ Show ancestors", "estate.ast.ancestors", ctx),
      this.action("⬇ Show descendants", "estate.ast.children", ctx),
      this.action("↔ Show siblings", "estate.ast.siblings", ctx),
      this.action("📍 Pin semantic node", "estate.node.pin", ctx),
      this.action("📚 Add to recent", "estate.node.recent", ctx),
      this.action("🔍 Find references", "estate.symbol.references", ctx),
      this.action("🧬 Show value lineage", "estate.value.lineage", ctx),
      this.action("🌳 Show enclosing scope", "estate.scope.show", ctx),
      this.action("📊 Show dependency graph", "estate.graph.open", ctx),
      this.action("📝 Rename semantic symbol", "estate.symbol.rename", ctx),
    ];
  }
  private action(title: string, command: string, ctx: any): vscode.CodeAction {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.Refactor);
    action.command = {
      command,
      title,
      arguments: [ctx],
    };
    return action;
  }
}
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
