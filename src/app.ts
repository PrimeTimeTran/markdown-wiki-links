import * as vscode from "vscode";
import { TraceApi } from "@primetimetran/logger";

import { ActivityStore, AppActivity } from "./activity";
import { AnalysisStore } from "./analysis";
import { AnchorPresenter, AnchorStore } from "./adapters/anchorService";
import { VFSDecorator, EstateTreeProvider, VFSProvider } from "./estate";
import { CMD } from "../generated/cmd";
import { WikiDecorations } from "./adapters/decorations";
import { IndexService } from "./adapters/indexService";
import { WikiCodeLensProvider } from "./adapters/codelens";
import { WikiDocumentLinkProvider } from "./adapters/documentLinkProvider";
import { longLangs } from "./consts";

export interface EstateState {
  mdPreviewMode: boolean;
  focushistory: FocusTarget[];
}
type FocusTarget = "editor" | "sidebar" | "panel" | "outline" | "terminal";

export class AppStore {
  public outputChannel = vscode.window.createOutputChannel("Flowify");
  readonly tree: EstateTreeProvider;
  readonly vfs: VFSProvider;
  readonly vfsDecorator: VFSDecorator;
  readonly decorator: WikiDecorations;
  readonly activity: ActivityStore<AppActivity>;
  readonly analysis: AnalysisStore;
  readonly anchors: AnchorStore;
  readonly presenter: AnchorPresenter;
  readonly codeLens: WikiCodeLensProvider;
  constructor(
    public ctx: vscode.ExtensionContext,
    public logger: TraceApi,
    indexService: IndexService,
  ) {
    logger.debug("[AppStore.constructor.start]");
    // const originalLog = console.log;
    // console.log = (...args: unknown[]) => {
    //   originalLog(...args);
    //   this.outputChannel.appendLine(
    //     args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "),
    //   );
    // };
    // ctx.subscriptions.push(this.outputChannel);
    // setLoggerConfig({
    //   LOG_LEVEL: "debug",
    //   TRACE_ENABLED: true,
    //   // // If your logger supports a custom transport/sink function:
    //   // transport: (formattedLogString: string) => {
    //   //   this.outputChannel.appendLine(formattedLogString);
    //   // },
    // });

    // const trace = createTrace("ext:app.constructor");
    // trace.mark("app.constructor.start");

    this.activity = new ActivityStore<AppActivity>(this);

    this.anchors = new AnchorStore(this);
    this.analysis = new AnalysisStore(this);

    this.tree = new EstateTreeProvider(this);
    this.presenter = new AnchorPresenter(this);
    // For sidebar tree
    this.vfs = new VFSProvider(ctx, this);
    // For various icons(menu title)
    this.vfsDecorator = new VFSDecorator(ctx, this);

    this.decorator = new WikiDecorations(this, indexService);
    this.codeLens = new WikiCodeLensProvider(this);

    ctx.subscriptions.push(
      vscode.languages.registerCodeLensProvider(longLangs, this.codeLens),
      // Anchor flags.
      vscode.languages.registerDocumentLinkProvider(
        longLangs,
        new WikiDocumentLinkProvider(indexService),
      ),
    );
    ctx.subscriptions.push(
      this.tree.treeView.onDidChangeSelection((e) => {
        console.log("[ctx.AppStore.constructor.subscriptions].onDidChangeSelection", e);
        const node = e.selection[0];
        if (!node?.anchor) return;

        this.activity.emit({
          type: "anchor",
          anchor: node.anchor,
          editor: vscode.window.activeTextEditor,
        });
      }),
      this.tree.treeView.onDidChangeVisibility(async (e) => {
        // If triggered whenever the estate activity bar panel is revealed
        console.log("[ctx.AppStore.constructor.subscriptions].onDidChangeVisibility", e);
        if (e.visible) {
          // await this.tree.ensureEditorOpen();
        }
      }),
      this.tree.treeView,
    );
    this.activity.init(this.ctx);
    logger.debug("[AppStore.constructor.end]");
  }

  init(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider("estate", this.vfs),
      vscode.window.registerFileDecorationProvider(this.vfsDecorator),
    );
    this.activity.subscribe((activity) => {
      console.log("[AppStore].init Activity Click");
      //   vscode.window.showInformationMessage(`app ${this.input}`);
      // this.analysis.analyzeLine(activity);
    });
  }

  public state: EstateState = {
    mdPreviewMode: false,
    focushistory: [],
  };

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

  //   private input = new Map<string, boolean>();
  //   private input = new Map<string, boolean>();
  public input = false;
  async enterLeader() {
    console.log("enter leader");
    this.input = !this.input;
    // await vscode.commands.executeCommand('setContext', 'estate.leader', this.input);
    this.tree.refresh();
  }
}

interface ReferenceItem extends vscode.QuickPickItem {
  id: string;
  details?: string;
}

export function registerGiantQuickPickCommand(context: vscode.ExtensionContext, app: AppStore) {
  let disposable = vscode.commands.registerCommand(CMD.estate.show.ownership, async () => {
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
