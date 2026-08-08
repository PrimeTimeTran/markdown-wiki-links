import { execFile } from "child_process";
import * as util from "util";

import * as vscode from "vscode";

import { AppActivity } from "./activity";
import { AppStore } from "./app";
import { cfg } from "./cfg";

class OwnershipAnalysis {
  constructor(public readonly analysis: OwnershipAnalysisType) {}
}
export class AnalysisStore {
  public current?: OwnershipAnalysis;
  private currentActivity?: AppActivity;
  private currentRelatedLines: any[] = [];
  private currentFormattedOutput?: string;
  private listeners = new Set<() => void>();
  constructor(private app: AppStore) {
    app.activity.subscribe((activity: AppActivity) => {
      console.log("[-- 2 -- AnalysisStore.windowClick()]");
      void this.analyzeLine(activity);
    });
  }
  async analyzeLine(activity: AppActivity, _analysisMode = "default"): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration("flowify");
      const enabled = config.get<boolean>("enabled");
      console.log("ENABLED:", enabled);
      if (!enabled) {
        console.log("not enabled");
        return;
      }
      this.currentActivity = activity;
      const uri = activity.type == "editor" ? activity.snapshot?.uri : false;
      if (!uri) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor || !(activity.type == "editor")) return;
      if (!uri.fsPath.endsWith(".rs")) {
        console.log("not a rs");
        return;
      }
      const item = {
        file: activity.snapshot.fileName,
        column: activity.snapshot.column,
        line: activity.snapshot.line,
        text: activity.snapshot.lineText,
        scope: activity.scope,
      };
      if (cfg.debugAnalysis) this.printExtClick(item);
      const { stdout, stderr } = await execFileAsync(
        cfg.binaryPath,
        [
          "analyze",
          item.file,
          "--line",
          (item.line + 1).toString(),
          "--column",
          item.column.toString(),
        ],
        { cwd: cfg.cratePath },
      );
      if (stderr) console.error("Daemon error:", stderr);
      const raw = JSON.parse(stdout.trim());
      if (cfg.debugAnalysis) console.log("Keys received from Rust:");
      // if (cfg.debugAnalysis) console.log(JSON.stringify(raw, null, 2));
      if (raw.status === "error") throw new Error(raw.message);
      const analysis = new OwnershipAnalysis(raw.analysis);
      if (!analysis) return;

      // if (cfg.debugAnalysis)
      //   logAnalysis(this.app.outputChannel, raw.click.file, raw.click.line.toString(), raw);

      if (raw.formatted_output) {
        this.app.outputChannel.appendLine(`  🖼️ FORMATTED OUTPUT:`);
        this.app.outputChannel.appendLine(raw.formatted_output);
      } else {
        this.app.outputChannel.appendLine(`  [WARNING: formatted_output was empty or missing]`);
      }
      this.current = analysis;
      this.app.decorator.refresh(editor, this.currentActivity);
      if (cfg.debugAnalysis) this.printformatted();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("parse error")) {
          // vscode.window.showWarningMessage(`Subject unresolved: ${error.message}`);
        } else {
          // vscode.window.showWarningMessage(`Analysis failed: LSP on? ${error.message}`);
        }
      } else {
        // vscode.window.showWarningMessage(`Analysis failed. LSP on? `);
        console.error(error);
      }
    }
  }
  printExtClick(item: any) {
    console.log("[-- 2 -- AnalysisStore].file", item.file);
    console.log("[-- 2 -- AnalysisStore].line", item.line);
    console.log("[-- 2 -- AnalysisStore].column", item.column);
    console.log("[-- 2 -- AnalysisStore].scope", item.scope);
    console.log("[-- 2 -- AnalysisStore].text", item.text);
  }
  printformatted() {
    let output = this.getFormattedOutput();
    if (output) {
      printFormattedOutput(this.app.outputChannel, output);
    } else {
      this.app.outputChannel.appendLine("No formatted output available.");
    }
  }
  get(): OwnershipAnalysis | undefined {
    return this.current;
  }
  getActivity(): AppActivity | undefined {
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
  | "owns"
  | "owned_by"
  | "derived_from"
  | "borrowed_from"
  | "moved_from"
  | "alias_of"
  | "shadows"
  | "defined_in"
  | "contains";
export type SymRole = "binding" | "identifier" | "declaration" | "expression" | "scope";
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
    return this.getRelations("owns")
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
export function printFormattedOutput(outputChannel: vscode.OutputChannel, formattedOutput: string) {
  // outputChannel.show(true);
  outputChannel.appendLine(formattedOutput);
}
export function logAnalysis(
  outputChannel: vscode.OutputChannel,
  filePath: string,
  lineNumber: string,
  result: any,
) {
  const timestamp = new Date().toLocaleTimeString();
  const fileName = filePath.split("/").pop() || filePath;
  outputChannel.appendLine(`[⚡ FLOWIFY] ${timestamp} — Analysis Complete`);
  outputChannel.appendLine(`  💡 File   : ${fileName}`);
  outputChannel.appendLine(`  📂 Path   : ${filePath}`);
  outputChannel.appendLine(`  📍 Line   : ${lineNumber}`);
  outputChannel.appendLine(``);
  outputChannel.appendLine(`  📊 RELATED LINES:`);
  if (result.related_lines?.length) {
    for (const line of result.related_lines) {
      outputChannel.appendLine(`     ├── line ${line.line} : ${line.relations.join(", ")}`);
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
export interface Span {
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
}
export interface NodeSubject {
  kind: string;
  span: Span;
}
export interface RelatedLine {
  line: number;
  relations: string[];
}
export interface NodeContext {
  subject: NodeSubject;
  ancestors?: NodeSubject[];
}
export interface OwnershipAnalysisType {
  classification: string;
  related_lines: RelatedLine[];
  node_context: {
    subject: NodeSubject;
  };
}
const execFileAsync = util.promisify(execFile);
