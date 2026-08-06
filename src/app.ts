import {
  createTrace,
  getLoggerConfig,
  setLoggerConfig,
  setLoggerOutput,
  TraceApi,
} from "@primetimetran/logger";
import * as vscode from "vscode";

import { CMD } from "../generated/cmd";
import { ActivityStore, AppActivity } from "./activity";
import { WikiCodeLensProvider } from "./adapters/codelens";
import { WikiDecorations } from "./adapters/decorations";
import { WikiDocumentLinkProvider } from "./adapters/documentLinkProvider";
import { IndexService } from "./adapters/indexService";
import { AnalysisStore } from "./analysis";
import { Anchor, AnchorPresenter, AnchorStore } from "./anchor";
import { longLangs } from "./consts";
import { VFSDecorator, EstateProvider, VFSProvider } from "./estate";

export interface EstateState {
  mdPreviewMode: boolean;
  focushistory: FocusTarget[];
  leader: number;
}

type FocusTarget = "editor" | "sidebar" | "panel" | "outline" | "terminal";

export class AppStore {
  public state: EstateState = {
    leader: 0,
    focushistory: [],
    mdPreviewMode: false,
  };
  public outputChannel = vscode.window.createOutputChannel("Flowify");
  readonly tree: EstateProvider;
  readonly vfs: VFSProvider;
  readonly vfsDecorator: VFSDecorator;
  readonly decorator: WikiDecorations;
  readonly activity: ActivityStore<AppActivity>;
  readonly analysis: AnalysisStore;
  readonly anchors: AnchorStore;
  readonly presenter: AnchorPresenter;
  readonly codeLens: WikiCodeLensProvider;
  readonly wiki: IndexService;
  readonly logger: TraceApi;
  constructor(public ctx: vscode.ExtensionContext) {
    const { logger, channel } = setupExtensionLogger("Flowify", "ext:activate");
    ctx.subscriptions.push(channel);
    logger.debug("[AppStore.constructor.start]");
    this.logger = logger;

    this.wiki = new IndexService();
    this.activity = new ActivityStore<AppActivity>(this, ctx);
    this.anchors = new AnchorStore(this);
    this.analysis = new AnalysisStore(this);

    this.tree = new EstateProvider(this);
    this.presenter = new AnchorPresenter(this);
    // For sidebar tree
    this.vfs = new VFSProvider(ctx, this);
    // For various icons(menu title)
    this.vfsDecorator = new VFSDecorator(ctx, this);

    this.decorator = new WikiDecorations(this, this.wiki);
    this.codeLens = new WikiCodeLensProvider(this);

    logger.debug("[AppStore.constructor.end]");
  }
  init(context: vscode.ExtensionContext) {
    this.wiki.initialize();
    this.activity.attachTree(this.tree.treeView);
    this.activity.attachWorkspace();
    this.activity.init();

    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider("estate", this.vfs),
      vscode.window.registerFileDecorationProvider(this.vfsDecorator),
      vscode.languages.registerCodeLensProvider(longLangs, this.codeLens),
      vscode.languages.registerDocumentLinkProvider(
        longLangs,
        new WikiDocumentLinkProvider(this.wiki),
      ),
      vscode.commands.registerCommand("estate.ui.quickPick", (anchor: Anchor) => {
        if (!anchor) return;
        vscode.window.showQuickPick([
          // 1. Show anchor path (useful for when we dont know "which" README.md/package.json we're looking at)
          // 2. Show Front matter?
          // 3. Outline Behavior. Collapse/expand
          // 4. Edit label(sidebar)
          // 4. Edit label(sidebar)
          `🧩 Create label ${anchor.label}`,
          `🕸 Update label ${anchor.label}`,
          `♻️ Delete label ${anchor.label}`,
          `💾 Create pipeline ${anchor.label}`,
          `💾 Read pipeline ${anchor.label}`,
          `💾 Update pipeline ${anchor.label}`,
          `💾 Delete pipeline ${anchor.label}`,
        ]);
      }),
    );
    this.activity.subscribe((activity) => {
      console.log("[AppStore.init.subsribe()]");
      // this.logger.debug("[AppStore.init.subsribe()]");
      //   vscode.window.showInformationMessage(`app ${this.input}`);
      // this.analysis.analyzeLine(activity);
    });
  }

  get previewMode() {
    return this.state.mdPreviewMode;
  }

  setPreviewMode(enabled: boolean) {
    this.state.mdPreviewMode = enabled;
  }

  togglePreviewMode() {
    this.state.mdPreviewMode = !this.state.mdPreviewMode;
  }

  isMdPreviewEnabled(): boolean {
    return this.state.mdPreviewMode;
  }

  toggleMdPreview(): boolean {
    this.state.mdPreviewMode = !this.state.mdPreviewMode;
    return this.state.mdPreviewMode;
  }

  async bumpLeader() {
    const num = (this.state.leader + 1) % 3;
    this.state.leader = num;
    await vscode.commands.executeCommand("setContext", "estate.leader", num);
    this.tree.refresh();
    return num;
  }
}

interface ReferenceItem extends vscode.QuickPickItem {
  id: string;
  details?: string;
}

export function registerCustomCommandPalette(context: vscode.ExtensionContext, app: AppStore) {
  let disposable = vscode.commands.registerCommand(CMD.estate.ui.cmdPalette, async () => {
    const quickPick = vscode.window.createQuickPick<ReferenceItem>();
    quickPick.title = "🚀 Reference & Command Hub";
    quickPick.placeholder = "Type to search references, snippets, or actions...";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = [
      {
        label: "$(book) Core Documentation Reference",
        description: "Module 01 • Architecture overview",
        detail:
          "Detailed explanation of the compilation pipeline, lexer rules, and syntax tree nodes.",
        id: "doc_1",
      },
      {
        label: "$(code) Active Workspace Snippets",
        description: "Module 02 • Boilerplate code",
        detail: "Quick injection templates for state management, hooks, and lifecycle events.",
        id: "doc_2",
      },
      {
        label: "$(terminal) Build & Test Automation",
        description: "Module 03 • Scripts",
        detail:
          "Trigger hot module reloading, validation checks, and target architecture emitter tests.",
        id: "doc_3",
      },
      {
        label: "$(settings) Configuration Dashboard",
        description: "Module 04 • Settings",
        detail: "Adjust workspace behavior, sandboxing properties, and path resolutions.",
        id: "doc_4",
      },
    ];
    quickPick.onDidAccept(() => {
      const selection = quickPick.selectedItems[0];
      if (selection) {
        vscode.window.showInformationMessage(`Selected: ${selection.label} (ID: ${selection.id})`);
      }
      quickPick.dispose();
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
    });
    quickPick.show();
  });
  if (app) {
    app.ctx.subscriptions.push(disposable);
  } else if (context) {
    context.subscriptions.push(disposable);
  } else {
    vscode.window.showErrorMessage("No context provided for registering the command.");
  }
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
    logger: createTrace(stream),
    channel,
  };
}
