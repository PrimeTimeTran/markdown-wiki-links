import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('wikiLinks.rebuildIndex', () => {}));
}

export function deactivate(): void {}

export function extendMarkdownIt(md: unknown): unknown {
  return md;
}
