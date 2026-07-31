import * as util from 'util';
import * as vscode from 'vscode';

import { execFile } from 'child_process';
import { Activity } from './adapters/activityService';
import { icons } from './ownership';

const execFileAsync = util.promisify(execFile);

export class AnalysisStore {
  private current?: OwnershipAnalysisResult;
  private currentActivity?: Activity;
  private currentRelatedLines: any[] = [];
  private listeners = new Set<() => void>();

  constructor(private outputChannel: vscode.OutputChannel) {}

  async analyzeLine(activity: Activity): Promise<void> {
    console.log('AnalysisStore handler for click');
    this.currentActivity = activity;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    let item = {
      file: activity.editor.uri.toString(),
      column: activity.editor.column.toString(),
      line: (Number(activity.editor.line) + 1).toString(),
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

    try {
      const { stdout, stderr } = await execFileAsync(
        binaryPath,
        ['analyze', item.file, '--line', item.line, '--column', item.column],
        { cwd: cratePath },
      );

      if (stderr) console.error('Daemon error:', stderr);

      const raw = JSON.parse(stdout.trim());

      if (raw.status !== 'ok') {
        return;
      }

      const analysis = new OwnershipAnalysisResult(
        raw.subject,
        raw.nodes,
        raw.relations,
        raw.scope,
      );
      logAnalysis(this.outputChannel, item.file, item.line, raw);
      this.set(analysis, raw.related_lines);
    } catch (error: any) {
      console.error('Analysis failed', error);

      if (error.stdout) {
        console.error(error.stdout);
      }
    }
  }

  set(result: OwnershipAnalysisResult, relatedLines: any[]) {
    this.current = result;
    this.listeners.forEach((fn) => fn());
    this.currentRelatedLines = relatedLines;
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
