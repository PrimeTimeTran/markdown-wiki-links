import * as path from "path";

import * as vscode from "vscode";

export class DecorationService {
  private decorations = new Map<string, vscode.TextEditorDecorationType>();
  constructor(private context: vscode.ExtensionContext) {
    const icons = ["binding", "shadowing"];
    for (const icon of icons) {
      const iconPath = vscode.Uri.file(
        path.join(context.extensionPath, "resources", `${icon}.svg`),
      );

      const decoration = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPath,
        gutterIconSize: "contain",
      });
      this.decorations.set(icon, decoration);
    }
  }
  private markLine(editor: vscode.TextEditor, icon: string, line: number) {
    const decoration = this.decorations.get(icon);
    if (!decoration) {
      console.warn(`Missing decoration: ${icon}`);
      return;
    }
    const range = new vscode.Range(line, 0, line, 0);
    editor.setDecorations(decoration, [range]);
  }
}
