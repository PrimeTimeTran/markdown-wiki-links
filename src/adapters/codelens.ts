import * as vscode from 'vscode';

import { Bookmark, BookmarkOccurrence, BookmarkSource } from './bookmarkService';
import { Activity, captureScope } from '../activity';
import { EstateContext } from '../estate';
import { icons } from '../ownership';
import { AppStore } from '../app';
import { capability, CMD, flags } from '../cmds';

export class WikiCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
  constructor(private app: AppStore) {
    app.activity.subscribe((activity) => {
      this.analyzeLine(activity);
      this.refresh();
    });
  }
  private analyzeLine(activity: Activity) {
    console.log('analyzeLine WikiCodeLensProvider event', activity);
  }

  init(context: vscode.ExtensionContext) {
    icons;
    context.subscriptions.push(
      this.app.activity.subscribe((a) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        this.update(editor, a);
      }),
    );
  }

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

  //   provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
  //     const lenses: vscode.CodeLens[] = [];
  //     for (let line = 0; line < doc.lineCount; line++) {
  //       const text = doc.lineAt(line).text;
  //       const matches = this.app.bookmarks.find(text, line);
  //       for (const match of matches) {
  //         const range = new vscode.Range(line, match.start, line, match.end);
  //         const bookmark = this.app.bookmarks.get(match.id);
  //         if (bookmark) {
  //           lenses.push(
  //             new vscode.CodeLens(range, {
  //               title: `🏠 Open ${bookmark?.label ?? match.id}`,
  //               command: CMD.bookmark.open,
  //               arguments: [this.makeCtx(doc, match, range)],
  //             }),
  //           );
  //           lenses.push(
  //             new vscode.CodeLens(range, {
  //               title: `🔖 Present ${bookmark?.label ?? match.id}`,
  //               command: CMD.bookmark.present,
  //               arguments: [this.makeCtx(doc, match, range), bookmark],
  //             }),
  //           );
  //         }
  //       }
  //     }
  //     const line = vscode.window.activeTextEditor?.selection.start.line ?? 0;
  //     const range = new vscode.Range(line, 0, line, 0);
  //     return lenses;
  //   }

  //   provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
  //     const lenses: vscode.CodeLens[] = [];
  //     const { list, getRange } = this.app.bookmarks;
  //     for (const b of list()) {
  //       lenses.push(
  //         new vscode.CodeLens(b.source, {
  //           title: `✨ Easy Task`,
  //           command: CMD.bookmark.present,
  //           arguments: [this.makeCtx(doc, b, getRange(b)), b],
  //         }),
  //       );
  //     }
  //     return lenses;
  //     // const lenses: vscode.CodeLens[] = [];
  //     // let uri = doc.uri.toString();
  //     // const { list, isInThisFile, getRange } = this.app.bookmarks;
  //     // for (const b of list()) {
  //     //   if (isInThisFile(b, uri)) continue;
  //     //   for (const tag of b.tags) {
  //     //     lenses.push(
  //     //       // this.renderBookmark(b),
  //     //       new vscode.CodeLens(b.source, {
  //     //         title: `✨ Easy Task`,
  //     //         command: tag.action,
  //     //         arguments: [this.makeCtx(doc, b, getRange(b)), b],
  //     //       }),
  //     //     );
  //     //   }
  //     // }
  //     // return lenses;
  //   }
  //   private findBookmarkRange(doc: vscode.TextDocument, bookmark: Bookmark): Bookmark[] {
  //     let bookmarks: Bookmark[] = this.app.bookmarks.list();
  //     return bookmarks.filter((b) => this.app.bookmarks.isInThisFile(b, doc.uri));
  //   }
  //   private findBookmarkRange(
  //     doc: vscode.TextDocument,
  //     bookmark: Bookmark,
  //   ): vscode.Range | undefined {
  //     let bookmarks: Bookmark[] = this.app.bookmarks.list();
  //     for (const bookmark in bookmarks) {
  //       for (const tag in bookmark.tags) {
  //         capability.find((c) => c.id == tag);
  //         if (bookmark.source.uri !== doc.uri.fsPath) continue;
  //         return new vscode.Range(
  //           bookmark.source.startLine,
  //           bookmark.source.startCharacter,
  //           bookmark.source.endLine,
  //           bookmark.source.endCharacter,
  //         );
  //       }
  //     }
  //   }
  //   private findBookmarkRange(
  //     doc: vscode.TextDocument,
  //     bookmark: Bookmark,
  //   ): vscode.Range | undefined {
  //     let bookmarks: Bookmark[] = this.app.bookmarks.list();
  //     for (const bookmark in bookmarks) {
  //       for (const tag in bookmark.tags) {
  //         capability.find((i) => i.id == tag.);
  //         if (bookmark.source.uri !== doc.uri.fsPath) continue;
  //         return new vscode.Range(
  //           bookmark.source.startLine,
  //           bookmark.source.startCharacter,
  //           bookmark.source.endLine,
  //           bookmark.source.endCharacter,
  //         );
  //       }
  //     }
  //   }
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (let line = 0; line < doc.lineCount; line++) {
      const text = doc.lineAt(line).text;
      const matches = this.app.bookmarks.find(doc.uri, text, line);
      for (const match of matches) {
        const range = new vscode.Range(line, match.start, line, match.end);
        const bookmark = this.app.bookmarks.get(match.id);
        if (bookmark) {
          lenses.push(
            new vscode.CodeLens(range, {
              title: `🏠 Open ${bookmark?.label ?? match.id}`,
              command: CMD.bookmark.open,
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
          lenses.push(
            new vscode.CodeLens(range, {
              title: `🔖 Present ${bookmark?.label ?? match.id}`,
              command: CMD.bookmark.present,
              arguments: [this.makeCtx(doc, match, range), bookmark],
            }),
          );
          new vscode.CodeLens(range, {
            title: '🔖 Bookmark',
            command: 'bookmark.edit',
            arguments: [doc.uri, range],
          });
          //   const hasBookmark = this.store.hasSource(doc.uri.fsPath, range);

          //   lenses.push(
          //     new vscode.CodeLens(range, {
          //       title: hasBookmark ? '🔖 Saved' : '➕ Bookmark',
          //       command: hasBookmark ? 'estate.removeBookmark' : 'bookmark.create',
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
        const flag = this.app.bookmarks.getFlag(match.id);
        if (flag?.id == '@easy') {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🗂 Easy',
              command: 'ui.openInNewEditorGroup',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@medium') {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🗂 medium',
              command: 'ui.openInNewEditorGroup',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == '@hard') {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: '🗂 Hard',
              command: 'ui.openInNewEditorGroup',
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
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
              title: '🧩 Add Inline Panel',
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
        //     title: '💾 Save Bookmark',
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
    // const line = vscode.window.activeTextEditor?.selection.start.line ?? 0;
    // const range = new vscode.Range(line, 0, line, 0);
    // icons.forEach((icon) => {
    //   lenses.push(
    //     new vscode.CodeLens(range, {
    //       title: `🔹 ${icon}`,
    //       command: 'flowify.previewIcon',
    //       arguments: [icon, line],
    //     }),
    //   );
    // });
    lenses.push(...this.provideBookmarkLenses(doc));
    return lenses;
  }
  private provideBookmarkLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const bookmarks = this.app.bookmarks.list();
    for (const bookmark of bookmarks) {
      const { src } = bookmark;
      if (!src) {
        continue;
      }
      if (vscode.Uri.file(src.uri) !== doc.uri) {
        continue;
      }
      lenses.push(this.renderBookmark(bookmark));
    }
    return lenses;
  }
  renderBookmark(b: Bookmark) {
    const range = this.app.bookmarks.getRange(b);
    return new vscode.CodeLens(range, {
      title: `🔖 ${b.label ?? 'Bookmark'}`,
      command: 'bookmark.edit',
      arguments: [
        {
          uri: b.src,
          selection: range,
          bookmark: b.label,
        },
      ],
    });
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

function getBookmarksForDocument(registry: Record<string, Bookmark>, uri: vscode.Uri): Bookmark[] {
  return Object.values(registry).filter((b) => {
    return b.uri() === uri.fsPath;
  });
}
