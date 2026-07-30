import * as vscode from 'vscode';

import { parseLinks } from '../core/parser/linkParser';
import { parseEmbeds } from '../core/parser/embedParser';
import { buildFenceMask } from '../core/fenceMask';
import { innerRange } from '../core/parser/refRange';
import { resolveTarget } from '../core/resolver/resolveTarget';

import { IndexService } from './indexService';

// Edits fire onDidChangeTextDocument per keystroke; coalesce re-decoration to one pass per
// idle window so a large document is not re-scanned on every character.
const DEBOUNCE_MS = 250;

// Colours `[[...]]` / `![[...]]` in the editor by whether the resolver can actually resolve
// the target — resolved links take the editor link colour, unresolved ones are dimmed.
// This reflects real resolution (spaces, Unicode, every character the parser accepts),
// unlike a TextMate grammar that pattern-matches the link text.

// -  Inline link clickable
// -  hover panel
// -  notification
// -  icon
// -  highlight
// -  gutter icon left
// -  gutter icon right
// -  left/right strip

export class WikiDecorations {
  private resolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('textLink.foreground'),
  });
  private unresolved = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('descriptionForeground'),
  });
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private idx: IndexService) {}

  register(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        this.decorate(event.textEditor);
      }),
    );
    ctx.subscriptions.push(
      this.resolved,
      this.unresolved,
      vscode.window.onDidChangeVisibleTextEditors(() => this.decorateAllVisible()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (vscode.window.visibleTextEditors.some((ed) => ed.document === e.document)) {
          this.schedule();
        }
      }),
      { dispose: () => this.cancel() },
    );
    ctx.subscriptions.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        const editor = event.textEditor;
        console.log(
          editor.visibleRanges.map((r) => ({
            start: r.start.line,
            end: r.end.line,
          })),
        );
        this.decorate(editor);
      }),
    );
    this.decorateAllVisible();
  }

  private schedule(): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.decorateAllVisible();
    }, DEBOUNCE_MS);
  }

  private decorateAllVisible(): void {
    for (const editor of vscode.window.visibleTextEditors) this.decorate(editor);
  }

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
    // const estates = this.findEstateFlags(doc);
    // const estate = this.findEstateBookmarks(doc);
    // editor.setDecorations(this.estateDecs, [...estate.map((e) => e.range)]);
    // editor.setDecorations(this.estateDecs, [...estates.map((e) => e.range)]);
    // editor.setDecorations(this.resolved, resolvedRanges);
    // editor.setDecorations(this.unresolved, unresolvedRanges);
  }

  private cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
  demoLSPFeedbackToUsers(ctx: vscode.ExtensionContext): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.decorate(editor);
      //   this.estate(editor);
      //   this.demoDecorations(editor);
      //   this.demoEstate2(editor);
    }
  }
  //   private findEstateFlags(doc: vscode.TextDocument) {
  //     const results: Array<{ range: vscode.Range; tag: string }> = [];
  //     for (let line = 0; line < doc.lineCount; line++) {
  //     }
  //     return results;
  //   }
  //   private findEstateBookmarks(document: vscode.TextDocument): EstateNode[] {
  //     const nodes: EstateNode[] = [];

  //     // @connected
  //     for (let i = 0; i < document.lineCount; i++) {
  //       const text = document.lineAt(i).text;
  //       let range = new vscode.Range(i, 0, i, text.length);
  //       if (text.includes('@branch')) {
  //         nodes.push({
  //           range,
  //           kind: 'tag',
  //           id: '@branch',
  //           icon: '🏠',
  //           label: 'Architecture',
  //           actions: [
  //             {
  //               kind: 'file',
  //               path: '/docs/architecture.md',
  //               label: 'Open Hub',
  //             },
  //             {
  //               kind: 'panel',
  //               panel: 'graph',
  //               label: 'Show Graph',
  //             },
  //             {
  //               kind: 'command',
  //               id: 'wiki.references',
  //               args: ['@branch'],
  //               label: 'References',
  //             },
  //           ],
  //         });
  //       }
  //       if (text.includes('@foo')) {
  //         nodes.push({
  //           range,
  //           kind: 'tag',
  //           id: '@foo',
  //           icon: '🏠',
  //           label: 'Architecture',
  //           actions: [
  //             {
  //               kind: 'file',
  //               path: '/docs/architecture.md',
  //               label: 'Open Hub',
  //             },
  //             {
  //               kind: 'panel',
  //               panel: 'graph',
  //               label: 'Show Graph',
  //             },
  //             {
  //               kind: 'command',
  //               id: 'wiki.references',
  //               args: ['@foo'],
  //               label: 'References',
  //             },
  //           ],
  //         });
  //       }
  //       if (text.includes('@bar')) {
  //         nodes.push({
  //           range,
  //           kind: 'tag',
  //           id: '@bar',
  //           label: 'Bar Bookmark',
  //           icon: '🔖',
  //           actions: [
  //             {
  //               kind: 'bookmark',
  //               id: '@bar',
  //               label: '🔖 Open Bookmark',
  //             },
  //             {
  //               kind: 'command',
  //               id: 'wiki.pin',
  //               args: ['@bar'],
  //               label: '📌 Pin Location',
  //             },
  //           ],
  //         });
  //       }
  //       if (text.includes('@spam')) {
  //         nodes.push({
  //           range,
  //           kind: 'tag',
  //           id: '@spam',
  //           label: 'Spam Node',
  //           icon: '🧹',
  //           actions: [
  //             {
  //               kind: 'command',
  //               id: 'wiki.ignore',
  //               args: ['@spam'],
  //               label: '🧹 Ignore',
  //             },
  //             {
  //               kind: 'panel',
  //               panel: 'references',
  //               label: '🔍 Find References',
  //             },
  //           ],
  //         });
  //       }
  //       if (text.includes('@ham')) {
  //         nodes.push({
  //           range,
  //           kind: 'tag',
  //           id: '@ham',
  //           label: 'Ham Node',
  //           icon: '📖',
  //           actions: [
  //             {
  //               kind: 'preview',
  //               path: '/tmp/ham-preview.md',
  //               label: '📖 Preview',
  //             },
  //             {
  //               kind: 'url',
  //               url: 'https://en.wikipedia.org/wiki/Quantopian',
  //               label: '🌐 External Links',
  //             },
  //           ],
  //         });
  //       }
  //     }
  //     return nodes;
  //   }

  //   private estate(editor: vscode.TextEditor): void {
  //     const doc = editor.document;
  //     const estates = [
  //       {
  //         range: new vscode.Range(5, 0, 5, doc.lineAt(5).text.length),
  //         kind: 'bookmark',
  //         label: 'Architecture',
  //         icon: '🏠',
  //         target: '/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
  //       },

  //       {
  //         range: new vscode.Range(7, 0, 7, doc.lineAt(7).text.length),
  //         kind: 'external',
  //         label: 'GitHub',
  //         target: 'https://github.com/PrimeTimeTran',
  //       },
  //     ];

  //     // render estate decorations
  //   }

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
  // ## 🏠 Estate Node

  // **Name**
  // Architecture

  // **Status**
  // Active

  // **References**
  // 24
  // `,
  //             ),
  //           );
  //         },
  //       }),
  //     );
  //   }
  //   private registerHardcodedLinks(ctx: vscode.ExtensionContext): void {
  //     ctx.subscriptions.push(
  //       vscode.commands.registerCommand('wiki.openEstate', (id) => {
  //         vscode.window.showInformationMessage(`Open Estate: ${id}`);
  //       }),
  //       vscode.commands.registerCommand('wiki.showGraph', (id) => {
  //         vscode.window.showInformationMessage(`Graph: ${id}`);
  //       }),
  //       vscode.languages.registerDocumentLinkProvider('markdown', {
  //         provideDocumentLinks(document) {
  //           return [
  //             // Local markdown
  //             new vscode.DocumentLink(
  //               new vscode.Range(5, 0, 5, document.lineAt(5).text.length),
  //               vscode.Uri.file('/Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md'),
  //             ),

  //             // Workspace file
  //             new vscode.DocumentLink(
  //               new vscode.Range(6, 0, 6, document.lineAt(6).text.length),
  //               vscode.Uri.file('/Users/future/KB/project/app/loi/README.md'),
  //             ),

  //             // GitHub
  //             new vscode.DocumentLink(
  //               new vscode.Range(7, 0, 7, document.lineAt(7).text.length),
  //               vscode.Uri.parse('https://github.com/PrimeTimeTran'),
  //             ),

  //             // Google
  //             new vscode.DocumentLink(
  //               new vscode.Range(8, 0, 8, document.lineAt(8).text.length),
  //               vscode.Uri.parse('https://www.google.com'),
  //             ),

  //             // Wikipedia
  //             new vscode.DocumentLink(
  //               new vscode.Range(9, 0, 9, document.lineAt(9).text.length),
  //               vscode.Uri.parse('https://en.wikipedia.org/wiki/Quantopian'),
  //             ),
  //           ];
  //         },
  //       }),
  //     );
  //   }
  //   private demoDecorations(editor: vscode.TextEditor): void {
  //     const doc = editor.document;
  //     const count = doc.lineCount;
  //     if (count < 20) return;
  //     const line = (n: number) => new vscode.Range(n, 0, n, doc.lineAt(n).text.length);

  //     const examples = [
  //       ['colorRed', 0],
  //       ['colorGreen', 1],
  //       ['colorBlue', 2],
  //       ['colorPurple', 3],

  //       ['backgroundYellow', 4],
  //       ['backgroundBlue', 5],

  //       ['bold', 6],
  //       ['italic', 7],
  //       ['underline', 8],

  //       ['borderThin', 9],
  //       ['borderThick', 10],
  //       //   ['borderLeft', 11],
  //       //   ['borderRight', 12],

  //       ['wholeLine', 13],

  //       ['gutter', 14],

  //       ['ruler', 15],
  //     ] as const;

  //     //
  //     // Fixed reference examples
  //     //
  //     for (const [name, lineNumber] of examples) {
  //       editor.setDecorations(this.foos[name], [line(lineNumber)]);
  //     }

  //     //
  //     // Dynamic stress test:
  //     // scatter red markers everywhere
  //     //
  //     // const redLines: vscode.Range[] = [];
  //     // for (let i = 16; i < count; i += 3) {
  //     //   redLines.push(line(i));
  //     // }
  //     // editor.setDecorations(this.foos.colorRed, redLines);

  //     //
  //     // Dynamic estate-style example
  //     //
  //     // editor.setDecorations(
  //     //   this.foos.after,
  //     //   redLines.map((range) => ({
  //     //     range,
  //     //     renderOptions: {
  //     //       after: {
  //     //         contentText: '  🏠 estate object',
  //     //       },
  //     //     },
  //     //   })),
  //     // );

  //     //
  //     // Dynamic before icons
  //     //
  //     // editor.setDecorations(
  //     //   this.foos.before,
  //     //   redLines.map((range) => ({
  //     //     range,
  //     //     renderOptions: {
  //     //       before: {
  //     //         contentText: '🔗 ',
  //     //       },
  //     //     },
  //     //   })),
  //     // );
  //   }
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

    for (const item of items) {
      const range = new vscode.Range(item.line, 0, item.line, doc.lineAt(item.line).text.length);
      this.demoHighlight(editor, range, item);
      this.demoBadge(editor, range, item);
      this.demoIcon(editor, range, item);
    }
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
    const lines = Array.from({ length: 100 }, (_, i) => 70 + i);

    const annotations: Annotation[] = [
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
        range: this.lineRange(doc, lines[5]),
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
        label: 'Architecture',
        icon: '🏠',
        style: {
          color: '#0066ff',
          background: '#0066ff20',
          emphasis: 'bold',
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
        range: this.lineRange(doc, lines[15]),
        label: 'Database Schema',
        icon: '🗄️',
        style: {
          color: '#ffaa00',
          background: '#ffaa0015',
          underline: true,
        },
        action: {
          kind: 'showDetails',
        },
        metadata: {
          type: 'entity',
          tables: 12,
        },
      },

      {
        range: this.lineRange(doc, lines[20]),
        label: 'Missing Dependency',
        icon: '❌',
        style: {
          color: '#ff3333',
          background: '#ff000020',
          emphasis: 'bold',
        },
        metadata: {
          type: 'error',
          severity: 'high',
        },
      },

      {
        range: this.lineRange(doc, lines[25]),
        label: 'External Reference',
        icon: '🔗',
        style: {
          color: '#00aa55',
          background: '#00aa5515',
        },
        action: {
          kind: 'navigate',
          target: 'https://example.com/reference',
        },
        metadata: {
          type: 'link',
          references: 8,
        },
      },
      {
        range: this.lineRange(doc, lines[30]),
        label: 'Design Decision',
        icon: '💡',
        style: {
          color: '#9900ff',
          background: '#9900ff15',
          emphasis: 'italic',
        },
        metadata: {
          type: 'decision',
          status: 'accepted',
        },
      },

      {
        range: this.lineRange(doc, lines[35]),
        label: 'Performance Note',
        icon: '⚡',
        style: {
          color: '#ff8800',
          background: '#ff880015',
          emphasis: 'bold',
        },
        metadata: {
          type: 'optimization',
          impact: 'medium',
        },
      },

      {
        range: this.lineRange(doc, lines[40]),
        label: 'Generated Artifact',
        icon: '📦',
        style: {
          color: '#555555',
          background: '#55555515',
        },
        action: {
          kind: 'showDetails',
        },
        metadata: {
          type: 'generated',
          source: 'compiler',
        },
      },

      {
        range: this.lineRange(doc, lines[45]),
        label: 'Final Output',
        icon: '🚀',
        style: {
          color: '#00aaaa',
          background: '#00aaaa20',
          emphasis: 'bold',
        },
        metadata: {
          type: 'milestone',
          complete: true,
        },
      },
      {
        range: this.lineRange(doc, lines[50]),
        label: 'WikiLink',
        icon: '🔗',
        placement: {
          kind: 'afterLine',
          column: 75,
        },

        style: {
          color: '#00aa88',
          background: '#00aa8820',
          underline: true,
        },

        action: {
          kind: 'navigate',
          target: 'file:///Users/future/KB/project/app/loi/crates/learn/public/wikilinks.md',
        },

        metadata: {
          type: 'wikilink',
          title: 'Semantic Workspace Protocol',
        },
      },
      {
        range: this.lineRange(doc, lines[55]),
        label: 'Quantopian',
        icon: '📚',
        style: {
          color: '#8e44ad',
          background: '#8e44ad15',
          underline: true,
        },
        action: {
          kind: 'navigate',
          target: 'https://en.wikipedia.org/wiki/Quantopian',
        },
        metadata: {
          type: 'reference',
          provider: 'external_links',
        },
      },
    ];

    this.anoHighlight(editor, annotations);
    this.anoBadge(editor, annotations);
    this.anoIcon(editor, annotations);
  }
  //   Better data structure
  private anoHighlight(editor: vscode.TextEditor, annotations: Annotation[]): void {
    editor.setDecorations(
      this.addHighlight,
      annotations.map((a) => ({
        range: a.range,
      })),
    );
  }
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
  private addHighlight = vscode.window.createTextEditorDecorationType({
    backgroundColor: '#ffff0040',
    border: '1px solid #ffaa00',
  });
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

type Annotation = {
  range: vscode.Range;

  label?: string;
  icon?: string;

  // where/how it appears
  placement?: Placement;

  style?: Style;
  action?: Action;
  metadata?: unknown;
};

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
