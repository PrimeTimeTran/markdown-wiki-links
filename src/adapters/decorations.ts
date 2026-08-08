import * as path from "path";

import * as vscode from "vscode";

import { AppActivity } from "../activity";
import { Anchor } from "../anchor";
import { AppStore } from "../app";
import { EXT_PATH, supportedLanguages } from "../consts";
import { buildFenceMask } from "../core/fenceMask";
import { parseEmbeds } from "../core/parser/embedParser";
import { parseLinks } from "../core/parser/linkParser";
import { innerRange } from "../core/parser/refRange";
import { icons } from "../ownership";
import { IndexService } from "./indexService";

const DEBOUNCE_MS = 250;
// Colours `[[...]]` / `![[...]]` in the editor by whether the resolver can actually resolve
// the target — resolved links take the editor link colour, unresolved ones are dimmed.
// This reflects real resolution (spaces, Unicode, every character the parser accepts),
// unlike a TextMate grammar that pattjern-matches the link text.
export class WikiDecorations {
  [x: string]: any;
  private mutedDecoration = vscode.window.createTextEditorDecorationType({
    opacity: "0.20",
  });
  private scopeDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.selectionBackground"),
  });
  private readonly anchorDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.selectionHighlightBackground"),
  });
  private timer?: ReturnType<typeof setTimeout>;
  private providers: DecorationProvider[] = [];
  private decorations = new Map<string, vscode.TextEditorDecorationType>();
  private stateDecorations = new Map<string, vscode.TextEditorDecorationType>();
  private unrelatedDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: "0.50",
  });
  private declarationDecorationType = vscode.window.createTextEditorDecorationType({
    after: { contentText: " 📌 [Declaration]", color: "#007acc", fontStyle: "italic" },
  });
  private usageDecorationType = vscode.window.createTextEditorDecorationType({
    after: { contentText: " ⚡ [Flow]", color: "#28a745", fontStyle: "italic" },
  });
  private resolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor("textLink.foreground"),
  });
  private unresolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor("descriptionForeground"),
  });
  decorationTypes(ctx: vscode.ExtensionContext): OwnershipDecorationStyles {
    const subject = vscode.window.createTextEditorDecorationType({
      textDecoration: "underline wavy #19b60b",
    });
    const related = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    });
    const iconPath = vscode.Uri.file(path.join(ctx.extensionPath, "resources", `eye.svg`));
    const label = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1.5em",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
      },
      gutterIconPath: iconPath,
      gutterIconSize: "contain",
    });
    const leftStrip = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      border: "solid",
      borderWidth: "0 0 0 3px",
      borderColor: "#19b60b",
    });

    const rightStrip = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      border: "solid",
      borderWidth: "0 3px 0 0",
      borderColor: "#19b60b",
    });
    return {
      subject,
      related,
      label,
      leftStrip,
      rightStrip,
    } as OwnershipDecorationStyles;
  }
  constructor(
    private app: AppStore,
    private idx: IndexService,
  ) {
    this.initIcons();
    this.initStateIcons();
    this.providers = [
      new AnchorDecorationProvider(this.anchorDecorationType, app),
      new GutterProvider(this.anchorDecorationType, app),
      new OwnershipDecorationProvider(app, this.decorationTypes(app.ctx)),
    ];
    app.ctx.subscriptions.push(
      this.resolved,
      this.unresolved,
      this.unrelatedDecorationType,
      this.declarationDecorationType,
      this.usageDecorationType,
    );
    app.activity.subscribe((activity) => {
      this.app.click.info("WikiDecorations");
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      this.refresh(editor, activity);
    });
  }

  private initStateIcons() {
    this.stateDecorations.set(
      "muted",
      vscode.window.createTextEditorDecorationType({
        opacity: "1",
      }),
    );
    this.stateDecorations.set(
      "focused",
      vscode.window.createTextEditorDecorationType({
        fontWeight: "bold",
        opacity: "1",
      }),
    );
    this.stateDecorations.set(
      "selected",
      vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor("editor.selectionBackground"),
      }),
    );
  }
  private initIcons() {
    for (const icon of icons) {
      const iconPath = vscode.Uri.file(path.join(EXT_PATH, "resources", `${icon}.svg`));
      const decoration = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPath,
        gutterIconSize: "contain",
      });
      this.decorations.set(icon, decoration);
    }
  }
  public refresh(editor: vscode.TextEditor, activity: AppActivity | undefined) {
    if (!activity) return;
    const rangeGroups = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();
    const optionGroups = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();
    for (const provider of this.providers) {
      for (const result of provider.provide(editor, activity)) {
        if (result.kind === "range") {
          const existing = rangeGroups.get(result.type) ?? [];
          rangeGroups.set(result.type, [...existing, ...result.items]);
        } else {
          const existing = optionGroups.get(result.type) ?? [];
          optionGroups.set(result.type, [...existing, ...result.items]);
        }
      }
    }
    for (const [type, ranges] of rangeGroups) {
      editor.setDecorations(type, ranges);
    }

    for (const [type, options] of optionGroups) {
      editor.setDecorations(type, options);
    }
  }
  register(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      this.resolved,
      this.unresolved,
      this.unrelatedDecorationType,
      this.declarationDecorationType,
      this.usageDecorationType,
      // vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      //   this.decorate(event.textEditor);
      // }),
      // vscode.window.onDidChangeVisibleTextEditors(() => {}),
    );
  }
  public refreshAnchor(editor: vscode.TextEditor, anchor: Anchor) {
    const ranges = this.getAnchorRanges(editor, anchor);
    // no anchor locations for this file
    if (ranges.length === 0) {
      editor.setDecorations(this.anchorDecorationType, []);
      return;
    }
    editor.setDecorations(this.anchorDecorationType, ranges);
  }
  private getAnchorRanges(editor: vscode.TextEditor, anchor: Anchor): vscode.Range[] {
    if (!anchor.locations) return [];
    const uri = editor.document.uri.toString();
    return anchor.locations
      .filter((loc) => loc.uri === uri)
      .map((loc) => {
        return new vscode.Range(loc.line, loc.start, loc.line, loc.end);
      });
  }
  private schedule(): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
    }, DEBOUNCE_MS);
  }
  private decorate(editor: vscode.TextEditor): void {
    if (!supportedLanguages.includes(editor.document.languageId)) return;

    const doc = editor.document;
    const text = doc.getText();
    const mask = buildFenceMask(text);

    const refs = [...parseLinks(text, mask), ...parseEmbeds(text, mask)];

    const resolver = this.idx.getResolver();
    const resolvedRanges: vscode.Range[] = [];
    const unresolvedRanges: vscode.Range[] = [];
    for (const ref of refs) {
      const inner = innerRange(ref);
      const range = new vscode.Range(doc.positionAt(inner.start), doc.positionAt(inner.end));
      const entry = resolver.resolveLink(ref, doc.uri.fsPath);
      if (entry) {
        resolvedRanges.push(range);
      } else {
        unresolvedRanges.push(range);
      }
    }
    editor.setDecorations(this.resolved, resolvedRanges);
    editor.setDecorations(this.unresolved, unresolvedRanges);
  }
  public highlightSurroundingLines(editor: vscode.TextEditor) {
    const selection = editor.selection;
    const currentLine = selection.start.line;
    const doc = editor.document;
    const targetRanges: vscode.Range[] = [];
    // Calculate line numbers: one above, current, one below
    const linesToHighlight = [currentLine - 1, currentLine, currentLine + 1];
    for (const lineIdx of linesToHighlight) {
      if (lineIdx >= 0 && lineIdx < doc.lineCount) {
        targetRanges.push(doc.lineAt(lineIdx).range);
      }
    }
    // Apply decorations using your existing usage decoration type
    editor.setDecorations(this.usageDecorationType, targetRanges);
    console.log(`Highlighted lines: ${linesToHighlight.join(", ")}`);
    const panel = vscode.window.createWebviewPanel(
      "ownershipGraph",
      "Ownership Analysis",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <body>
        <h2>Ownership</h2>
        <div id="content">
        Waiting...
        </div>
        <script>
        const vscode = acquireVsCodeApi();
        window.addEventListener('message', event => {
            document.getElementById('content').innerHTML =
                event.data.html;
        });
        </script>
        </body>
        </html>
        `;
  }
  private readonly ownershipMarkerDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: " 🧬",
      margin: "0 0 0 2em",
      color: "#888",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  public dispose() {
    this.unrelatedDecorationType.dispose();
    this.declarationDecorationType.dispose();
    this.usageDecorationType.dispose();
  }
  private cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
export interface Annotation {
  range: vscode.Range;
  // Human-facing projection
  label?: string;
  icon?: string;
  // Rendering
  placement?: AnnotationPlacement;
  style?: AnnotationStyle;
  // Behavior
  action?: AnnotationAction;
  // Source / identity / graph data
  metadata?: AnnotationMetadata;
}
export interface AnnotationStyle {
  color?: string;
  background?: string;
  underline?: boolean;
  fontWeight?: string;
  opacity?: number;
}
export type AnnotationPlacement =
  // attached to source
  | "highlight"
  | "inline-after"
  | "gutter"
  | "overview"
  | "codelens"
  // discovery/navigation
  | "sidebar"
  | "panel";
export interface AnnotationAction {
  kind: "navigate" | "command" | "open" | "reveal";
  target?: string;
  command?: string;
  args?: unknown[];
}
export interface AnnotationMetadata {
  type: string;
  id?: string;
  provider?: string;
  [key: string]: unknown;
}
type Placement =
  | {
      kind: "inline";
    }
  | {
      kind: "afterLine";
      column?: number;
    }
  | {
      kind: "gutter";
    };
type Action =
  | {
      kind: "navigate";
      target: string;
    }
  | {
      kind: "showDetails";
    };
type Style = {
  color?: string;
  background?: string;
  emphasis?: "bold" | "italic";
  underline?: boolean;
};
// type Estate = {
//   range: vscode.Range;
//   icon?: string;
//   label?: string;
//   interaction: Interaction;
// };
// type Interaction =
//   | { kind: 'file'; path: string }
//   | { kind: 'url'; url: string }
//   | { kind: 'preview'; path: string }
//   | { kind: 'hover'; markdown: string }
//   | { kind: 'panel'; panel: 'references' | 'graph' | 'outline' }
//   | { kind: 'command'; id: string; args?: unknown[] }
//   | { kind: 'peek'; symbol: string }
//   | { kind: 'anchor'; id: string }
//   | { kind: 'search'; query: string };
type EstateNode = {
  id: string;
  range: vscode.Range;
  kind: string;
  icon?: string;
  label?: string;
  actions: EstateAction[];
};
type EstateAction =
  | {
      kind: "file";
      path: string;
      label: string;
    }
  | {
      kind: "url";
      url: string;
      label: string;
    }
  | {
      kind: "preview";
      path: string;
      label: string;
    }
  | {
      kind: "panel";
      panel: "references" | "graph" | "outline";
      label: string;
    }
  | {
      kind: "command";
      id: string;
      args?: unknown[];
      label: string;
    }
  | {
      kind: "anchor";
      id: string;
      args?: unknown[];
      label: string;
    };
function isLineVisible(editor: vscode.TextEditor, line: number): boolean {
  return editor.visibleRanges.some((range) => line >= range.start.line && line <= range.end.line);
}
function isProbablyVisible(editor: vscode.TextEditor, line: number) {
  return editor.visibleRanges.some((range) => line >= range.start.line && line <= range.end.line);
}
export interface OwnershipDecorationStyles {
  subject: vscode.TextEditorDecorationType;
  related: vscode.TextEditorDecorationType;
  label: vscode.TextEditorDecorationType;
  leftStrip: vscode.TextEditorDecorationType;
  rightStrip: vscode.TextEditorDecorationType;
}
export interface RangeDecorationResult {
  type: vscode.TextEditorDecorationType;
  kind: "range";
  items: vscode.Range[];
}

export interface OptionDecorationResult {
  type: vscode.TextEditorDecorationType;
  kind: "options";
  items: vscode.DecorationOptions[];
}

export type DecorationResult = RangeDecorationResult | OptionDecorationResult;

interface DecorationProvider {
  provide(editor: vscode.TextEditor, activity: AppActivity): DecorationResult[];
}

export class AnchorDecorationProvider implements DecorationProvider {
  constructor(
    private type: vscode.TextEditorDecorationType,
    private app: AppStore,
  ) {}
  provide(editor: vscode.TextEditor, activity: AppActivity): DecorationResult[] {
    const anchor = this.resolveAnchor(activity, editor);

    if (!anchor?.src) {
      return [];
    }

    const src = anchor.src;

    if (src.uri !== editor.document.uri.fsPath) {
      return [];
    }

    const endLine = src.endLine ?? editor.document.lineCount - 1;
    const endCharacter = src.endCharacter ?? editor.document.lineAt(endLine).text.length;

    return [
      {
        type: this.type,
        kind: "range",
        items: [
          new vscode.Range(
            src.startLine,
            src.startCharacter || 0,
            src.endLine,
            src.endCharacter || endCharacter,
          ),
        ],
      },
    ];
  }
  private resolveAnchor(activity: AppActivity, editor: vscode.TextEditor): Anchor | undefined {
    if (activity.type !== "anchor") {
      return undefined;
    }

    // Case 1: click sent the whole anchor
    if (activity.anchor) {
      return activity.anchor;
    }

    // Case 2: resolve from current file/location
    const uri = editor.document.uri.toString();

    return this.app.anchors
      .list()
      .find((anchor) => anchor.locations?.some((location) => location.uri === uri));
  }
}
export class GutterProvider implements DecorationProvider {
  private decorations = new Map<string, vscode.TextEditorDecorationType>();
  private stateDecorations = new Map<string, vscode.TextEditorDecorationType>();
  constructor(
    private type: vscode.TextEditorDecorationType,
    private app: AppStore,
  ) {
    this.initIcons();
    this.initStateIcons();
  }
  private initStateIcons() {
    this.stateDecorations.set(
      "muted",
      vscode.window.createTextEditorDecorationType({
        opacity: "1",
      }),
    );
    this.stateDecorations.set(
      "focused",
      vscode.window.createTextEditorDecorationType({
        fontWeight: "bold",
        opacity: "1",
      }),
    );
    this.stateDecorations.set(
      "selected",
      vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor("editor.selectionBackground"),
      }),
    );
  }
  private initIcons() {
    for (const icon of icons) {
      const iconPath = vscode.Uri.file(path.join(EXT_PATH, "resources", `${icon}.svg`));
      const decoration = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPath,
        gutterIconSize: "contain",
      });
      this.decorations.set(icon, decoration);
    }
  }
  provide(editor: vscode.TextEditor, _activity: AppActivity): DecorationResult[] {
    const startLine = editor.selection.active.line;
    return icons.flatMap((icon, index) => {
      const line = startLine + index;
      if (line >= editor.document.lineCount) {
        return [];
      }
      const decoration = this.decorations.get(icon);
      if (!decoration) {
        return [];
      }
      return [
        {
          type: decoration,
          kind: "range",
          items: [editor.document.lineAt(line).range],
        },
      ];
    });
  }
}
export class OwnershipDecorationProvider implements DecorationProvider {
  constructor(
    private readonly app: AppStore,
    private readonly styles: OwnershipDecorationStyles,
  ) {}

  refresh() {
    for (const editor of vscode.window.visibleTextEditors) {
      const results = this.getRanges(editor);
      for (const result of results) {
        editor.setDecorations(result.type, result.items);
      }
    }
  }

  getRanges(editor: vscode.TextEditor): DecorationResult[] {
    const currentAnalysis = this.app.analysis.get();

    if (!currentAnalysis?.analysis?.node_context?.subject) {
      return [];
    }

    const {
      node_context: { subject },
      classification,
    } = currentAnalysis.analysis;

    const span = subject.span;

    const subjectRange = new vscode.Range(
      new vscode.Position(span.start_line - 1, span.start_col),
      new vscode.Position(span.end_line - 1, span.end_col),
    );

    const relatedRanges = (currentAnalysis.analysis.related_lines ?? []).map((rel) => {
      const line = rel.line - 1;

      return new vscode.Range(line, 0, line, editor.document.lineAt(line).range.end.character);
    });

    const line = span.start_line - 1;
    const lineEnd = editor.document.lineAt(line).range.end.character;

    const labelDecoration: vscode.DecorationOptions = {
      range: new vscode.Range(line, lineEnd, line, lineEnd),
      renderOptions: {
        after: {
          contentText: `  [${subject.kind}]${classification ? ` (${classification})` : ""}`,
        },
      },
    };

    return [
      {
        type: this.styles.subject,
        kind: "range",
        items: [subjectRange],
      },
      {
        type: this.styles.related,
        kind: "range",
        items: relatedRanges,
      },
      {
        type: this.styles.label,
        kind: "options",
        items: [labelDecoration],
      },

      // Overview ruler — left
      {
        type: this.styles.leftStrip,
        kind: "range",
        // items: [subjectRange],
        items: [subjectRange, ...relatedRanges],
        // items: [],
      },

      // Overview ruler — right
      {
        type: this.styles.rightStrip,
        kind: "range",
        items: [subjectRange],
        // items: [],
      },
    ];
  }

  public provide(editor: vscode.TextEditor, activity: AppActivity): DecorationResult[] {
    return this.getRanges(editor);
  }
}
