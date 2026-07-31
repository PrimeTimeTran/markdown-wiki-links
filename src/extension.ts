import * as vscode from 'vscode';

import { IndexService } from './adapters/indexService';
import { RenameHandler } from './adapters/renameHandler';
import { createPreviewResolver } from './adapters/previewResolver';
import { WikiHoverProvider } from './adapters/hoverProvider';
import { WikiDocumentLinkProvider } from './adapters/documentLinkProvider';
import { WikiDiagnostics } from './adapters/diagnostics';
import { WikiCompletionProvider } from './adapters/completionProvider';
import { WikiCodeLensProvider } from './adapters/codelens';
import { BookmarkStore } from './adapters/bookmarkService';
import {
  extendMarkdownIt as wireMarkdownIt,
  setResolver,
  resetResolver,
} from './markdownItPlugin/index';
import { ActivityStore } from './adapters/activityService';
import { EstateContext, EstateNode, EstateTreeProvider, showEstatePanel } from './adapters/estate';
import { StateStore } from './adapters/stateService';
import { WikiDecorations } from './adapters/decorations';
import { OwnershipInlayProvider } from './ownership';

let indexService: IndexService | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WikiLinksApi = { extendMarkdownIt(md: any): any };

export async function activate(context: vscode.ExtensionContext): Promise<WikiLinksApi> {
  const state = new StateStore();
  indexService = new IndexService();
  await indexService.initialize();
  const store = new BookmarkStore();
  store.init();
  const activityStore = new ActivityStore();
  activityStore.init(context);
  const codeLens = new WikiCodeLensProvider(context, store, activityStore);
  const tree = new EstateTreeProvider(store);
  const view = vscode.window.createTreeView<EstateNode>('estateExplorer', {
    treeDataProvider: tree,
  });
  context.subscriptions.push(view);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: 'markdown' }, { language: 'rust' }],
      codeLens,
    ),
    vscode.languages.registerDocumentLinkProvider(
      { language: 'markdown' },
      new WikiDocumentLinkProvider(indexService),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ui.addInlinePanel', (ctx: { id: string }) => {
      const bookmark = store.get(ctx.id);
      if (!bookmark) return;
      vscode.window.showInformationMessage(`Inline: ${bookmark.label}`);
    }),
    vscode.commands.registerCommand('ui.openInNewEditorGroup', async (ctx: EstateContext) => {
      const bookmark = store.get(ctx.bookmark);
      if (!bookmark) {
        vscode.window.showWarningMessage(`Unknown estate: ${ctx.bookmark}`);
        return;
      }

      await showEstatePanel(bookmark);

      vscode.window.showInformationMessage(`Editor Group: ${bookmark.label}`);
    }),
    vscode.commands.registerCommand('estate.addPersistentNotification', (ctx: { id: string }) => {
      const bookmark = store.get(ctx.id);
      if (!bookmark) return;
      vscode.window.showInformationMessage(`Pinned: ${bookmark.label}`);
    }),
    vscode.commands.registerCommand('estate.openTextAndIconPanel', (ctx: { id: string }) => {
      const bookmark = store.get(ctx.id);
      if (!bookmark) return;
      vscode.window.showInformationMessage(`Panel: ${bookmark.label}`);
    }),
    vscode.commands.registerCommand('ui.openQuickpickDropdown', (ctx: { id: string }) => {
      const bookmark = store.get(ctx.id);
      if (!bookmark) return;
      vscode.window.showQuickPick([
        `🧩 Inline ${bookmark.label}`,
        `🕸 Graph ${bookmark.label}`,
        `♻️ Replace ${bookmark.label}`,
        `💾 Save ${bookmark.label}`,
      ]);
    }),
    vscode.commands.registerCommand('estate.contentSave', (ctx: { id: string }) => {
      const bookmark = store.get(ctx.id);
      if (!bookmark) return;
      vscode.window.showInformationMessage(`Save content for ${bookmark.label}`);
    }),
    vscode.commands.registerCommand('estate.contentCycle', (ctx: { id: string }) => {
      const bookmark = store.get(ctx.id);
      if (!bookmark) return;
      vscode.window.showInformationMessage(`Cycle variants for ${bookmark.label}`);
    }),
    vscode.commands.registerCommand('estate.contentReplace', (ctx: { id: string }) => {
      const bookmark = store.get(ctx.id);
      if (!bookmark) return;

      vscode.window.showInformationMessage(`Replace using ${bookmark.label}`);
    }),
    vscode.commands.registerCommand(
      'estate.addBookmark',
      async (uri: vscode.Uri, range: vscode.Range) => {
        console.log('ADD BOOKMARK', { uri, range });
        await store.addBookmark(context);
        codeLens.refresh();
      },
    ),

    // vscode.commands.registerCommand(
    //   'estate.toggleFold',
    //   async (uri: vscode.Uri, range: vscode.Range) => {
    //     const editor = vscode.window.visibleTextEditors.find(
    //       (e) => e.document.uri.toString() === uri.toString(),
    //     );
    //     if (!editor) {
    //       return;
    //     }
    //     await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    //     const folded = codeLens.isFolded(uri, range);
    //     editor.selection = new vscode.Selection(range.start, range.start);
    //     editor.revealRange(range);
    //     if (folded) {
    //       await vscode.commands.executeCommand('editor.unfold');
    //     } else {
    //       await vscode.commands.executeCommand('editor.fold');
    //     }
    //     codeLens.setFolded(uri, range, !folded);
    //     codeLens.refresh();
    //   },
    // ),
    vscode.commands.registerCommand('wikiLinks.rebuildIndex', () => indexService?.refresh()),
    vscode.commands.registerCommand('wiki.showGraph', (ctx: EstateContext) => {
      vscode.window.showInformationMessage(`Graph for ${ctx.bookmark}`);
    }),
    vscode.commands.registerCommand('ui.pinnable', (ctx: { id: string }) => {
      const flag = store.getFlag(ctx.id);
      if (!flag) return;
      vscode.window.showInformationMessage(`Pinnable for ${flag?.label}`);
    }),
    vscode.commands.registerCommand('ui.pick', (ctx) => {
      const bookmark = store.get(ctx.id);
      vscode.window.showQuickPick([
        `🏠 ${bookmark?.label}`,
        '🕸 Graph',
        '📄 Open Body',
        '🌿 Branches',
      ]);
    }),
    vscode.commands.registerCommand('ui.toggleMDPreview', async () => {
      state.toggleMdPreview();

      const editor = vscode.window.activeTextEditor;

      if (editor && editor.document.languageId === 'markdown' && state.isMdPreviewEnabled()) {
        await vscode.commands.executeCommand('markdown.togglePreview', editor.document.uri);
      }
    }),
    vscode.languages.registerHoverProvider(
      { language: 'markdown' },
      {
        provideHover(document, position) {
          const line = document.lineAt(position.line).text;
          if (line.includes('@hover')) {
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(newEditorGroupTabContent);
            return new vscode.Hover(md);
          }
        },
      },
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
      '#',
      '^',
    ),
  );
  vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!editor) return;
    if (!state.isMdPreviewEnabled()) return;
    if (editor.document.languageId !== 'markdown') return;
    await vscode.commands.executeCommand('markdown.togglePreview', editor.document.uri);
  });

  context.subscriptions.push(indexService);
  new RenameHandler().register(context);
  new WikiDiagnostics(indexService).register(context);
  const decorations = new WikiDecorations(indexService, store, context, activityStore);
  decorations.register(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('flowify.analyzeLine', decorations.analyzeLine),
  );

  //   context.subscriptions.push(
  //     vscode.languages.registerCodeLensProvider(
  //       [{ language: 'markdown' }, { language: 'rust' }],
  //       codeLens,
  //     ),
  //     vscode.languages.registerDocumentLinkProvider(
  //       { language: 'markdown' },
  //       new WikiDocumentLinkProvider(indexService),
  //     ),
  //   );

  let inlineProvider = new OwnershipInlayProvider(context, state, activityStore, store);
  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider({ language: 'rust' }, inlineProvider),
  );

  // VSCode reads `extendMarkdownIt` off the extension's exports — i.e. activate's return value.
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extendMarkdownIt(md: any): any {
      if (indexService) setResolver(createPreviewResolver(indexService));
      // VSCode never tells a contributed markdown-it plugin which file a preview is rendering,
      // so supply it here: the previewed file is the active text editor (the preview opens
      // beside its source). Lets the embed-cycle guard catch a file that embeds itself.
      return wireMarkdownIt(
        md,
        embedMaxDepth(),
        () => vscode.window.activeTextEditor?.document.uri.fsPath,
      );
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

const newEditorGroupTabContent = `
## 🏠 Foo Architecture

Foo desc

**Context**

Foo context

[Open Graph](command:wiki.showGraph)
      `;
export function logAnalysis(
  outputChannel: vscode.OutputChannel,
  filePath: string,
  lineNumber: string,
  result: any,
) {
  const timestamp = new Date().toLocaleTimeString();
  const fileName = filePath.split('/').pop() || filePath;

  outputChannel.appendLine(`[⚡ xxx FLOWIFY] ${timestamp} — Analysis Complete`);
  outputChannel.appendLine(`  💡 File   : ${fileName}`);
  outputChannel.appendLine(`  📂 Path   : ${filePath}`);
  outputChannel.appendLine(`  📍 Line   : ${lineNumber}`);
  outputChannel.appendLine(`  🚀 Action : ${result.action || 'N/A'}`);
  outputChannel.appendLine(`  📊 METRICS:`);
  outputChannel.appendLine(`     ├── Complexity : ${result.metrics?.complexity ?? 0}`);
  outputChannel.appendLine(`     └── AST Nodes  : ${result.metrics?.ast_nodes ?? 0}`);
  outputChannel.appendLine(``);
}
