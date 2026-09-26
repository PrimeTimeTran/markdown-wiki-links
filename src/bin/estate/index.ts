import { spawn } from "node:child_process";
import * as path from "node:path";

import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const estate = path.join(context.extensionPath, "bin", "darwin-arm64", "estate");

  const child = spawn(estate, ["daemon"], {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}
