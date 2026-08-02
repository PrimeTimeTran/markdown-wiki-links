import * as util from 'util';
import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { Activity } from './activity';
import { icons } from './ownership';
import { AppStore } from './app';
const execFileAsync = util.promisify(execFile);
export class AnalysisStore {
  private current?: OwnershipAnalysisResult;
  private currentActivity?: Activity;
  private currentRelatedLines: any[] = [];
  private currentFormattedOutput?: string;
  private listeners = new Set<() => void>();
  constructor(private app: AppStore) {}
  async analyzeLine(activity: Activity, analysisMode = 'default'): Promise<void> {
    this.currentActivity = activity;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    // const config = vscode.workspace.getConfiguration('flowify');
    // const defaultMode = config.get<string>('defaultAnalysisMode', 'default');
    try {
      const item = {
        file: activity.editor.uri.fsPath,
        column: activity.editor.column,
        line: activity.editor.line,
        text: activity.editor.lineText,
        scope: activity.scope,
      };
      this.printExtClick(item);
      const { stdout, stderr } = await execFileAsync(
        binaryPath,
        ['analyze', item.file, '--line', item.line + 1, '--column', item.column],
        { cwd: cratePath },
      );
      if (stderr) console.error('Daemon error:', stderr);
      const raw = JSON.parse(stdout.trim());
      console.log('Keys received from Rust:', Object.keys(raw));
      const analysis = new OwnershipAnalysisResult(
        raw.click,
        raw.analysis?.node_context,
        raw.analysis?.classification,
        raw.analysis?.symbols,
      );
      if (!analysis) {
        return;
      }

      logAnalysis(this.app.outputChannel, raw.click.file, raw.click.line.toString(), raw);

      if (raw.formatted_output) {
        this.app.outputChannel.appendLine(`  🖼️ FORMATTED OUTPUT:`);
        this.app.outputChannel.appendLine(raw.formatted_output);
      } else {
        this.app.outputChannel.appendLine(`  [WARNING: formatted_output was empty or missing]`);
      }

      this.setAnalysis(analysis, raw.analysis.related_lines, raw.formatted_output);
      this.printformatted();
    } catch (error: any) {
      console.error('Analysis failed', error);
      if (error.stdout) {
        console.error(error.stdout);
      }
    }
  }
  printExtClick(item: any) {
    console.log(item);
    console.log('[Flowity]:');
    console.log('[EXT].file', item.file);
    console.log('[EXT].line', item.line);
    console.log('[EXT].column', item.column);
    console.log('[EXT].scope', item.scope);
    console.log('[EXT].text', item.text);
  }
  printformatted() {
    let output = this.getFormattedOutput();
    if (output) {
      printFormattedOutput(this.app.outputChannel, output);
    } else {
      this.app.outputChannel.appendLine('No formatted output available.');
    }
  }
  public setAnalysis(
    analysis: OwnershipAnalysisResult,
    relatedLines: any[],
    formattedOutput?: string,
  ) {
    this.current = analysis;
    this.currentRelatedLines = relatedLines;
    this.currentFormattedOutput = formattedOutput;
    // this.notifyListeners();
  }
  get(): OwnershipAnalysisResult | undefined {
    return this.current;
  }
  getActivity(): Activity | undefined {
    return this.currentActivity;
  }
  getRelatedLines(): any[] {
    return this.currentRelatedLines;
  }
  public getFormattedOutput(): string | undefined {
    return this.currentFormattedOutput;
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
export type RelationKind =
  | 'owns'
  | 'owned_by'
  | 'derived_from'
  | 'borrowed_from'
  | 'moved_from'
  | 'alias_of'
  | 'shadows'
  | 'defined_in'
  | 'contains';
export type SymRole = 'binding' | 'identifier' | 'declaration' | 'expression' | 'scope';
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
export interface SymNode {
  id: string;
  name: string;
  role: SymRole;
  location: SourceLocation;
  // Where this Sym lives
  scope?: {
    name: string;
    startLine: number;
    endLine: number;
  };
}
export interface SymRelation {
  from: string;
  to: string;
  kind: RelationKind;
  // Optional explanation for UI
  label?: string;
}
export class OwnershipAnalysisResult {
  constructor(
    public subject: SymNode,
    public nodes: SymNode[],
    public relations: SymRelation[],
    public scope?: SymNode,
  ) {}
  getChildren(symbolId = this.subject.id): SymNode[] {
    return this.getRelations('owns')
      .filter((r) => r.from === symbolId)
      .map((r) => this.findNode(r.to))
      .filter((n): n is SymNode => n !== undefined);
  }
  getParents(symbolId = this.subject.id): SymNode[] {
    return this.relations
      .filter((r) => r.to === symbolId)
      .map((r) => this.findNode(r.from))
      .filter((n): n is SymNode => n !== undefined);
  }
  getRelations(kind?: RelationKind): SymRelation[] {
    return kind ? this.relations.filter((r) => r.kind === kind) : this.relations;
  }
  findSymbolAt(location: SourceLocation): SymNode | undefined {
    return this.nodes.find(
      (n) =>
        n.location.file === location.file &&
        n.location.line === location.line &&
        n.location.column === location.column,
    );
  }
  private findNode(id: string): SymNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }
}
export const cratePath = '/Users/future/KB/project/app/loi/crates/learn';
export const binaryPath = '/Users/future/KB/project/app/loi/target/debug/loi';
export function printFormattedOutput(outputChannel: vscode.OutputChannel, formattedOutput: string) {
  outputChannel.show(true);
  outputChannel.appendLine(formattedOutput);
  outputChannel.appendLine('--------------------------------------------------\n');
}
export function logAnalysis(
  outputChannel: vscode.OutputChannel,
  filePath: string,
  lineNumber: string,
  result: any,
) {
  const timestamp = new Date().toLocaleTimeString();
  const fileName = filePath.split('/').pop() || filePath;
  outputChannel.appendLine(`[⚡ FLOWIFY] ${timestamp} — Analysis Complete`);
  outputChannel.appendLine(`  💡 File   : ${fileName}`);
  outputChannel.appendLine(`  📂 Path   : ${filePath}`);
  outputChannel.appendLine(`  📍 Line   : ${lineNumber}`);
  outputChannel.appendLine(``);
  outputChannel.appendLine(`  📊 RELATED LINES:`);
  if (result.related_lines?.length) {
    for (const line of result.related_lines) {
      outputChannel.appendLine(`     ├── line ${line.line} : ${line.relations.join(', ')}`);
    }
  } else {
    outputChannel.appendLine(`     └── none`);
  }
  outputChannel.appendLine(``);
  outputChannel.appendLine(`  🧠 SUBJECT:`);
  if (result.subject) {
    outputChannel.appendLine(`     ├── ${result.subject.name} (${result.subject.role})`);
    outputChannel.appendLine(`     └── ${JSON.stringify(result.subject.location)}`);
  } else {
    outputChannel.appendLine(`     └── none`);
  }
  outputChannel.appendLine(``);
  outputChannel.appendLine(`  🔗 RELATIONS:`);
  if (result.relations?.length) {
    for (const relation of result.relations) {
      outputChannel.appendLine(`     ├── ${relation.from} --${relation.kind}--> ${relation.to}`);
    }
  } else {
    outputChannel.appendLine(`     └── none`);
  }
  outputChannel.appendLine(``);
}
