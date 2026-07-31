import * as vscode from 'vscode';

import { ActivityStore } from './activity';
import { AnalysisStore } from './analysis';
import { BookmarkPresenter, BookmarkStore } from './adapters/bookmarkService';
import { EstateTreeProvider } from './estate';

export interface EstateState {
  mdPreviewMode: boolean;
}

export class AppStore {
  public outputChannel = vscode.window.createOutputChannel('Flowify');
  readonly activity: ActivityStore;
  readonly analysis: AnalysisStore;
  readonly bookmarks: BookmarkStore;
  readonly presenter: BookmarkPresenter;
  readonly tree: EstateTreeProvider;

  constructor(public ctx: vscode.ExtensionContext) {
    this.activity = new ActivityStore(this);
    this.bookmarks = new BookmarkStore(this);
    this.analysis = new AnalysisStore(this);
    this.presenter = new BookmarkPresenter(this);
    this.tree = new EstateTreeProvider(this);
    this.activity.init(this.ctx);
    
  }

  init() {
    this.activity.subscribe((activity) => {
      console.log('activityStore handler for click');
      this.analysis.analyzeLine(activity);
    });
  }

  private state: EstateState = {
    mdPreviewMode: false,
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
}
