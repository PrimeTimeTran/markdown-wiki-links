import * as vscode from 'vscode';

import { IndexService } from './adapters/indexService';

let indexService: IndexService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  indexService = new IndexService();
  await indexService.initialize();
  context.subscriptions.push(indexService);
  context.subscriptions.push(
    vscode.commands.registerCommand('wikiLinks.rebuildIndex', () => indexService?.refresh()),
  );
}

export function deactivate(): void {}

export function extendMarkdownIt(md: unknown): unknown {
  return md;
}
