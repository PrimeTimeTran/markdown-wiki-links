import * as vscode from 'vscode';

import { IndexService } from './adapters/indexService';
import { WikiDocumentLinkProvider } from './adapters/documentLinkProvider';
import { WikiHoverProvider } from './adapters/hoverProvider';
import { RenameHandler } from './adapters/renameHandler';
import { createPreviewEmbedResolver } from './adapters/previewEmbedResolver';
import { WikiDiagnostics } from './adapters/diagnostics';
import { extendMarkdownIt as wireMarkdownIt, setResolver } from './markdownItPlugin/index';

let indexService: IndexService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  indexService = new IndexService();
  await indexService.initialize();
  context.subscriptions.push(indexService);
  context.subscriptions.push(
    vscode.commands.registerCommand('wikiLinks.rebuildIndex', () => indexService?.refresh()),
    vscode.languages.registerDocumentLinkProvider(
      { language: 'markdown' },
      new WikiDocumentLinkProvider(indexService),
    ),
    vscode.languages.registerHoverProvider(
      { language: 'markdown' },
      new WikiHoverProvider(indexService),
    ),
  );
  new RenameHandler().register(context);
  new WikiDiagnostics(indexService).register(context);
}

export function deactivate(): void {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extendMarkdownIt(md: any): any {
  if (indexService) setResolver(createPreviewEmbedResolver(indexService));
  return wireMarkdownIt(md);
}
