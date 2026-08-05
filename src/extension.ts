import {
  setLoggerConfig,
  setLoggerOutput,
  createTrace,
  getLoggerConfig,
} from "@primetimetran/logger";
import * as vscode from "vscode";

// import { WikiDecorations } from "./adapters/decorations";
// import { OwnershipInlayProvider } from "./ownership";
import { OwnershipCodeActionProvider } from "./adapters/codeAction";
import { WikiCompletionProvider } from "./adapters/completionProvider";
// import { WikiDocumentLinkProvider } from "./adapters/documentLinkProvider";
import { WikiDiagnostics } from "./adapters/diagnostics";
import { WikiHoverProvider } from "./adapters/hoverProvider";
import { newEditorGroupTabContent } from "./adapters/htmlAnchor";
// import { WikiCodeLensProvider } from "./adapters/codelens";
import { IndexService } from "./adapters/indexService";
import { createPreviewResolver } from "./adapters/previewResolver";
import { RenameHandler } from "./adapters/renameHandler";
import { AppStore, registerGiantQuickPickCommand } from "./app";
import { longLangs, supportedLanguages } from "./consts";
import { OwnershipContentProvider, OwnershipEngine, showOwnershipView } from "./diff";
import { EstateContext } from "./estate";
import {
  extendMarkdownIt as wireMarkdownIt,
  setResolver,
  resetResolver,
} from "./markdownItPlugin/index";

export let indexService: IndexService | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WikiLinksApi = { extendMarkdownIt(md: any): any };

