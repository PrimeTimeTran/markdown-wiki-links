import * as vscode from 'vscode';

import { IndexService } from './adapters/indexService';
import { RenameHandler } from './adapters/renameHandler';
import { createPreviewResolver } from './adapters/previewResolver';
import { WikiHoverProvider } from './adapters/hoverProvider';
import { WikiDocumentLinkProvider } from './adapters/documentLinkProvider';
import { WikiDiagnostics } from './adapters/diagnostics';
import { WikiCompletionProvider } from './adapters/completionProvider';
import { WikiCodeLensProvider } from './adapters/codelens';

import { longLangs, supportedLanguages } from './consts';
import {
  extendMarkdownIt as wireMarkdownIt,
  setResolver,
  resetResolver,
} from './markdownItPlugin/index';
import { EstateContext } from './estate';
import { AppStore, registerGiantQuickPickCommand } from './app';
import { WikiDecorations } from './adapters/decorations';
import { OwnershipInlayProvider } from './ownership';
import { OwnershipCodeActionProvider } from './adapters/codeAction';
import { OwnershipContentProvider, OwnershipEngine, showOwnershipView } from './diff';

let indexService: IndexService | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WikiLinksApi = { extendMarkdownIt(md: any): any };

export async function activate(context: vscode.ExtensionContext): Promise<WikiLinksApi> {
  console.log('activate');
  indexService = new IndexService();
  await indexService.initialize();
  console.log('app');
  const app = new AppStore(context);
  app.init(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('estate.enterLeader', async () => {
      app.enterLeader();
      console.log('[activate].estate.enterLeader', app.input);
      await vscode.commands.executeCommand('setContext', 'estate.leader', app.input);
      app.tree.refresh();
    }),
  );
  registerGiantQuickPickCommand(context, app);
  console.log('ownership');
  const ownershipEngine = new OwnershipEngine();
  const ownershipProvider = new OwnershipContentProvider(ownershipEngine);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('estate', ownershipProvider),
    vscode.commands.registerCommand('estate.showOwnership', showOwnershipView),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const ownershipUri = vscode.Uri.parse(`estate://ownership${e.document.uri.path}`);
      ownershipProvider.refresh(ownershipUri);
    }),
    vscode.languages.registerCodeActionsProvider('rust', new OwnershipCodeActionProvider()),
    vscode.commands.registerCommand('estate.testOwnershipAction', (...args) => {
      console.log('COMMAND FIRED', args);
      vscode.window.showInformationMessage('Ownership command fired');
    }),
  );
  // Commands
  const commands = [
    'estate.ownership.lineage',
    'estate.ast.ancestors',
    'estate.ast.children',
    'estate.ast.siblings',
    'estate.node.pin',
    'estate.node.recent',
    'estate.symbol.references',
    'estate.value.lineage',
    'estate.scope.show',
    'estate.graph.open',
    'estate.symbol.rename',
  ];

  commands.forEach((command) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, (ctx) => {
        console.log('[ESTATE COMMAND]', command, ctx);
      }),
    );
  });

  const codeLens = new WikiCodeLensProvider(app);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(longLangs, codeLens),
    vscode.languages.registerDocumentLinkProvider(
      longLangs,
      new WikiDocumentLinkProvider(indexService),
    ),
  );

  let store = app.anchors;
  // We accept the inserted wrapping () to prevent having to use context.subscriptions.push everywhere
  // oxlint-disable-next-line no-unused-expressions
  (context.subscriptions.push(
    vscode.commands.registerCommand('ui.addInlinePanel', (ctx: { id: string }) => {
      const anchor = app.anchors.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Inline: ${anchor.label}`);
    }),
  ),
    vscode.commands.registerCommand('estate.addPersistentNotification', (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Pinned: ${anchor.label}`);
    }),
    vscode.commands.registerCommand('estate.openTextAndIconPanel', (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Panel: ${anchor.label}`);
    }),
    vscode.commands.registerCommand('ui.openQuickpickDropdown', (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showQuickPick([
        `🧩 Inline ${anchor.label}`,
        `🕸 Graph ${anchor.label}`,
        `♻️ Replace ${anchor.label}`,
        `💾 Save ${anchor.label}`,
      ]);
    }),
    vscode.commands.registerCommand('estate.contentSave', (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Save content for ${anchor.label}`);
    }),
    vscode.commands.registerCommand('estate.contentCycle', (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Cycle variants for ${anchor.label}`);
    }),
    vscode.commands.registerCommand('estate.contentReplace', (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;

      vscode.window.showInformationMessage(`Replace using ${anchor.label}`);
    }),
    // vscode.commands.registerCommand(
    //   'anchor.create',
    //   async (uri: vscode.Uri, range: vscode.Range) => {
    //     console.log('ADD anchor', { uri, range });
    //     await store.create(context);
    //     codeLens.refresh();
    //   },
    // ),

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
      vscode.window.showInformationMessage(`Graph for ${ctx.anchor}`);
    }),
    vscode.commands.registerCommand('ui.pinnable', (ctx: { id: string }) => {
      const flag = store.getFlag(ctx.id);
      if (!flag) return;
      vscode.window.showInformationMessage(`Pinnable for ${flag?.label}`);
    }),
    vscode.commands.registerCommand('ui.pick', (ctx) => {
      const anchor = store.get(ctx.id);
      vscode.window.showQuickPick([
        `🏠 ${anchor?.label}`,
        '🕸 Graph',
        '📄 Open Body',
        '🌿 Branches',
      ]);
    }),
    vscode.commands.registerCommand('ui.toggleMDPreview', async () => {
      app.toggleMdPreview();
      const editor = vscode.window.activeTextEditor;

      if (editor && editor.document.languageId === 'markdown' && app.isMdPreviewEnabled()) {
        await vscode.commands.executeCommand('markdown.togglePreview', editor.document.uri);
      }
    }),
    vscode.languages.registerHoverProvider(longLangs, {
      provideHover(document, position) {
        const line = document.lineAt(position.line).text;
        if (line.includes('@hover')) {
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.appendMarkdown(newEditorGroupTabContent);
          return new vscode.Hover(md);
        }
      },
    }),
    vscode.languages.registerHoverProvider(longLangs, new WikiHoverProvider(indexService)),
    vscode.languages.registerCompletionItemProvider(
      longLangs,
      new WikiCompletionProvider(indexService),
      '[',
      '/',
      '#',
      '^',
    ),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return;
      if (!app.isMdPreviewEnabled()) return;
      if (!supportedLanguages.includes(editor.document.languageId)) return;
      await vscode.commands.executeCommand('markdown.togglePreview', editor.document.uri);
    }));

  context.subscriptions.push(indexService);
  new RenameHandler().register(context);
  new WikiDiagnostics(indexService).register(context);
  const decorations = new WikiDecorations(app, indexService);
  decorations.register(context);

  // let inlineProvider = new OwnershipInlayProvider(app);
  //   context.subscriptions.push(
  //     vscode.languages.registerInlayHintsProvider({ language: 'rust' }, inlineProvider),
  //   );

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

@spam
@foo
@ham

**Context**

Foo context

[Open Graph](command:wiki.showGraph)
      `;
