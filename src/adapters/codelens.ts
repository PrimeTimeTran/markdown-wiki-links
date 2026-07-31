import * as vscode from 'vscode';

import { BookmarkOccurrence, BookmarkStore, FlagOccurrence } from './bookmarkService';
import { Activity, ActivityStore, captureScope } from './activityService';
import { EstateContext } from './estate';
import { icons } from '../ownership';

export class WikiCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  public refresh(): void {
    console.log('Refreshing the wikicodelens provider.');
    this._onDidChangeCodeLenses.fire();
  }
  constructor(
    private ctx: vscode.ExtensionContext,
    private store: BookmarkStore,
    private activityStore: ActivityStore,
  ) {
    activityStore.subscribe((activity) => {
      this.analyzeLine(activity);
      this.refresh();
    });
  }
  private analyzeLine(activity: Activity) {
    console.log('analyzeLine');
  }

  //   init(context: vscode.ExtensionContext) {
  //     icons;
  //     context.subscriptions.push(
  //       this.activity.subscribe((a) => {
  //         const editor = vscode.window.activeTextEditor;
  //         if (!editor) return;
  //         this.update(editor, a);
  //       }),
  //     );
  //   }

  private update(editor: vscode.TextEditor, activity: Activity) {
    console.log('decorate based on', activity.scope);
  }
  public folded = new Set<string>();
  public renderedFoldAll: boolean = false;

  public foldKey(uri: vscode.Uri, range: vscode.Range): string {
    return `${uri.fsPath}:${range.start.line}`;
  }
  public isFolded(uri: vscode.Uri, range: vscode.Range): boolean {
    return this.folded.has(this.foldKey(uri, range));
  }
  public isTopLevelFold(document: vscode.TextDocument, range: vscode.Range): boolean {
    const line = document.lineAt(range.start.line).text;
    return !line.startsWith('\t');
  }
  public setFolded(uri: vscode.Uri, range: vscode.Range, folded: boolean): void {
    const key = this.foldKey(uri, range);
    if (folded) {
      this.folded.add(key);
    } else {
      this.folded.delete(key);
    }
  }

  //   addLabel(
  //     match: BookmarkOccurrence | FlagOccurrence,
  //     doc: vscode.TextDocument,
  //     range: vscode.Range,
  //   ) {
  //     switch (match) {
  //       case '@connected':
  //         return {
  //           title: '🏘️ Connected',
  //           command: 'ui.openInNewEditorGroup',
  //           arguments: [this.makeCtx(doc, match, range)],
  //         };

  //       default:
  //         break;
  //     }
  //   }
  // Add inline link with click actions()
  //   [
  //     'ui.addInlinePanel', // Give more content
  //     'ui.openInNewEditorGroup', // Open the context in new tab so I dont lose it when I click/scroll
  //     'estate.addPersistentNotification', // Another form of persisnt storage
  //     'estate.openTextAndIconPanel', // Open inline like "search panel"
  //     'ui.openQuickpickDropdown', // Reveal options
  //     'estate.contentSave', // Create bookmark
  //     'estate.contentCycle', // Select from bookmark(go through a list of options)
  //     'estate.contentReplace', // Select from bookmark(after having captured/saved I any to apply)
  //   ];
  addIcon() {}
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (let line = 0; line < doc.lineCount; line++) {
      const text = doc.lineAt(line).text;
      const matches = this.store.find(text, line);
      for (const match of matches) {
        const range = new vscode.Range(line, match.start, line, match.end);
        // let item = this.addLabel(match, doc, range);
        const bookmark = this.store.get(match.id);
        // console.log('bookmark', bookmark?.label);
        if (bookmark) {
          lenses.push(
            new vscode.CodeLens(range, {
              title: `🏠 Personal ${bookmark?.label ?? match.id}`,
              command: 'wiki.openEstate',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
          new vscode.CodeLens(range, {
            title: '🔖 Bookmark',
            command: 'estate.addBookmark',
            arguments: [doc.uri, range],
          });
          //   const hasBookmark = this.store.hasSource(doc.uri.fsPath, range);

          //   lenses.push(
          //     new vscode.CodeLens(range, {
          //       title: hasBookmark ? '🔖 Saved' : '➕ Bookmark',
          //       command: hasBookmark ? 'estate.removeBookmark' : 'estate.addBookmark',
          //       arguments: [doc.uri, range],
          //     }),
          //   );
          //   lenses.push(
          //     new vscode.CodeLens(range, {
          //       title: '🕸 Graph',
          //       command: 'wiki.showGraph',
          //       arguments: [this.makeCtx(doc, match, range)],
          //     }),
          //   );
        }
        const flag = this.store.getFlag(match.id);
        if (flag?.id == '@context') {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🗂 Open Context',
              command: 'ui.openInNewEditorGroup',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@connected') {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🏘️ Connected',
              command: 'ui.openInNewEditorGroup',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@note') {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🏘️ Note',
              command: 'ui.openInNewEditorGroup',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@hoverable') {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🚁 Hover',
              command: 'ui.hoverable',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@pinnable') {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '📌 Notify Pin',
              command: 'ui.pinnable',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@pick') {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '📋 Pick',
              command: 'ui.pick',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }

        if (flag?.id == '@inline') {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🧩 Add Inline Panel', // Reveal more context without leaving the current file
              command: 'ui.addInlinePanel',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@fold') {
          const topLevel = this.isTopLevelFold(doc, range);
          if (this.renderedFoldAll && topLevel) {
            this.renderedFoldAll = !this.renderedFoldAll;
            lenses.push(
              new vscode.CodeLens(range, {
                title: topLevel ? '📦 Fold All' : '📂 Unfold All',
                command: 'editor.foldAll',
              }),
            );
          }
          lenses.push(
            new vscode.CodeLens(range, {
              title: this.isFolded(doc.uri, range) ? '📂 Unfold' : '📦 Fold',
              command: 'estate.toggleFold',
              arguments: [doc.uri, range],
            }),
          );
        }
        //   let ctx = this.makeCtx(doc, match, range);
        //   const scope = ctx.scope
        //     ? `${ctx.scope.kind} ${ctx.scope.startLine}-${ctx.scope.endLine}`
        //     : 'none';
        //   lenses.push(
        //     new vscode.CodeLens(range, {
        //       //   title: '🏁 Flag ' + data,
        //       //   title: `🏁 ${ctx.selection.start.line}:${ctx.selection.start.character} → ${ctx.selection.end.line}:${ctx.selection.end.character}`,
        //       title: `🏁 ${scope}`,
        //       command: 'wiki.showGraph',
        //       arguments: [this.makeCtx(doc, match, range)],
        //     }),
        //   );
        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '📌 Pin Context', // Persist context as a visible notification/pinned state
        //     command: 'estate.addPersistentNotification',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );

        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '🔎 Reveal Panel', // Show searchable context/options for this estate item
        //     command: 'estate.openTextAndIconPanel',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );

        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '⚡ Actions', // Open available operations for this context
        //     command: 'ui.openQuickpickDropdown',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );

        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '💾 Save Bookmark', // Capture current scope into the estate registry
        //     command: 'estate.contentSave',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );
        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '🔄 Cycle Variants', // Move through saved bookmark variations/options
        //     command: 'estate.contentCycle',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );

        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '♻️ Replace Content', // Apply captured bookmark content into the current scope
        //     command: 'estate.contentReplace',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );
      }
    }
    // const addHeader = new vscode.CodeLens(new vscode.Range(scopeStartLine, 0, scopeStartLine, 0), {
    //   title: '🔒 Scope: main',
    //   command: 'flowify.showScope',
    // });
    // lenses.push(addHeader);
    const line = vscode.window.activeTextEditor?.selection.start.line ?? 0;
    const range = new vscode.Range(line, 0, line, 0);
    icons.forEach((icon) => {
      lenses.push(
        new vscode.CodeLens(range, {
          title: `🔹 ${icon}`,
          command: 'flowify.previewIcon',
          arguments: [icon, line],
        }),
      );
    });
    lenses.push(...this.provideBookmarkLenses(doc));
    return lenses;
  }
  private provideBookmarkLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

    const bookmarks = this.store.list();

    for (const bookmark of bookmarks) {
      const source = bookmark.source;

      if (!source) {
        continue;
      }

      if (source.uri !== doc.uri.fsPath) {
        continue;
      }

      const range = new vscode.Range(
        source.startLine,
        source.startCharacter ?? 0,
        source.endLine,
        source.endCharacter ?? 0,
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: `🔖 ${bookmark.label ?? 'Bookmark'}`,
          command: 'wiki.openEstate',
          arguments: [
            {
              bookmark: bookmark.label,
              uri: doc.uri,
              selection: range,
            },
          ],
        }),
      );
    }

    return lenses;
  }
  makeCtx(document: vscode.TextDocument, match: BookmarkOccurrence, range: vscode.Range) {
    let ctx: EstateContext = {
      bookmark: match.id,
      uri: document.uri,
      selection: range,
      scope: captureScope(document, range),
    };
    return ctx;
  }
}
