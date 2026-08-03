import * as vscode from 'vscode';

import { ActivityStore, AppActivity } from './activity';
import { AnalysisStore } from './analysis';
import { AnchorPresenter, AnchorStore } from './adapters/anchorService';
import { VFSDecorator, EstateTreeProvider, VFSProvider, EstateNode } from './estate';
import { CMD } from '../generated/cmd';

export interface EstateState {
  mdPreviewMode: boolean;
  focushistory: FocusTarget[];
}
type FocusTarget = 'editor' | 'sidebar' | 'panel' | 'outline' | 'terminal';

export class AppStore {
  public outputChannel = vscode.window.createOutputChannel('Flowify');
  readonly tree: EstateTreeProvider;
  readonly vfs: VFSProvider;
  readonly vfsDecorator: VFSDecorator;
  readonly activity: ActivityStore<AppActivity>;
  readonly analysis: AnalysisStore;
  readonly anchors: AnchorStore;
  readonly presenter: AnchorPresenter;

  constructor(public ctx: vscode.ExtensionContext) {
    this.activity = new ActivityStore<AppActivity>(this);
    this.activity = new ActivityStore(this);
    this.anchors = new AnchorStore(this);
    this.analysis = new AnalysisStore(this);
    this.presenter = new AnchorPresenter(this);
    this.tree = new EstateTreeProvider(this);

    this.vfs = new VFSProvider(ctx, this);
    this.vfsDecorator = new VFSDecorator(ctx, this);

    const view = vscode.window.createTreeView<EstateNode>('estateExplorer', {
      treeDataProvider: this.tree,
    });
    ctx.subscriptions.push(
      view.onDidChangeVisibility(async (e) => {
        if (e.visible) {
          //   await this.tree.ensureEditorOpen();
        }
      }),
      view,
    );
    this.activity.init(this.ctx);
  }

  init(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider('estate', this.vfs),
      vscode.window.registerFileDecorationProvider(this.vfsDecorator),
    );
    this.activity.subscribe((activity) => {
      console.log('App Editor Click');
      //   vscode.window.showInformationMessage(`app ${this.input}`);
      this.analysis.analyzeLine(activity);
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
    console.log('enter leader');
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
    quickPick.title = '🚀 Reference & Command Hub';
    quickPick.placeholder = 'Type to search references, snippets, or actions...';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = [
      {
        label: '$(book) Core Documentation Reference',
        description: 'Module 01 • Architecture overview',
        detail:
          'Detailed explanation of the compilation pipeline, lexer rules, and syntax tree nodes.',
        id: 'doc_1',
      },
      {
        label: '$(code) Active Workspace Snippets',
        description: 'Module 02 • Boilerplate code',
        detail: 'Quick injection templates for state management, hooks, and lifecycle events.',
        id: 'doc_2',
      },
      {
        label: '$(terminal) Build & Test Automation',
        description: 'Module 03 • Scripts',
        detail:
          'Trigger hot module reloading, validation checks, and target architecture emitter tests.',
        id: 'doc_3',
      },
      {
        label: '$(settings) Configuration Dashboard',
        description: 'Module 04 • Settings',
        detail: 'Adjust workspace behavior, sandboxing properties, and path resolutions.',
        id: 'doc_4',
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
    vscode.window.showErrorMessage('No context provided for registering the command.');
  }
}
