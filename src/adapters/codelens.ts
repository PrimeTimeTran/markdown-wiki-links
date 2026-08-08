import * as vscode from "vscode";

import { CMD } from "../../generated/cmd";
import { AppActivity, captureScope } from "../activity";
import { Anchor } from "../anchor";
import { AppStore } from "../app";
import { EstateContext } from "../estate";
import { AnchorRef } from "../types";

export class WikiCodeLensProvider implements vscode.CodeLensProvider {
  public folded = new Set<string>();
  public renderedFoldAll: boolean = false;
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  constructor(private app: AppStore) {
    this.tracer = app.tracer.namespace("AnalysisStore");
    this.app.initFlow.info("WikiCodeLensProvider");
    app.activity.subscribe((_activity) => {
      // Doesn't work....
      // this.app.click.info("WikiCodeLensProvider.provideCodeLenses");
      this.refresh();
      // this.analyzeLine(activity);
    });
  }
  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
  private readonly tracer;
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    // #1 on window click
    this.app.click.info("WikiCodeLensProvider.provideCodeLenses");
    let inlineFlags = this.addIntrinsicAnchors(doc);
    let documentAnchors = this.addDocumentAnchors(doc);

    const lenses: vscode.CodeLens[] = [...inlineFlags, ...documentAnchors];
    // WIP: Add multiple inline lenses
    // lenses.push(...addIntrinsicAnchors(lenses));

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
    //       command: "flowify.previewIcon",
    //       arguments: [icon, line],
    //     }),
    //   );
    // });
    // lenses.push(...this.provideAnchorFlags(doc));
    return lenses;
  }
  addIntrinsicAnchors(doc: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (let line = 0; line < doc.lineCount; line++) {
      const text = doc.lineAt(line).text;
      const matches = this.app.anchors.find(doc.uri, text, line);
      for (const match of matches) {
        const range = new vscode.Range(line, match.start, line, match.end);
        const anchor = this.app.anchors.get(match.id);
        if (anchor) {
          lenses.push(
            new vscode.CodeLens(range, {
              title: `🏠 Open ${anchor?.label ?? match.id}`,
              command: CMD.estate.anchor.view,
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
          new vscode.CodeLens(range, {
            title: "🔖 Anchor",
            command: "anchor.edit",
            arguments: [doc.uri, range],
          });
        }
        const flag = this.app.anchors.getFlag(match.id);
        if (flag?.id == "@easy") {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🗂 Easy",
              command: "ui.openInNewEditorGroup",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@medium") {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🗂 medium",
              command: "ui.openInNewEditorGroup",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@hard") {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🗂 Hard",
              command: "ui.openInNewEditorGroup",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@context") {
          // TODO: Identify how to properly differenrite between intrinsic vs user defined.
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🗂 Open Context",
              command: "ui.openInNewEditorGroup",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@connected") {
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🏘️ Connected",
              command: "ui.openInNewEditorGroup",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@branch") {
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🏘️ Branch",
              command: "ui.openInNewEditorGroup",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@note") {
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🏘️ Note",
              command: "ui.openInNewEditorGroup",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@hoverable") {
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🚁 Hover",
              command: "ui.hoverable",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@pinnable") {
          lenses.push(
            new vscode.CodeLens(range, {
              title: "📌 Notify Pin",
              command: "ui.pinnable",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@pick") {
          lenses.push(
            new vscode.CodeLens(range, {
              title: "📋 Pick",
              command: "ui.pick",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@inline") {
          lenses.push(
            new vscode.CodeLens(range, {
              title: "🧩 Add Inline Panel",
              command: "ui.addInlinePanel",
              arguments: [this.makeCtx(doc, match, range)],
            }),
          );
        }
        if (flag?.id == "@fold") {
          const topLevel = this.isTopLevelFold(doc, range);
          if (this.renderedFoldAll && topLevel) {
            this.renderedFoldAll = !this.renderedFoldAll;
            lenses.push(
              new vscode.CodeLens(range, {
                title: topLevel ? "📦 Fold All" : "📂 Unfold All",
                command: "editor.foldAll",
              }),
            );
          }
          lenses.push(
            new vscode.CodeLens(range, {
              title: this.isFolded(doc.uri, range) ? "📂 Unfold" : "📦 Fold",
              command: "estate.toggleFold",
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
        //     title: '💾 Save Anchor',
        //     command: 'estate.contentSave',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );
        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '🔄 Cycle Variants', // Move through saved anchor variations/options
        //     command: 'estate.contentCycle',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );
        // lenses.push(
        //   new vscode.CodeLens(range, {
        //     title: '♻️ Replace Content', // Apply captured anchor content into the current scope
        //     command: 'estate.contentReplace',
        //     arguments: [this.makeCtx(doc, match, range)],
        //   }),
        // );
      }
    }
    return lenses;
  }
  addDocumentAnchors(doc: vscode.TextDocument): vscode.CodeLens[] {
    let anchors = this.app.anchors.findInFile(doc.uri);
    const lenses: vscode.CodeLens[] = [];
    for (const anchor of anchors) {
      const src = anchor.src;
      if (!src) continue;
      // make sure this anchor belongs to this document
      if (src.uri !== doc.uri.fsPath) continue;
      const line = src.startLine;
      if (line >= doc.lineCount) continue;
      // vscode.window.showQuickPick([
      //         `🧩 Inline ${anchor.label}`,
      //         `🕸 Graph ${anchor.label}`,
      //         `♻️ Replace ${anchor.label}`,
      //         `💾 Save ${anchor.label}`,
      //       ]);
      lenses.push(
        new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
          title: `$(bookmark) ${anchor.label ?? "Open Anchor"}`,
          command: "estate.ui.quickPick",
          arguments: [anchor],
        }),
      );
    }
    return lenses;
  }
  private analyzeLine(activity: AppActivity) {
    console.log("[-- 6 -- WikiCodeLensProvider.analyzeLine.windowClick()]", activity);
  }
  init(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      this.app.activity.subscribe((a) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        this.update(a);
      }),
    );
  }
  private update(activity: AppActivity) {
    console.log("decorate based on", activity);
  }
  public foldKey(uri: vscode.Uri, range: vscode.Range): string {
    return `${uri.fsPath}:${range.start.line}`;
  }
  public isFolded(uri: vscode.Uri, range: vscode.Range): boolean {
    return this.folded.has(this.foldKey(uri, range));
  }
  public isTopLevelFold(document: vscode.TextDocument, range: vscode.Range): boolean {
    const line = document.lineAt(range.start.line).text;
    return !line.startsWith("\t");
  }
  public setFolded(uri: vscode.Uri, range: vscode.Range, folded: boolean): void {
    const key = this.foldKey(uri, range);
    if (folded) {
      this.folded.add(key);
    } else {
      this.folded.delete(key);
    }
  }
  // Add inline link with click actions()
  //   [
  //     'ui.addInlinePanel', // Give more content
  //     'ui.openInNewEditorGroup', // Open the context in new tab so I dont lose it when I click/scroll
  //     'estate.addPersistentNotification', // Another form of persisnt storage
  //     'estate.openTextAndIconPanel', // Open inline like "search panel"
  //     'ui.openQuickpickDropdown', // Reveal options
  //     'estate.contentSave', // Create anchor
  //     'estate.contentCycle', // Select from anchor(go through a list of options)
  //     'estate.contentReplace', // Select from anchor(after having captured/saved I any to apply)
  //   ];
  private provideAnchorFlags(doc: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const anchors = this.app.anchors.list();
    for (const anchor of anchors) {
      const { src } = anchor;
      if (!src) {
        continue;
      }
      if (vscode.Uri.file(src.uri) !== doc.uri) {
        continue;
      }
      let range = this.renderAnchor(anchor);
      if (!range) continue;
      lenses.push(range);
    }
    return lenses;
  }
  renderAnchor(b: Anchor) {
    console.log("[WikiCodeLensProvider].renderAnchor", b);
    const range = this.app.anchors.getRange(b);
    if (!range) return;
    return new vscode.CodeLens(range, {
      title: `🔖 ${b.label ?? "Anchor"}`,
      command: "anchor.edit",
      arguments: [
        {
          uri: b.src,
          selection: range,
          anchor: b.label,
        },
      ],
    });
  }
  makeCtx(document: vscode.TextDocument, match: AnchorRef, range: vscode.Range) {
    let ctx: EstateContext = {
      anchor: match.id,
      uri: document.uri,
      selection: range,
      scope: captureScope(document, range),
    };
    return ctx;
  }
  getAnchorsForDocument(registry: Record<string, Anchor>, uri: vscode.Uri): Anchor[] {
    return Object.values(registry).filter((a) => {
      return a.uri() === uri.fsPath;
    });
  }
}