export function setupExtensionLogger(pipeline: string, stream: string) {
  const channel = vscode.window.createOutputChannel(pipeline);
  channel.show(true);

  // Match the exact stream name to guarantee it passes shouldLog()
  setLoggerConfig({
    LOG_LEVEL: "debug",
    TRACE_ENABLED: true,
    LOG_NAMESPACE: stream,
  });

  setLoggerOutput((...args: any[]) => {
    const message = args
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg, null, 2)))
      .join(" ");
    channel.appendLine(message);
  });

  channel.appendLine(`[INIT] Pipeline: ${pipeline}, Stream: ${stream}`);
  channel.appendLine(`[Preflight] Config Active: ${JSON.stringify(getLoggerConfig(), null, 2)}`);

  return {
    trace: createTrace(stream),
    channel,
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<WikiLinksApi> {
  const { trace, channel } = setupExtensionLogger("Flowify", "ext:activate");
  context.subscriptions.push(channel);

  trace.mark("[ext.activate]");
  trace.debug("activate using logger debug");
  trace.info("activate using logger info");
  trace.warn("activate using logger warn");
  trace.error("activate using logger error");
  // vscode.window.onDidChangeTextEditorSelection((event) => {
  //   // Captures the active cursor position, which updates upon a right-click
  //   const position = event.selections[0].active;
  //   console.log(`Cursor moved to Line: ${position.line}, Character: ${position.character}`);
  // });

  indexService = new IndexService();
  await indexService.initialize();
  const app = new AppStore(context, trace, indexService);
  app.init(context);
  app.logger.debug("[activate.app.logger]");

  context.subscriptions.push(
    vscode.commands.registerCommand("estate.start", async () => {
      let num = await app.bumpLeader();
      vscode.window.showInformationMessage(`estate.start ${num}`);
      await vscode.commands.executeCommand("setContext", "estate.leader", app.state.leader);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("estate.stop", async () => {
      let num = await app.bumpLeader();
      vscode.window.showInformationMessage(`estate.stop ${num}`);
      await vscode.commands.executeCommand("setContext", "estate.leader", app.state.leader);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("estate.clear", async () => {
      let num = await app.bumpLeader();
      vscode.window.showInformationMessage(`estate.clear ${num}`);
      await vscode.commands.executeCommand("setContext", "estate.leader", app.state.leader);
    }),
  );
  registerGiantQuickPickCommand(context, app);
  const ownershipEngine = new OwnershipEngine();
  const ownershipProvider = new OwnershipContentProvider(ownershipEngine);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("estate", ownershipProvider),
    vscode.commands.registerCommand("estate.showOwnership", showOwnershipView),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const ownershipUri = vscode.Uri.parse(`estate://ownership${e.document.uri.path}`);
      ownershipProvider.refresh(ownershipUri);
    }),
    vscode.languages.registerCodeActionsProvider("rust", new OwnershipCodeActionProvider()),
    vscode.commands.registerCommand("estate.testOwnershipAction", (...args) => {
      console.log("COMMAND FIRED", args);
      vscode.window.showInformationMessage("Ownership command fired");
    }),
  );
  // Commands
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
    context.subscriptions.push(
      vscode.commands.registerCommand(command, (ctx) => {
        console.log("[ESTATE COMMAND]", command, ctx);
      }),
    );
  });

  let store = app.anchors;
  // We accept the inserted wrapping () to prevent having to use context.subscriptions.push everywhere
  // oxlint-disable-next-line no-unused-expressions
  (context.subscriptions.push(
    vscode.commands.registerCommand("ui.addInlinePanel", (ctx: { id: string }) => {
      const anchor = app.anchors.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Inline: ${anchor.label}`);
    }),
  ),
    vscode.commands.registerCommand("estate.addPersistentNotification", (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Pinned: ${anchor.label}`);
    }),
    vscode.commands.registerCommand("estate.openTextAndIconPanel", (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Panel: ${anchor.label}`);
    }),
    vscode.commands.registerCommand("ui.openQuickpickDropdown", (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showQuickPick([
        `🧩 Inline ${anchor.label}`,
        `🕸 Graph ${anchor.label}`,
        `♻️ Replace ${anchor.label}`,
        `💾 Save ${anchor.label}`,
      ]);
    }),
    vscode.commands.registerCommand("estate.contentSave", (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Save content for ${anchor.label}`);
    }),
    vscode.commands.registerCommand("estate.contentCycle", (ctx: { id: string }) => {
      const anchor = store.get(ctx.id);
      if (!anchor) return;
      vscode.window.showInformationMessage(`Cycle variants for ${anchor.label}`);
    }),
    vscode.commands.registerCommand("estate.contentReplace", (ctx: { id: string }) => {
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
    vscode.commands.registerCommand("wikiLinks.rebuildIndex", () => indexService?.refresh()),
    vscode.commands.registerCommand("wiki.showGraph", (ctx: EstateContext) => {
      vscode.window.showInformationMessage(`Graph for ${ctx.anchor}`);
    }),
    vscode.commands.registerCommand("ui.pinnable", (ctx: { id: string }) => {
      const flag = store.getFlag(ctx.id);
      if (!flag) return;
      vscode.window.showInformationMessage(`Pinnable for ${flag?.label}`);
    }),
    vscode.commands.registerCommand("ui.pick", (ctx) => {
      const anchor = store.get(ctx.id);
      vscode.window.showQuickPick([
        `🏠 ${anchor?.label}`,
        "🕸 Graph",
        "📄 Open Body",
        "🌿 Branches",
      ]);
    }),
    vscode.commands.registerCommand("ui.toggleMDPreview", async () => {
      app.toggleMdPreview();
      const editor = vscode.window.activeTextEditor;

      if (editor && editor.document.languageId === "markdown" && app.isMdPreviewEnabled()) {
        await vscode.commands.executeCommand("markdown.togglePreview", editor.document.uri);
      }
    }),
    vscode.languages.registerHoverProvider(longLangs, {
      provideHover(document, position) {
        const line = document.lineAt(position.line).text;
        if (line.includes("@hover")) {
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
      "[",
      "/",
      "#",
      "^",
    ),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return;
      if (!app.isMdPreviewEnabled()) return;
      if (!supportedLanguages.includes(editor.document.languageId)) return;
      await vscode.commands.executeCommand("markdown.togglePreview", editor.document.uri);
    }));

  context.subscriptions.push(indexService);
  new RenameHandler().register(context);
  new WikiDiagnostics(indexService).register(context);
  app.decorator.register(context);

  // let inlineProvider = new OwnershipInlayProvider(app);
  //   context.subscriptions.push(
  //     vscode.languages.registerInlayHintsProvider({ language: 'rust' }, inlineProvider),
  //   );

  // VSCode reads `extendMarkdownIt` off the extension's exports — i.e. activate's return value.
  // context.subscriptions.push(trace);
  app.logger.debug("[activate.end]");
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
    .getConfiguration("wikiLinks")
    .get<number>("embed.maxDepth", DEFAULT_EMBED_MAX_DEPTH);
  return typeof configured === "number" && configured >= 1 ? configured : DEFAULT_EMBED_MAX_DEPTH;
}
