import * as vscode from 'vscode';

import { IndexService } from './adapters/indexService';
import { WikiDocumentLinkProvider } from './adapters/documentLinkProvider';
import { WikiHoverProvider } from './adapters/hoverProvider';
import { RenameHandler } from './adapters/renameHandler';
import { createPreviewResolver } from './adapters/previewResolver';
import { WikiDiagnostics } from './adapters/diagnostics';
import { WikiCompletionProvider } from './adapters/completionProvider';
import { WikiDecorations } from './adapters/decorations';
import {
  extendMarkdownIt as wireMarkdownIt,
  setResolver,
  resetResolver,
} from './markdownItPlugin/index';

let indexService: IndexService | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WikiLinksApi = { extendMarkdownIt(md: any): any };

export async function activate(context: vscode.ExtensionContext): Promise<WikiLinksApi> {
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
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown' },
      new WikiCompletionProvider(indexService),
      '[',
      '/',
    ),
  );
  new RenameHandler().register(context);
  new WikiDiagnostics(indexService).register(context);
  new WikiDecorations(indexService).register(context);

  // VSCode reads `extendMarkdownIt` off the extension's exports — i.e. activate's return value.
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extendMarkdownIt(md: any): any {
      if (indexService) setResolver(createPreviewResolver(indexService));
      return wireMarkdownIt(md, embedMaxDepth());
    },
  };
}

export function deactivate(): void {
  // Release the markdown-it resolver closure so it stops pinning the IndexService.
  resetResolver();
  indexService = undefined;
}

const DEFAULT_EMBED_MAX_DEPTH = 3;

function embedMaxDepth(): number {
  const configured = vscode.workspace
    .getConfiguration('wikiLinks')
    .get<number>('embed.maxDepth', DEFAULT_EMBED_MAX_DEPTH);
  return typeof configured === 'number' && configured >= 1 ? configured : DEFAULT_EMBED_MAX_DEPTH;
}
