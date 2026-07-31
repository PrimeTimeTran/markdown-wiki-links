import * as vscode from 'vscode';
import * as path from 'path';
import { parseLinks } from '../core/parser/linkParser';
import { parseEmbeds } from '../core/parser/embedParser';
import { buildFenceMask } from '../core/fenceMask';
import { innerRange } from '../core/parser/refRange';
import { resolveTarget } from '../core/resolver/resolveTarget';

import { IndexService } from './indexService';
import { BookmarkStore } from './bookmarkService';
import { logAnalysis } from '../extension';

const DEBOUNCE_MS = 250;

const EXT_PATH = '/Users/future/KB/project/app/markdown-wiki-links';

// Colours `[[...]]` / `![[...]]` in the editor by whether the resolver can actually resolve
// the target — resolved links take the editor link colour, unresolved ones are dimmed.
// This reflects real resolution (spaces, Unicode, every character the parser accepts),
// unlike a TextMate grammar that pattern-matches the link text.

export class WikiDecorations {
  private decorations = new Map<string, vscode.TextEditorDecorationType>();
  private stateDecorations = new Map<string, vscode.TextEditorDecorationType>();
  private initStateIcons() {
    this.stateDecorations.set(
      'muted',
      vscode.window.createTextEditorDecorationType({
        opacity: '0.35',
      }),
    );

    this.stateDecorations.set(
      'focused',
      vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        opacity: '1',
      }),
    );
    this.stateDecorations.set(
      'selected',
      vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
      }),
    );
  }
  private initIcons() {
    for (const icon of icons) {
      const iconPath = vscode.Uri.file(path.join(EXT_PATH, 'resources', `${icon}.svg`));
      const decoration = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPath,
        gutterIconSize: 'contain',
      });

      this.decorations.set(icon, decoration);
    }
  }
  private applyState(editor: vscode.TextEditor, state: string, lines: number[]) {
    const decoration = this.stateDecorations.get(state);
    if (!decoration) {
      console.warn(`Missing state decoration: ${state}`);
      return;
    }
    const ranges = lines.map((line) => editor.document.lineAt(line).range);
    editor.setDecorations(decoration, ranges);
  }
  private markLines(editor: vscode.TextEditor, icon: string, lines: number[]) {
    const decoration = this.decorations.get(icon);
    if (!decoration) {
      console.warn(`Missing decoration: ${icon}`);
      return;
    }
    const ranges = lines.map((line) => editor.document.lineAt(line).range);

    editor.setDecorations(decoration, ranges);
  }
  //   private markLines(editor: vscode.TextEditor, icon: string, lines: number[]) {
  //     const decoration = this.decorations.get(icon);
  //     if (!decoration) {
  //       console.warn(`Missing decoration: ${icon}`);
  //       return;
  //     }
  //     const ranges = lines.map((line) => editor.document.lineAt(line).range);
  //     editor.setDecorations(decoration, ranges);
  //   }
  private clearDecorations(editor: vscode.TextEditor) {
    for (const decoration of this.decorations.values()) {
      editor.setDecorations(decoration, []);
    }
    for (const decoration of this.stateDecorations.values()) {
      editor.setDecorations(decoration, []);
    }
  }
  private renderSymbolAnalysis(editor: vscode.TextEditor, subjectLine: number, children: number[]) {
    this.clearDecorations(editor);
    // selected symbol
    this.markLines(editor, 'binding', [subjectLine]);
    // related symbols
    this.markLines(editor, 'shadowing', children);

    // visual states
    this.applyState(editor, 'muted', children);

    this.applyState(editor, 'selected', [subjectLine]);
  }
  private previewIconStack(editor: vscode.TextEditor) {
    const startLine = editor.selection.active.line;
    this.clearDecorations(editor);
    icons.forEach((icon, index) => {
      const line = startLine + index;

      if (line >= editor.document.lineCount) {
        return;
      }

      this.markLines(editor, icon, [line]);
    });
  }
  private unrelatedDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0.35',
  });
  private declarationDecorationType = vscode.window.createTextEditorDecorationType({
    after: { contentText: ' 📌 [Declaration]', color: '#007acc', fontStyle: 'italic' },
  });
  private usageDecorationType = vscode.window.createTextEditorDecorationType({
    after: { contentText: ' ⚡ [Flow]', color: '#28a745', fontStyle: 'italic' },
  });
  private resolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('textLink.foreground'),
  });
  private unresolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('descriptionForeground'),
  });
  private timer?: ReturnType<typeof setTimeout>;
  private outputChannel: vscode.OutputChannel;
  constructor(
    private idx: IndexService,
    store: BookmarkStore,
    ctx: vscode.ExtensionContext,
    activityStore: ActivityStore,
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Flowify');
    activityStore.subscribe((activity) => {
      this.analyzeLine(activity);
    });
    ctx.subscriptions.push(
      this.resolved,
      this.unresolved,
      this.unrelatedDecorationType,
      this.declarationDecorationType,
      this.usageDecorationType,
    );
    this.initIcons();
    this.initStateIcons();
  }

  register(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      this.resolved,
      this.unresolved,
      this.unrelatedDecorationType,
      this.declarationDecorationType,
      this.usageDecorationType,
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        this.decorate(event.textEditor);
      }),

      vscode.window.onDidChangeVisibleTextEditors(() => {
        // this.decorateAllVisible();
      }),

      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.visibleTextEditors.find((e) => e.document === event.document);

        if (editor) {
          this.decorate(editor);
        }
      }),
    );
  }
  private schedule(): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      //   this.decorateAllVisible();
    }, DEBOUNCE_MS);
  }
  //   private decorateAllVisible(): void {
  //     for (const editor of vscode.window.visibleTextEditors) {
  //       //   this.decorate(editor);
  //       //   this.demoDecorations(editor);
  //       //   this.demoEstate(editor);
  //     //   this.demoEstate2(editor);
  //     }
  //   }
  private decorate(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'markdown') return;
    const doc = editor.document;
    const text = doc.getText();
    const mask = buildFenceMask(text);
    const refs = [...parseLinks(text, mask), ...parseEmbeds(text, mask)];
    const snap = this.idx.snapshotFor(doc.uri.fsPath);
    const resolvedRanges: vscode.Range[] = [];
    const unresolvedRanges: vscode.Range[] = [];
    for (const ref of refs) {
      const inner = innerRange(ref);
      const range = new vscode.Range(doc.positionAt(inner.start), doc.positionAt(inner.end));
      const bucket = resolveTarget(ref, doc.uri.fsPath, snap) ? resolvedRanges : unresolvedRanges;
      bucket.push(range);
    }
    const estates = this.findEstateFlags(doc);
    const estate = this.findEstateBookmarks(doc);
    editor.setDecorations(this.resolved, [...estate.map((e) => e.range)]);
    editor.setDecorations(this.resolved, [...estates.map((e) => e.range)]);
    editor.setDecorations(this.resolved, resolvedRanges);
    editor.setDecorations(this.unresolved, unresolvedRanges);
  }
  public async kickoff(uri?: vscode.Uri, range?: vscode.Range, analysisMode: string = 'default') {
    // console.log('Hi kickoff', uri, range, analysisMode);
    // this.analyzeLine(uri, range, analysisMode);
    // const editor = vscode.window.activeTextEditor;
    // const targetUri = uri || editor?.document.uri;
    // if (!targetUri) {
    //   vscode.window.showErrorMessage('No active file found to analyze.');
    //   return;
    // }
    // const filePath = targetUri.fsPath;
    // const targetRange = range || editor?.selection;
    // const lineNumber = targetRange ? targetRange.start.line + 1 : 1;
    // // Optional: Pull custom user settings from VS Code workspace configuration
    // const config = vscode.workspace.getConfiguration('flowify');
    // const defaultMode = config.get<string>('defaultAnalysisMode', 'standard');
    // const mode = analysisMode !== 'default' ? analysisMode : defaultMode;
    // console.log('FLOWIFY ANALYZE', { filePath, lineNumber });
    // try {
    //   const cratePath = '/Users/future/KB/project/app/loi/crates/learn';
    //   const binaryPath = '/Users/future/KB/project/app/loi/target/debug/loi';
    //   // 1. CLI src
    //   //   const { stdout, stderr } = await execFileAsync(
    //   //     'cargo',
    //   //     ['run', '--bin', 'loi', '--', 'analyze', filePath, '--line', lineNumber.toString()],
    //   //     {
    //   //       cwd: cratePath,
    //   //     },
    //   //   );
    //   // 2. Binary
    //   const { stdout, stderr } = await execFileAsync(
    //     binaryPath,
    //     ['analyze', filePath, '--line', lineNumber.toString(), '--mode', mode],
    //     {
    //       cwd: cratePath,
    //     },
    //   );
    //   if (stderr) console.error('Daemon error:', stderr);
    //   try {
    //     const result = JSON.parse(stdout.trim());
    //     logAnalysis(this.outputChannel, filePath, lineNumber, result);
    //     if (result.status === 'ok' && result.related_lines) {
    //       const editor = vscode.window.activeTextEditor;
    //       if (editor && editor.document.uri.fsPath === filePath) {
    //         const doc = editor.document;
    //         const declarationRanges: vscode.Range[] = [];
    //         const usageRanges: vscode.Range[] = [];
    //         const allRelatedLineNumbers = new Set<number>();
    //         // 1. Map backend response objects into editor Ranges
    //         for (const item of result.related_lines) {
    //           // item.line is 1-based from Rust
    //           const lineIdx = item.line - 1;
    //           if (lineIdx < 0 || lineIdx >= doc.lineCount) continue;
    //           allRelatedLineNumbers.add(lineIdx);
    //           const lineRange = doc.lineAt(lineIdx).range;
    //           if (item.relation_type === 'Declaration' || item.relation_type === 'Assignment') {
    //             declarationRanges.push(lineRange);
    //           } else {
    //             usageRanges.push(lineRange);
    //           }
    //         }
    //         // 2. Find lines to grey out (every line in file EXCEPT related ones)
    //         const unrelatedRanges: vscode.Range[] = [];
    //         for (let i = 0; i < doc.lineCount; i++) {
    //           if (!allRelatedLineNumbers.has(i)) {
    //             unrelatedRanges.push(doc.lineAt(i).range);
    //           }
    //         }
    //         // 3. Apply the decorations to the editor view
    //         editor.setDecorations(this.unrelatedDecorationType, unrelatedRanges);
    //         editor.setDecorations(this.declarationDecorationType, declarationRanges);
    //         editor.setDecorations(this.usageDecorationType, usageRanges);
    //       }
    //     }
    //   } catch (parseError) {
    //     console.log('Raw Daemon output (non-JSON):', stdout);
    //     //   try {
    //     //     const result = JSON.parse(stdout.trim());
    //     //     console.log(
    //     //       '%c[FLOWIFY EXT SERVER RESPONSE] %cParsed JSON:',
    //     //       'color: #28a745; font-weight: bold;',
    //     //       'color: inherit;',
    //     //       result,
    //     //     );
    //     //     logAnalysis(outputChannel, filePath, lineNumber, result);
    //     //     // vscode.window.showInformationMessage(`Analysis OK [${mode}]: ${result.action}`);
    //     //   } catch (parseError) {
    //     //     console.log('Raw Daemon output (non-JSON):', stdout);
    //     //     vscode.window.showErrorMessage(`Analysis Error [${mode}]: ${stdout}`);
    //     //   }
    //     //   // Parse the JSON output returned by the daemon
    //     //   try {
    //     //     const result = JSON.parse(stdout.trim());
    //     //     console.log(
    //     //       '%c[EXT] %cFLOWIFY ANALYZE',
    //     //       'color: #007acc; font-weight: bold;',
    //     //       'color: inherit;',
    //     //       { filePath, lineNumber },
    //     //     );
    //     //     // Inside your JSON parse block:
    //     //     console.log(
    //     //       '%c[EXT SERVER RESPONSE] %cParsed JSON:',
    //     //       'color: #28a745; font-weight: bold;',
    //     //       'color: inherit;',
    //     //       result,
    //     //     );
    //     //     // const outputChannel = vscode.window.createOutputChannel('Flowify Analyzer');
    //     //     // Log extension actions
    //     //     // outputChannel.appendLine(
    //     //     //   `[EXT] Triggered analysis for: ${filePath} at line ${lineNumber}`,
    //     //     // );
    //     //     // // Log server response
    //     //     // outputChannel.appendLine(`[SERVER] Received JSON: ${JSON.stringify(result, null, 2)}`);
    //     //     // Automatically open the channel panel if you want to see it pop up:
    //     //     // outputChannel.show(true);
    //     //     // Quick visual confirmation in VS Code UI
    //     //     vscode.window.showInformationMessage(`Analysis OK: ${result.action}`);
    //     //   } catch (parseError) {
    //     //     // Fallback if stdout contains cargo compile banners before the JSON string
    //     //     console.log('Raw Daemon output (non-JSON):', stdout);
    //     //   }
    //   }
    // } catch (error) {
    //   console.error('Failed to trigger background analysis CLI:', error);
    //   vscode.window.showErrorMessage('Failed to run background analyzer.');
    // }
  }
  public async analyzeLine(
    activity: Activity,
    // uri?: vscode.Uri,
    // range?: vscode.Range,
    // analysisMode: string = 'default',
  ) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    let item = {
      file: activity.editor.uri.toString(),
      line: activity.editor.line.toString(),
      column: activity.editor.column.toString(),
      text: activity.editor.lineText,
      scope: activity.scope,
    };
    console.log('[EXT] Click:');
    console.log('[EXT click] file', item.file);
    console.log('[EXT click] line', item.line);
    console.log('[EXT click] column', item.column);
    console.log('[EXT click] scope', item.scope);
    console.log('[EXT text] scope', item.text);
    console.log('[EXT click] scope', item.scope);

    const cratePath = '/Users/future/KB/project/app/loi/crates/learn';
    const binaryPath = '/Users/future/KB/project/app/loi/target/debug/loi';
    try {
      const { stdout, stderr } = await execFileAsync(
        binaryPath,
        ['analyze', item.file, '--line', item.line, '--column', item.column],
        { cwd: cratePath },
      );
      if (stderr) console.error('Daemon error:', stderr);

      console.log('[EXT Server] STDOUT:', stdout);
      const result = JSON.parse(stdout.trim());
      logAnalysis(this.outputChannel, item.file, item.line, result);
      console.log('previewIconStack next');
      this.previewIconStack(editor);
      if (result.status === 'ok' && result.related_lines) {
        this.applyDecorations(editor, item.file.toString(), result.related_lines);
      }
    } catch (error: any) {
      console.error('Failed to run background analyzer or parse stdout:', error);
      if (error.stderr) console.error('Binary stderr:', error.stderr);
      if (error.stdout) console.error('Binary stdout:', error.stdout);
    }
  }
  //   private applyDecorations(
  //     editor: vscode.TextEditor | undefined,
  //     filePath: string,
  //     relatedLines: any[],
  //   ) {
  //     // editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath);
  //     if (!editor) return;

  //     const doc = editor.document;

  //     const declarationRanges: vscode.Range[] = [];
  //     const usageRanges: vscode.Range[] = [];
  //     const allRelatedLineNumbers = new Set<number>();

  //     for (const item of relatedLines) {
  //       const lineIdx = item.line - 1;
  //       if (lineIdx < 0 || lineIdx >= doc.lineCount) continue;

  //       allRelatedLineNumbers.add(lineIdx);
  //       const lineRange = doc.lineAt(lineIdx).range;

  //       if (item.relation_type === 'Declaration' || item.relation_type === 'Assignment') {
  //         declarationRanges.push(lineRange);
  //       } else {
  //         usageRanges.push(lineRange);
  //       }
  //     }

  //     const unrelatedRanges: vscode.Range[] = [];
  //     const relatedRanges: vscode.Range[] = [];
  //     for (let i = 0; i < doc.lineCount; i++) {
  //       if (!allRelatedLineNumbers.has(i)) {
  //         unrelatedRanges.push(doc.lineAt(i).range);
  //       } else {
  //         relatedRanges.push(doc.lineAt(i).range);
  //       }
  //     }
  //     const ownershipMarker = vscode.window.createTextEditorDecorationType({
  //       after: {
  //         contentText: ' 👶',
  //         margin: '0 0 0 3em',
  //         color: '#888',
  //       },
  //       rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  //     });
  //     editor.setDecorations(ownershipMarker, relatedRanges);
  //     editor.setDecorations(this.unrelatedDecorationType, unrelatedRanges);
  //     editor.setDecorations(this.declarationDecorationType, declarationRanges);
  //     editor.setDecorations(this.usageDecorationType, usageRanges);

  //     const childIconDecoration = vscode.window.createTextEditorDecorationType({
  //       after: {
  //         contentText: ' 👶',
  //         margin: '0 0 0 20px',
  //         color: '#888',
  //       },
  //       rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  //     });

  //     const childRanges: vscode.Range[] = [];

  //     for (const item of relatedLines) {
  //       if (item.relation_type === 'Child') {
  //         const lineIdx = item.line - 1;
  //         childRanges.push(doc.lineAt(lineIdx).range);
  //       }
  //     }

  //     editor.setDecorations(childIconDecoration, childRanges);

  //     // if (editor) {
  //     //   this.highlightSurroundingLines(editor);
  //     // }
  //   }
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
    console.log(`Highlighted lines: ${linesToHighlight.join(', ')}`);
    const panel = vscode.window.createWebviewPanel(
      'ownershipGraph',
      'Ownership Analysis',
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
      contentText: ' 🧬',
      margin: '0 0 0 2em',
      color: '#888',
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private applyDecorations(
    editor: vscode.TextEditor | undefined,
    filePath: string,
    relatedLines: any[],
  ) {
    if (!editor) return;
    const doc = editor.document;
    const markerRanges: vscode.Range[] = [];
    for (const item of relatedLines) {
      const lineIdx = item.line - 1;
      if (lineIdx < 0 || lineIdx >= doc.lineCount) {
        continue;
      }
      markerRanges.push(doc.lineAt(lineIdx).range);
    }
    editor.setDecorations(this.ownershipMarkerDecoration, markerRanges);
    this.previewIconStack(editor);
  }
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
  private findEstateFlags(doc: vscode.TextDocument) {
    const results: Array<{ range: vscode.Range; tag: string }> = [];
    for (let line = 0; line < doc.lineCount; line++) {}
    return results;
  }
  private findEstateBookmarks(document: vscode.TextDocument): EstateNode[] {
    const nodes: EstateNode[] = [];

    // @connected

    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      let range = new vscode.Range(i, 0, i, text.length);
      if (text.includes('@branch')) {
        nodes.push({
          range,
          kind: 'tag',
          id: '@branch',
          icon: '🏠',
          label: 'Architecture',
          actions: [
            {
              kind: 'file',
              path: '/docs/architecture.md',
              label: 'Open Hub',
            },
            {
              kind: 'panel',
              panel: 'graph',
              label: 'Show Graph',
            },
            {
              kind: 'command',
              id: 'wiki.references',
              args: ['@branch'],
              label: 'References',
            },
          ],
        });
      }
      if (text.includes('@foo')) {
        nodes.push({
          range,
          kind: 'tag',
          id: '@foo',
          icon: '🏠',
          label: 'Architecture',
          actions: [
            {
              kind: 'file',
              path: '/docs/architecture.md',
              label: 'Open Hub',
            },
            {
              kind: 'panel',
              panel: 'graph',
              label: 'Show Graph',
            },
            {
              kind: 'command',
              id: 'wiki.references',
              args: ['@foo'],
              label: 'References',
            },
          ],
        });
      }
      if (text.includes('@bar')) {
        nodes.push({
          range,
          kind: 'tag',
          id: '@bar',
          label: 'Bar Bookmark',
          icon: '🔖',
          actions: [
            {
              kind: 'bookmark',
              id: '@bar',
              label: '🔖 Open Bookmark',
            },
            {
              kind: 'command',
              id: 'wiki.pin',
              args: ['@bar'],
              label: '📌 Pin Location',
            },
          ],
        });
      }
      if (text.includes('@spam')) {
        nodes.push({
          range,
          kind: 'tag',
          id: '@spam',
          label: 'Spam Node',
          icon: '🧹',
          actions: [
            {
              kind: 'command',
              id: 'wiki.ignore',
              args: ['@spam'],
              label: '🧹 Ignore',
            },
            {
              kind: 'panel',
              panel: 'references',
              label: '🔍 Find References',
            },
          ],
        });
      }
      if (text.includes('@ham')) {
        nodes.push({
          range,
          kind: 'tag',
          id: '@ham',
          label: 'Ham Node',
          icon: '📖',
          actions: [
            {
              kind: 'preview',
              path: '/tmp/ham-preview.md',
              label: '📖 Preview',
            },
            {
              kind: 'url',
              url: 'https://en.wikipedia.org/wiki/Quantopian',
              label: '🌐 External Links',
            },
          ],
        });
      }
    }
    return nodes;
  }
  private estate(editor: vscode.TextEditor): void {
    const doc = editor.document;
    const estates = [
      {
        range: new vscode.Range(5, 0, 5, doc.lineAt(5).text.length),
        kind: 'bookmark',
        label: 'Architecture',
        icon: '🏠',
        target: '/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
      },

      {
        range: new vscode.Range(7, 0, 7, doc.lineAt(7).text.length),
        kind: 'external',
        label: 'GitHub',
        target: 'https://github.com/PrimeTimeTran',
      },
    ];

    // render estate decorations
  }
  //   private onFold() {
  //     new vscode.CodeLens(range, {
  //       title: this.isFolded(range) ? '📂 Unfold' : '📦 Fold',
  //       command: 'wiki.toggleFold',
  //       arguments: [range],
  //     });
  //   }

  //   private decorateEstate(editor: vscode.TextEditor) {
  //     const estates = this.analyzeDocument(editor.document);

  //     const resolved = estates.filter((x) => x.target).map((x) => x.range);

  //     editor.setDecorations(this.resolved, resolved);
  //   }

  //   private analyzeDocument(doc: vscode.TextDocument): EstateNode[] {
  //     const text = doc.getText();
  //     const mask = buildFenceMask(text);
  //     const refs = [...parseLinks(text, mask), ...parseEmbeds(text, mask)];
  //     return refs.map((ref) => {
  //       const inner = innerRange(ref);
  //       return {
  //         range: new vscode.Range(doc.positionAt(inner.start), doc.positionAt(inner.end)),
  //         kind: 'wikilink',
  //         label: ref.target,
  //         target: resolveTarget(ref, doc.uri.fsPath, this.idx.snapshotFor(doc.uri.fsPath)),
  //       };
  //     });
  //   }

  //   private registerEstateHover(ctx: vscode.ExtensionContext) {
  //     ctx.subscriptions.push(
  //       vscode.languages.registerHoverProvider('markdown', {
  //         provideHover(document, position) {
  //           return new vscode.Hover(
  //             new vscode.MarkdownString(
  //               `
  //   ## 🏠 Estate Node

  //   **Name**
  //   Architecture

  //   **Status**
  //   Active

  //   **References**
  //   24
  //   `,
  //             ),
  //           );
  //         },
  //       }),
  //     );
  //   }
  private registerHardcodedLinks(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      vscode.commands.registerCommand('wiki.openEstate', (id) => {
        vscode.window.showInformationMessage(`Open Estate: ${id}`);
      }),
      vscode.commands.registerCommand('wiki.showGraph', (id) => {
        vscode.window.showInformationMessage(`Graph: ${id}`);
      }),
      vscode.languages.registerDocumentLinkProvider('markdown', {
        provideDocumentLinks(document) {
          return [
            // Local markdown
            new vscode.DocumentLink(
              new vscode.Range(5, 0, 5, document.lineAt(5).text.length),
              vscode.Uri.file('/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md'),
            ),

            // Workspace file
            new vscode.DocumentLink(
              new vscode.Range(6, 0, 6, document.lineAt(6).text.length),
              vscode.Uri.file('/Users/future/KB/project/app/loi/README.md'),
            ),

            // GitHub
            new vscode.DocumentLink(
              new vscode.Range(7, 0, 7, document.lineAt(7).text.length),
              vscode.Uri.parse('https://github.com/PrimeTimeTran'),
            ),

            // Google
            new vscode.DocumentLink(
              new vscode.Range(8, 0, 8, document.lineAt(8).text.length),
              vscode.Uri.parse('https://www.google.com'),
            ),

            // Wikipedia
            new vscode.DocumentLink(
              new vscode.Range(9, 0, 9, document.lineAt(9).text.length),
              vscode.Uri.parse('https://en.wikipedia.org/wiki/Quantopian'),
            ),
          ];
        },
      }),
    );
  }
  private demoDecorations(editor: vscode.TextEditor): void {
    const doc = editor.document;
    const count = doc.lineCount;
    if (count < 20) return;
    const line = (n: number) => new vscode.Range(n, 0, n, doc.lineAt(n).text.length);

    const examples = [
      ['colorRed', 0],
      ['colorGreen', 1],
      ['colorBlue', 2],
      ['colorPurple', 3],

      ['backgroundYellow', 4],
      ['backgroundBlue', 5],

      ['bold', 6],
      ['italic', 7],
      ['underline', 8],

      ['borderThin', 9],
      ['borderThick', 10],
      //   ['borderLeft', 11],
      //   ['borderRight', 12],

      ['wholeLine', 13],

      ['gutter', 14],

      ['ruler', 15],
    ] as const;

    //
    // Fixed reference examples
    //
    for (const [name, lineNumber] of examples) {
      editor.setDecorations(this.foos[name], [line(lineNumber)]);
    }

    //
    // Dynamic stress test:
    // scatter red markers everywhere
    //
    // const redLines: vscode.Range[] = [];
    // for (let i = 16; i < count; i += 3) {
    //   redLines.push(line(i));
    // }
    // editor.setDecorations(this.foos.colorRed, redLines);

    //
    // Dynamic estate-style example
    //
    // editor.setDecorations(
    //   this.foos.after,
    //   redLines.map((range) => ({
    //     range,
    //     renderOptions: {
    //       after: {
    //         contentText: '  🏠 estate object',
    //       },
    //     },
    //   })),
    // );

    //
    // Dynamic before icons
    //
    // editor.setDecorations(
    //   this.foos.before,
    //   redLines.map((range) => ({
    //     range,
    //     renderOptions: {
    //       before: {
    //         contentText: '🔗 ',
    //       },
    //     },
    //   })),
    // );
  }
  private decoration(options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType(options);
  }
  private foos = {
    // Colors
    colorRed: this.decoration({
      color: '#ff0000',
    }),
    colorGreen: this.decoration({
      color: '#00aa00',
    }),
    colorBlue: this.decoration({
      color: '#0066ff',
    }),
    colorPurple: this.decoration({
      color: '#9900ff',
    }),
    // Backgrounds
    backgroundYellow: this.decoration({
      backgroundColor: '#ffff0080',
    }),
    backgroundBlue: this.decoration({
      backgroundColor: '#0088ff40',
    }),
    // Font
    bold: this.decoration({
      fontWeight: 'bold',
    }),
    italic: this.decoration({
      fontStyle: 'italic',
    }),
    underline: this.decoration({
      textDecoration: 'underline',
    }),
    // Borders
    borderThin: this.decoration({
      border: '1px solid #ff00ff',
    }),
    borderThick: this.decoration({
      border: '4px solid #ff0000',
    }),
    leftStripe: this.decoration({
      border: '0 0 0 4px solid #00ff00',
    }),
    rightStripe: this.decoration({
      border: '0 4px 0 0 solid #0000ff',
    }),
    leftMarker: this.decoration({
      overviewRulerColor: '#00ff00',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    }),
    rightMarker: this.decoration({
      overviewRulerColor: '#0000ff',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    // borderLeft: this.decoration({
    //   borderLeft: '4px solid #00ff00',
    // }),

    // borderRight: this.decoration({
    //   borderRight: '4px solid #0000ff',
    // }),

    // Whole line
    wholeLine: this.decoration({
      isWholeLine: true,
      backgroundColor: '#00ff0025',
    }),

    // Text additions
    before: this.decoration({}),
    after: this.decoration({}),
    // Hide
    hidden: this.decoration({
      textDecoration: 'none; display:none;',
    }),

    // Gutter
    gutter: this.decoration({
      gutterIconPath: vscode.Uri.file(
        '/Users/future/KB/project/app/markdown-wiki-links/media/account_box.svg',
      ),
      gutterIconSize: 'contain',
    }),

    // Scrollbar marker
    ruler: this.decoration({
      overviewRulerColor: '#ff0000',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
  };
  private demoEstate(editor: vscode.TextEditor): void {
    const doc = editor.document;
    const items = [
      { line: 5, name: 'Architecture', status: 'active' },
      { line: 6, name: 'Database', status: 'warning' },
      { line: 7, name: 'Missing Node', status: 'broken' },
      { line: 8, name: 'Reference', status: 'linked' },
      { line: 9, name: 'Decision', status: 'important' },
    ];

    // for (const item of items) {
    //   const range = new vscode.Range(item.line, 0, item.line, doc.lineAt(item.line).text.length);
    //   this.demoHighlight(editor, range, item);
    //   this.demoBadge(editor, range, item);
    //   this.demoIcon(editor, range, item);
    // }
  }
  private link() {
    // 1. Create a URI with the 'command:' scheme
    const commandUri = vscode.Uri.parse('command:workbench.action.showCommands');
    // 2. Format it into an isolated Markdown string
    const markdown = new vscode.MarkdownString(
      `Click here to open the [Command Palette](${commandUri})`,
    );
    // 3. Mark it as trusted so VS Code executes the link securely
    markdown.isTrusted = true;
  }
  private demoEstate2(editor: vscode.TextEditor): void {
    const doc = editor.document;
    const lines = Array.from({ length: 50 }, (_, i) => 0 + i);

    const annotations: Annotation[] = [
      //   {
      //     range: this.lineRange(doc, lines[0]),
      //     label: 'Workspace Note',
      //     icon: '📄',
      //     style: {
      //       color: '#4caf50',
      //       background: '#4caf5015',
      //       underline: true,
      //     },
      //     action: {
      //       kind: 'navigate',
      //       target: '/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
      //     },
      //     metadata: {
      //       type: 'workspace',
      //       indexed: true,
      //       source: 'IndexService.add',
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[5]),
      //     label: 'GitHub',
      //     icon: '🌐',
      //     style: {
      //       color: '#2196f3',
      //       background: '#2196f315',
      //       underline: true,
      //     },
      //     action: {
      //       kind: 'navigate',
      //       target: 'https://github.com/PrimeTimeTran',
      //     },
      //     metadata: {
      //       type: 'external',
      //       provider: 'external_links',
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[10]),
      //     label: 'Architecture',
      //     icon: '🏠',
      //     style: {
      //       color: '#0066ff',
      //       background: '#0066ff20',
      //       emphasis: 'bold',
      //     },
      //     action: {
      //       kind: 'navigate',
      //       target: '/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
      //     },
      //     metadata: {
      //       type: 'hub',
      //       references: 24,
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[15]),
      //     label: 'Database Schema',
      //     icon: '🗄️',
      //     style: {
      //       //   color: '#ffaa00',
      //       background: '#ffaa0015',
      //       underline: true,
      //     },
      //     action: {
      //       kind: 'showDetails',
      //     },
      //     metadata: {
      //       type: 'entity',
      //       tables: 12,
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[20]),
      //     label: 'Missing Dependency',
      //     icon: '❌',
      //     style: {
      //       color: '#ff3333',
      //       background: '#ff000020',
      //       emphasis: 'bold',
      //     },
      //     metadata: {
      //       type: 'error',
      //       severity: 'high',
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[25]),
      //     label: 'External Reference',
      //     icon: '🔗',
      //     style: {
      //       color: '#00aa55',
      //       background: '#00aa5515',
      //     },
      //     action: {
      //       kind: 'navigate',
      //       target: 'https://example.com/reference',
      //     },
      //     metadata: {
      //       type: 'link',
      //       references: 8,
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[30]),
      //     label: 'Design Decision',
      //     icon: '💡',
      //     style: {
      //       color: '#9900ff',
      //       background: '#9900ff15',
      //       emphasis: 'italic',
      //     },
      //     metadata: {
      //       type: 'decision',
      //       status: 'accepted',
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[35]),
      //     label: 'Performance Note',
      //     icon: '⚡',
      //     style: {
      //       //   color: '#ff8800',
      //       background: '#ff880015',
      //       emphasis: 'bold',
      //     },
      //     metadata: {
      //       type: 'optimization',
      //       impact: 'medium',
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[40]),
      //     label: 'Generated Artifact',
      //     icon: '📦',
      //     style: {
      //       color: '#555555',
      //       background: '#55555515',
      //     },
      //     action: {
      //       kind: 'showDetails',
      //     },
      //     metadata: {
      //       type: 'generated',
      //       source: 'compiler',
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[45]),
      //     label: 'Final Output',
      //     icon: '🚀',
      //     style: {
      //       color: '#00aaaa',
      //       background: '#00aaaa20',
      //       emphasis: 'bold',
      //     },
      //     metadata: {
      //       type: 'milestone',
      //       complete: true,
      //     },
      //   },
      //   {
      //     range: this.lineRange(doc, lines[50]),
      //     label: 'WikiLink',
      //     icon: '🔗',
      //     placement: {
      //       kind: 'afterLine',
      //       column: 75,
      //     },
      //     style: {
      //       color: '#00aa88',
      //       background: '#00aa8820',
      //       underline: true,
      //     },
      //     action: {
      //       kind: 'navigate',
      //       target: 'file:///Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
      //     },
      //     metadata: {
      //       type: 'wikilink',
      //       title: 'Semantic Workspace Protocol',
      //     },
      //   },
    ];
    const demo: Annotation[] = [
      {
        range: this.lineRange(doc, lines[10]),
        label: 'Architecture',
        icon: '🏠',
        style: {
          color: '#0066ff',
          background: '#0066ff20',
          //   emphasis: 'bold',
        },
        action: {
          kind: 'navigate',
          target: '/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
        },
        metadata: {
          type: 'hub',
          references: 24,
        },
      },
      {
        range: this.lineRange(doc, lines[0]),
        label: 'Workspace Note',
        icon: '📄',
        style: {
          color: '#4caf50',
          background: '#4caf5015',
          underline: true,
        },
        action: {
          kind: 'navigate',
          target: '/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
        },
        metadata: {
          type: 'workspace',
          indexed: true,
          source: 'IndexService.add',
        },
      },
      {
        range: this.lineRange(doc, lines[3]),
        label: 'GitHub',
        icon: '🌐',
        style: {
          color: '#2196f3',
          background: '#2196f315',
          underline: true,
        },
        action: {
          kind: 'navigate',
          target: 'https://github.com/PrimeTimeTran',
        },
        metadata: {
          type: 'external',
          provider: 'external_links',
        },
      },
      {
        range: this.lineRange(doc, lines[10]),
        label: 'Architecture decision',
        icon: '🏠',
        style: {
          color: '#888888',
        },
        action: {
          kind: 'navigate',
          target: '/path/to/doc.md',
        },
        metadata: {
          type: 'note',
        },
      },
    ];

    this.addNote(editor, lines);
    this.anoHighlight(editor, demo);
    this.anoBadge(editor, demo);
    this.anoIcon(editor, demo);
  }
  private addNote(editor: vscode.TextEditor, lines: number[]) {
    const doc = editor.document;
    const N = 30;
    const items: Annotation[] = [];
    Array.from({ length: N - 25 }).forEach((_, idx) => {
      items.push({
        range: this.lineRange(doc, lines[idx]),
        label: 'Architecture decision',
        icon: '🏠',
        style: {
          color: '#888888',
        },
        action: {
          kind: 'navigate',
          target: '/path/to/doc.md',
        },
        metadata: {
          type: 'note',
        },
      });
    });

    this.anoNoteee(editor, items);
  }
  private anoNoteee(editor: vscode.TextEditor, annotations: Annotation[]): void {
    editor.setDecorations(
      this.noteDecoration,
      annotations.map((a) => ({
        range: a.range,
        renderOptions: {
          after: {
            contentText: `  ${a.icon ?? '📝'} ${a.label ?? ''}`,
          },
        },
      })),
    );
  }

  private noteDecoration2 = vscode.window.createTextEditorDecorationType({
    after: {
      color: new vscode.ThemeColor('descriptionForeground'),
      fontStyle: 'italic',
      margin: '0 0 0 1em',
    },
  });

  private noteDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      color: new vscode.ThemeColor('descriptionForeground'),
      fontStyle: 'italic',
      margin: '0 0 0 1em',
    },
  });

  private anoNote(editor: vscode.TextEditor, annotations: Annotation[]): void {
    editor.setDecorations(
      this.noteDecoration,
      annotations.map((a) => ({
        range: a.range,
        renderOptions: {
          after: {
            contentText: `  ${a.icon ?? '📝'} ${a.label ?? ''}`,
          },
        },
      })),
    );
  }
  private anoHighlight(editor: vscode.TextEditor, annotations: Annotation[]): void {
    const groups = new Map<string, vscode.Range[]>();
    for (const a of annotations) {
      const key = JSON.stringify(a.style ?? {});

      const ranges = groups.get(key) ?? [];
      ranges.push(a.range);
      groups.set(key, ranges);
    }
    for (const [key, ranges] of groups) {
      const style = JSON.parse(key);
      const decoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: style.background,
        color: style.color,
        textDecoration: style.underline ? 'underline' : undefined,
      });
      editor.setDecorations(decoration, ranges);
    }
  }
  // No styled at all
  private addHighlight = vscode.window.createTextEditorDecorationType({});
  private addHighlight2: vscode.TextEditorDecorationType =
    vscode.window.createTextEditorDecorationType({});
  // Text color only Changes
  private addHighlight3 = vscode.window.createTextEditorDecorationType({
    backgroundColor: '#8e44ad15',
    color: '#8e44ad',
    textDecoration: 'underline',
  });
  // Actual highlight style from first char to the last
  private addHighlight4 = vscode.window.createTextEditorDecorationType({
    backgroundColor: '#ffff0040',
    border: '1px solid #ffaa00',
  });
  private anoBadge(editor: vscode.TextEditor, annotations: Annotation[]): void {
    editor.setDecorations(
      this.addBadge,
      annotations.map((a) => ({
        range: a.range,
        renderOptions: {
          after: {
            contentText: `  ${a.icon ?? ''} ${a.label ?? ''}`,
          },
        },
      })),
    );
  }
  private anoIcon(editor: vscode.TextEditor, annotations: Annotation[]): void {
    editor.setDecorations(
      this.addIcon,
      annotations.map((a) => a.range),
    );
  }

  private addDecorationTypeNew() {
    const smallNumberDecorationType = vscode.window.createTextEditorDecorationType({
      borderWidth: '1px',
      borderStyle: 'solid',
      overviewRulerColor: 'blue',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      light: {
        // this color will be used in light color themes
        borderColor: 'darkblue',
      },
      dark: {
        // this color will be used in dark color themes
        borderColor: 'lightblue',
      },
    });
  }

  // Top 5 methods
  private demoHighlight(editor: vscode.TextEditor, range: vscode.Range, item: any): void {
    editor.setDecorations(this.addHighlight, [range]);
  }
  private demoBadge(editor: vscode.TextEditor, range: vscode.Range, item: any): void {
    editor.setDecorations(this.addBadge, [
      {
        range,
        renderOptions: {
          after: {
            contentText: `  🏠 ${item.name} (${item.status})`,
          },
        },
      },
    ]);
  }
  private demoIcon(editor: vscode.TextEditor, range: vscode.Range, item: any): void {
    editor.setDecorations(this.addIcon, [range]);
  }
  // From to omg plz work
  private lineRange(doc: vscode.TextDocument, line: number): vscode.Range {
    return doc.lineAt(line).range;
  }

  private addBadge = vscode.window.createTextEditorDecorationType({});
  private addIcon = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(
      '/Users/future/KB/project/app/markdown-wiki-links/media/account_box.svg',
    ),
    gutterIconSize: 'contain',
  });
  private demoGutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(
      '/Users/future/KB/project/app/markdown-wiki-links/media/circle.svg',
    ),
    gutterIconSize: 'contain',
  });
  private demoColor = vscode.window.createTextEditorDecorationType({
    color: 'red',
  });
  private demoBackground = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255,0,0,0.2)',
  });
  private demoAfter = vscode.window.createTextEditorDecorationType({});
  private demoBefore = vscode.window.createTextEditorDecorationType({});
  private demoHidden = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none; display:none;',
  });
  private demoBorder = vscode.window.createTextEditorDecorationType({
    border: '1px solid',
  });
  private demoBold = vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
  });
  private demoUnderline = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline',
  });
  private demoWholeLine = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(0,255,0,0.1)',
  });
}
export class WikiDecoration {
  private decorate(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'markdown') return;
    const doc = editor.document;
    //
    // Playground ranges
    //
    const firstLine = new vscode.Range(0, 0, 0, doc.lineAt(0).text.length);
    const secondLine = new vscode.Range(1, 0, 1, doc.lineAt(1).text.length);
    //
    // 1. Background
    //
    editor.setDecorations(this.backgroundDemo, [firstLine]);
    //
    // 2. Text after
    //
    editor.setDecorations(this.afterDemo, [
      {
        range: secondLine,
        renderOptions: {
          after: {
            contentText: '  🔗 loi tran ob object',
            color: new vscode.ThemeColor('descriptionForeground'),
          },
        },
      },
    ]);
    //
    // 3. Text before
    //
    editor.setDecorations(this.beforeDemo, [
      {
        range: secondLine,
        renderOptions: {
          before: {
            contentText: '🏠 ',
          },
        },
      },
    ]);
    //
    // 4. Hide ceremony
    //
    editor.setDecorations(this.hiddenDemo, [new vscode.Range(2, 0, 2, doc.lineAt(2).text.length)]);
    //
    // 5. Border
    //
    editor.setDecorations(this.borderDemo, [firstLine]);
    //
    // 6. Gutter
    //
    editor.setDecorations(this.gutterDemo, [secondLine]);
    //
    // 7. Whole line
    //
    editor.setDecorations(this.lineDemo, [firstLine]);
    //
    // 8. Overview ruler
    //
    editor.setDecorations(this.rulerDemo, [firstLine]);
    //
    // 9. Font
    //
    editor.setDecorations(this.fontDemo, [secondLine]);
    //
    // 10. Underline
    //
    editor.setDecorations(this.underlineDemo, [secondLine]);
  }
  private resolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('textLink.foreground'),
  });
  private unresolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('descriptionForeground'),
  });
  // 1. Change background
  private backgroundDemo = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
  });
  // 2. Add text before
  private beforeDemo = vscode.window.createTextEditorDecorationType({});
  // 3. Add text after
  private afterDemo = vscode.window.createTextEditorDecorationType({});
  // 4. Hide text
  private hiddenDemo = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none; display:none;',
  });
  // 5. Border / outline
  private borderDemo = vscode.window.createTextEditorDecorationType({
    border: '1px solid',
  });
  // 6. Gutter icon
  private gutterDemo = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file('/absolute/path/to/icon.svg'),
    gutterIconSize: 'contain',
  });
  // 7. Whole line decoration
  private lineDemo = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
  });
  // 8. Overview ruler
  private rulerDemo = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
  // 9. Font styling
  private fontDemo = vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    fontStyle: 'italic',
  });
  // 10. Letter spacing / text effect
  private underlineDemo = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline wavy',
  });
  private timer?: ReturnType<typeof setTimeout>;
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
  | 'highlight'
  | 'inline-after'
  | 'gutter'
  | 'overview'
  | 'codelens'

  // discovery/navigation
  | 'sidebar'
  | 'panel';

export interface AnnotationAction {
  kind: 'navigate' | 'command' | 'open' | 'reveal';
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
      kind: 'inline';
    }
  | {
      kind: 'afterLine';
      column?: number;
    }
  | {
      kind: 'gutter';
    };

type Action =
  | {
      kind: 'navigate';
      target: string;
    }
  | {
      kind: 'showDetails';
    };

type Style = {
  color?: string;
  background?: string;
  emphasis?: 'bold' | 'italic';
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
//   | { kind: 'bookmark'; id: string }
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
      kind: 'file';
      path: string;
      label: string;
    }
  | {
      kind: 'url';
      url: string;
      label: string;
    }
  | {
      kind: 'preview';
      path: string;
      label: string;
    }
  | {
      kind: 'panel';
      panel: 'references' | 'graph' | 'outline';
      label: string;
    }
  | {
      kind: 'command';
      id: string;
      args?: unknown[];
      label: string;
    }
  | {
      kind: 'bookmark';
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

import * as util from 'util';
const execFileAsync = util.promisify(execFile);
import { execFile } from 'child_process';
import { Activity, ActivityStore } from './activityService';
import { icons } from '../ownership';
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
