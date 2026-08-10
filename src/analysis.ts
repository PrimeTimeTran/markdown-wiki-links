import { execFile } from "node:child_process";
import { promisify } from "node:util";

import * as vscode from "vscode";

import { AppActivity, EditorActivity } from "./activity";
import { AppStore } from "./app";
import { cfg, TraceFlow } from "./cfg";

const execFileDirect = promisify(execFile);

class OwnershipAnalysis {
  constructor(public readonly analysis: OwnershipAnalysisType) {}
}
export class AnalysisStore {
  private readonly tracer;
  private readonly flow: TraceFlow;
  public current?: OwnershipAnalysis;
  private currentActivity?: AppActivity;
  private formattedAnalysis?: string;
  private listeners = new Set<() => void>();
  private config = vscode.workspace.getConfiguration("flowify");

  constructor(private app: AppStore) {
    this.tracer = app.tracer.namespace("Analysis");
    this.flow = this.tracer.flow("analyzeLine");
    app.initFlow.info("Analysis");
    app.activity.subscribe((activity: AppActivity) => {
      this.app.clickFlow.info("AnalysisStore");
      if (!(activity.type == "editor")) return;
      const editor = this.canAnalyze(activity);
      if (!editor) return;
      void this.analyzeLine(editor, activity);
    });
  }
  private canAnalyze(activity: EditorActivity): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const enabled = this.config.get<boolean>("enabled");
    if (!enabled) {
      this.clear();
      this.flow.debug("not enabled");
      return;
    }
    const { uri } = activity.snapshot;
    if (!uri || !uri.fsPath.endsWith(".rs")) {
      this.clear(editor);
      this.flow.debug("not .rs");
      return;
    }
    return editor;
  }
  async analyzeLine(editor: vscode.TextEditor, activity: EditorActivity): Promise<void> {
    try {
      this.flow.info("analyzeLine start");
      const { file, line, column } = this.buildItem(activity);
      const args = ["analyze", file, "--line", line, "--column", column];
      const options = { cwd: cfg.cratePath, maxBuffer: 10 * 1024 * 1024 };
      const { stdout, stderr } = await execFileDirect(cfg.binaryPath, args, options);
      if (stderr) console.error("Daemon error:", stderr);
      const { data, status, message } = JSON.parse(stdout);
      if (status !== "ok") {
        throw new Error(message ?? "Daemon request failed");
      }
      this.buildAnalysis(editor, data);
    } catch (error) {
      this.tracer.error("Error: Analysis", error);
      console.error("Error: Analysis", error);
      if (error instanceof Error) {
        if (error.message.includes("parse error")) {
          // vscode.window.showWarningMessage(`Subject unresolved: ${error.message}`);
        } else {
          // vscode.window.showWarningMessage(`Analysis failed: LSP on? ${error.message}`);
        }
      } else {
        // vscode.window.showWarningMessage(`Analysis failed. LSP on? `);
      }
    }
  }
  private buildItem(activity: EditorActivity) {
    const { snapshot, scope } = activity;
    this.currentActivity = activity;
    const item = {
      file: snapshot.fileName,
      column: snapshot.column.toString(),
      line: (snapshot.line + 1).toString(),
      text: snapshot.lineText,
      scope,
    };
    this.flow.debug("analyzeLine", item);
    return item;
  }
  private buildAnalysis(editor: vscode.TextEditor, data: any) {
    this.flow.debug("analyzeLine", "Analysis Keys" + Object.keys(data));
    if (data.status === "error") throw new Error(data.message);
    // this.flow?.debug("windowClick", "Keys received from Rust:" + JSON.stringify(data, null, 1));
    const analysis = new OwnershipAnalysis(data.analysis);
    if (!analysis) return;
    this.flow.debug("analyzeLine", data.click.line);
    this.current = analysis;
    if (this.currentActivity) {
      this.app.decorator.refresh(editor, this.currentActivity);
    }
    this.flow.info("analyzeLine", "analyzeLine end");
  }
  // printExtClick(item: any) {
  //   console.log("[-- 2 -- Analysis].file", item.file);
  //   console.log("[-- 2 -- Analysis].line", item.line);
  //   console.log("[-- 2 -- Analysis].column", item.column);
  //   console.log("[-- 2 -- Analysis].scope", item.scope);
  //   console.log("[-- 2 -- Analysis].text", item.text);
  // }
  public getFormattedOutput(): string | undefined {
    return this.formattedAnalysis;
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
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private clear(editor?: vscode.TextEditor): void {
    const target = editor ?? vscode.window.activeTextEditor;
    if (!target) return;
    this.current = undefined;
    this.currentActivity = undefined;
    this.app.decorator.clear(target);
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
      ({ location: { file, line, column } }) =>
        file === location.file && line === location.line && column === location.column,
    );
  }
  private findNode(id: string): SymNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }
}
export function printFormattedOutput(channel: vscode.OutputChannel, formattedOutput: string) {
  // outputChannel.show(true);
  channel.appendLine(formattedOutput);
}
export function logAnalysis(
  channel: vscode.OutputChannel,
  filePath: string,
  lineNumber: string,
  result: any,
) {
  const timestamp = new Date().toLocaleTimeString();
  const fileName = filePath.split("/").pop() || filePath;
  channel.appendLine(`[⚡ FLOWIFY] ${timestamp} — Analysis Complete`);
  channel.appendLine(`  💡 File   : ${fileName}`);
  channel.appendLine(`  📂 Path   : ${filePath}`);
  channel.appendLine(`  📍 Line   : ${lineNumber}`);
  channel.appendLine(``);
  channel.appendLine(`  📊 RELATED LINES:`);
  if (result.related_lines?.length) {
    for (const line of result.related_lines) {
      channel.appendLine(`     ├── line ${line.line} : ${line.relations.join(", ")}`);
    }
  } else {
    channel.appendLine(`     └── none`);
  }
  channel.appendLine(``);
  channel.appendLine(`  🧠 SUBJECT:`);
  if (result.subject) {
    channel.appendLine(`     ├── ${result.subject.name} (${result.subject.role})`);
    channel.appendLine(`     └── ${JSON.stringify(result.subject.location)}`);
  } else {
    channel.appendLine(`     └── none`);
  }
  channel.appendLine(``);
  channel.appendLine(`  🔗 RELATIONS:`);
  if (result.relations?.length) {
    for (const relation of result.relations) {
      channel.appendLine(`     ├── ${relation.from} --${relation.kind}--> ${relation.to}`);
    }
  } else {
    channel.appendLine(`     └── none`);
  }
  channel.appendLine(``);
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
