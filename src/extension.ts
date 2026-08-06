import {
  setLoggerConfig,
  setLoggerOutput,
  createTrace,
  getLoggerConfig,
} from "@primetimetran/logger";
import * as vscode from "vscode";

import { CMD } from "../generated/cmd";
import { WikiCompletionProvider } from "./adapters/completionProvider";
import { WikiDiagnostics } from "./adapters/diagnostics";
import { WikiHoverProvider } from "./adapters/hoverProvider";
import { newEditorGroupTabContent } from "./adapters/htmlAnchor";
import { IndexService } from "./adapters/indexService";
import { RenameHandler } from "./adapters/renameHandler";
import { AppStore, registerGiantQuickPickCommand } from "./app";
import { OwnershipCodeActionProvider } from "./codeActionOwnership";
import { longLangs, supportedLanguages } from "./consts";
import { OwnershipContentProvider, OwnershipEngine, showOwnershipView } from "./diff";
import { EstateContext } from "./estate";
import {
  extendMarkdownIt as wireMarkdownIt,
  setResolver,
  resetResolver,
} from "./markdownItPlugin/index";

export let indexService: IndexService | undefined;

type WikiLinksApi = { extendMarkdownIt(md: any): any };

export async function activate(context: vscode.ExtensionContext): Promise<WikiLinksApi> {
  const { trace, channel } = setupExtensionLogger("Flowify", "ext:activate");
  context.subscriptions.push(channel);
  const app = new AppStore(context, trace);
  app.init(context);
  app.logger.debug("[activate.app.logger]");

  context.subscriptions.push(
    vscode.commands.registerCommand("estate.start", async () => {
      await app.bumpLeader();
      await vscode.commands.executeCommand("setContext", "estate.leader", app.state.leader);
    }),
    vscode.commands.registerCommand("estate.stop", async () => {
      await app.bumpLeader();
      await vscode.commands.executeCommand("setContext", "estate.leader", app.state.leader);
    }),
    vscode.commands.registerCommand("estate.clear", async () => {
      await app.bumpLeader();
      await vscode.commands.executeCommand("setContext", "estate.leader", app.state.leader);
    }),
  );
  registerGiantQuickPickCommand(context, app);

  const ownershipEngine = new OwnershipEngine();
  const ownershipProvider = new OwnershipContentProvider(ownershipEngine);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("estate", ownershipProvider),
    vscode.commands.registerCommand(CMD.estate.ownership.show, showOwnershipView),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const ownershipUri = vscode.Uri.parse(`estate://ownership${e.document.uri.path}`);
      ownershipProvider.refresh(ownershipUri);
    }),
    vscode.languages.registerCodeActionsProvider("rust", new OwnershipCodeActionProvider()),
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

  // We accept the inserted wrapping () to prevent having to use context.subscriptions.push everywhere
  context.subscriptions.push(
    vscode.commands.registerCommand("wikiLinks.rebuildIndex", () => app.wiki?.refresh()),
    vscode.commands.registerCommand("wiki.showGraph", (ctx: EstateContext) => {
      vscode.window.showInformationMessage(`Graph for ${ctx.anchor}`);
    }),
    vscode.commands.registerCommand("ui.pinnable", (ctx: { id: string }) => {
      const flag = app.anchors.getFlag(ctx.id);
      if (!flag) return;
      vscode.window.showInformationMessage(`Pinnable for ${flag?.label}`);
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
    vscode.languages.registerHoverProvider(longLangs, new WikiHoverProvider(app.wiki)),
    vscode.languages.registerCompletionItemProvider(
      longLangs,
      new WikiCompletionProvider(app.wiki.resolver),
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
    }),
    app.wiki,
  );

  new RenameHandler().register(context);
  new WikiDiagnostics(app.wiki).register(context);
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
      // if (app.wiki) setResolver(createPreviewResolver(app.wiki.getResolver()));
      if (app.wiki) setResolver(app.wiki.getResolver());
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

export function setupExtensionLogger(pipeline: string, stream: string) {
  const channel = vscode.window.createOutputChannel(pipeline);
  // channel.show(true);
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
