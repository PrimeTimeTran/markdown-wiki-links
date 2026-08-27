import * as assert from "node:assert/strict";

import { describe, test } from "mocha";
import * as vscode from "vscode";

suite("Estate comment commands", () => {
  test("Rust line comments toggle with //", async () => {
    const extension = vscode.extensions.getExtension("ltvan.a-markdown-wiki-links");

    assert.ok(extension, "Extension not found");

    await extension.activate();

    assert.ok(extension.isActive, "Extension did not activate");

    const commands = await vscode.commands.getCommands(true);

    assert.ok(
      commands.includes("estate.commentToggle.line"),
      "estate.commentToggle.line was not registered",
    );
  });
});
