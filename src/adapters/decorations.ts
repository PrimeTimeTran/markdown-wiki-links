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
  decorationTypes(ctx: vscode.ExtensionContext) {
    const subjectUnderlineDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: "underline wavy #19b60b",
    });

    const relatedLineHighlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    });

    const iconPath = vscode.Uri.file(path.join(ctx.extensionPath, "resources", `eye.svg`));

    const kindLabelDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1.5em",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
      },
      gutterIconPath: iconPath,
      gutterIconSize: "contain",
    });
    return [subjectUnderlineDecoration, relatedLineHighlightDecoration, kindLabelDecoration];
  }
  constructor(
    app: AppStore,
    private idx: IndexService,
  ) {
    this.initIcons();
    this.initStateIcons();
    let [subjectUnderlineDecoration, relatedLineHighlightDecoration, kindLabelDecoration] =
      this.decorationTypes(app.ctx);
    this.providers = [
      new AnchorDecorationProvider(this.anchorDecorationType, app),
      new GutterProvider(this.anchorDecorationType, app),
      new OwnershipDecorationProvider(
        this.anchorDecorationType,
        app,
        subjectUnderlineDecoration,
        relatedLineHighlightDecoration,
        kindLabelDecoration,
      ),
    ];
    app.ctx.subscriptions.push(
      this.resolved,
      this.unresolved,
      this.unrelatedDecorationType,
      this.declarationDecorationType,
      this.usageDecorationType,
    );
    // 1. Ownership analysis of subject/selection
    // app.activity.subscribe((activity) => {
    //   const editor = vscode.window.activeTextEditor;
    //   if (!editor) return;
    //   const lines = app.analysis.getRelatedLines();
    //   // 1. Anchors always have what they need to decorate.
    //   this.refresh(editor, lines);
    //   // 2. Analysis doesn't. So request that the LSP tell us.
    //   //
    //   const result = app.analysis.get();
    //   if (!result) return;
    // });

    // 2. Anchor review workflow.
    app.activity.subscribe((activity) => {
      // app.logger.debug("[WikiDecorations]");
      console.log("[-- 5 -- WikiDecorations.windowClick()]");
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      this.refresh(editor, activity);
      this.decorate(editor);
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
  public refresh(editor: vscode.TextEditor, activity: AppActivity) {
    const grouped = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();
    for (const provider of this.providers) {
      const results = provider.provide(editor, activity);
      for (const result of results) {
        const existing = grouped.get(result.type) ?? [];
        grouped.set(result.type, [...existing, ...result.ranges]);
      }
    }
    for (const [type, ranges] of grouped) {
      editor.setDecorations(type, ranges);
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
      // vscode.workspace.onDidChangeTextDocument((event) => {
      //   const editor = vscode.window.visibleTextEditors.find((e) => e.document === event.document);
      //   if (editor) {
      //     this.decorate(editor);
      //   }
      // }),
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
    // const estate = this.findEstateAnchors(doc);

    editor.setDecorations(this.resolved, [
      // ...estate.map((e) => e.range),
      ...resolvedRanges,
    ]);

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

// export class DecorationService {
//   private unrelatedDecorationType = vscode.window.createTextEditorDecorationType({
//     opacity: '0.35', // Greys out unrelated code
//   });
//   private declarationDecorationType = vscode.window.createTextEditorDecorationType({
//     after: { contentText: ' 📌 [Declaration]', color: '#007acc', fontStyle: 'italic' },
//   });
//   private usageDecorationType = vscode.window.createTextEditorDecorationType({
//     after: { contentText: ' ⚡ [Flow]', color: '#28a745', fontStyle: 'italic' },
//   });
//   private resolved = vscode.window.createTextEditorDecorationType({
//     color: new vscode.ThemeColor('textLink.foreground'),
//   });
//   private unresolved = vscode.window.createTextEditorDecorationType({
//     color: new vscode.ThemeColor('descriptionForeground'),
//   });
//   constructor(private outputChannel: vscode.OutputChannel) {}
//   public getDisposables() {
//     return [
//       this.unrelatedDecorationType,
//       this.declarationDecorationType,
//       this.usageDecorationType,
//       this.resolved,
//       this.unresolved,
//     ];
//   }
//   public async analyzeAndDecorate(
//     uri?: vscode.Uri,
//     range?: vscode.Range,
//     analysisMode: string = 'default',
//   ) {
//     const editor = vscode.window.activeTextEditor;
//     const targetUri = uri || editor?.document.uri;
//     if (!targetUri) {
//       vscode.window.showErrorMessage('No active file found to analyze.');
//       return;
//     }
//     const filePath = targetUri.fsPath;
//     const targetRange = range || editor?.selection;
//     const lineNumber = targetRange ? targetRange.start.line + 1 : 1;
//     const config = vscode.workspace.getConfiguration('flowify');
//     const defaultMode = config.get<string>('defaultAnalysisMode', 'default');
//     const mode = analysisMode !== 'default' ? analysisMode : defaultMode;
//     try {
//       const cratePath = '/Users/future/KB/project/app/loi/crates/learn';
//       const binaryPath = '/Users/future/KB/project/app/loi/target/debug/loi';
//       const { stdout, stderr } = await execFileAsync(
//         binaryPath,
//         ['analyze', filePath, '--line', lineNumber.toString(), '--mode', mode],
//         { cwd: cratePath },
//       );
//       if (stderr) console.error('Daemon error:', stderr);
//       const result = JSON.parse(stdout.trim());
//       if (result.status === 'ok' && result.related_lines) {
//         const activeEditor = vscode.window.activeTextEditor;
//         if (activeEditor && activeEditor.document.uri.fsPath === filePath) {
//           const doc = activeEditor.document;
//           const declarationRanges: vscode.Range[] = [];
//           const usageRanges: vscode.Range[] = [];
//           const allRelatedLineNumbers = new Set<number>();
//           for (const item of result.related_lines) {
//             const lineIdx = item.line - 1;
//             if (lineIdx < 0 || lineIdx >= doc.lineCount) continue;
//             allRelatedLineNumbers.add(lineIdx);
//             const lineRange = doc.lineAt(lineIdx).range;
//             if (item.relation_type === 'Declaration' || item.relation_type === 'Assignment') {
//               declarationRanges.push(lineRange);
//             } else {
//               usageRanges.push(lineRange);
//             }
//           }
//           const unrelatedRanges: vscode.Range[] = [];
//           for (let i = 0; i < doc.lineCount; i++) {
//             if (!allRelatedLineNumbers.has(i)) {
//               unrelatedRanges.push(doc.lineAt(i).range);
//             }
//           }
//           activeEditor.setDecorations(this.unrelatedDecorationType, unrelatedRanges);
//           activeEditor.setDecorations(this.declarationDecorationType, declarationRanges);
//           activeEditor.setDecorations(this.usageDecorationType, usageRanges);
//         }
//       }
//     } catch (error) {
//       console.error('Failed to run background analyzer:', error);
//     }
//   }
// }

interface DecorationProvider {
  provide(editor: vscode.TextEditor, activity: AppActivity): DecorationResult[];
}
interface DecorationResult {
  type: vscode.TextEditorDecorationType;
  ranges: vscode.Range[];
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
        ranges: [
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
  private _allAnchors(editor: vscode.TextEditor, _activity: AppActivity): DecorationResult[] {
    const ranges = this.app.anchors.findByUri(editor.document.uri).flatMap((anchor) => {
      const src = anchor.src;
      if (!src) return [];
      return [
        new vscode.Range(
          src.startLine,
          src.startCharacter ?? 0,
          src.endLine,
          src.endCharacter ?? 100,
        ),
      ];
    });
    return [{ type: this.type, ranges }];
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
          ranges: [editor.document.lineAt(line).range],
        },
      ];
    });
  }
}

export class OwnershipDecorationProvider implements DecorationProvider {
  constructor(
    private type: vscode.TextEditorDecorationType,
    private app: AppStore,
    private subjectDecorationType: vscode.TextEditorDecorationType,
    private relatedDecorationType: vscode.TextEditorDecorationType,
    private labelDecorationType: vscode.TextEditorDecorationType,
  ) {}

  public provide(editor: vscode.TextEditor, activity: AppActivity): DecorationResult[] {
    const currentAnalysis = this.app.analysis.get();
    if (!currentAnalysis?.analysis?.node_context?.subject) {
      return [];
    }

    const {
      node_context: { subject },
      classification,
    } = currentAnalysis.analysis;
    const span = subject.span;

    // 1. Range for the main subject (Underline)
    const subjectRange = new vscode.Range(
      new vscode.Position(span.start_line - 1, span.start_col),
      new vscode.Position(span.end_line - 1, span.end_col),
    );

    // 2. Ranges for related lines (Highlighted)
    const relatedRanges: vscode.Range[] = (currentAnalysis.analysis.related_lines || []).map(
      (rel) => {
        const lineIdx = rel.line - 1;
        return new vscode.Range(
          lineIdx,
          0,
          lineIdx,
          editor.document.lineAt(lineIdx).range.end.character,
        );
      },
    );

    // 3. Fix label placement: Anchor it to the END of the subject's line
    // so the text renders cleanly on the far right instead of breaking up the code.
    const targetLineIdx = span.start_line - 1;
    const lineEndCharacter = editor.document.lineAt(targetLineIdx).range.end.character;
    const endOfLineRange = new vscode.Range(
      targetLineIdx,
      lineEndCharacter,
      targetLineIdx,
      lineEndCharacter,
    );

    const labelOptions: vscode.DecorationOptions = {
      range: endOfLineRange,
      renderOptions: {
        after: {
          contentText: `  [${subject.kind}]${classification ? ` (${classification})` : ""}`,
        },
      },
    };

    return [
      {
        type: this.subjectDecorationType,
        ranges: [subjectRange],
      },
      {
        type: this.relatedDecorationType,
        ranges: relatedRanges,
      },
      {
        type: this.labelDecorationType,
        ranges: [labelOptions] as any,
      },
    ];
  }
}
