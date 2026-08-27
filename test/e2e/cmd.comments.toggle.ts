import * as assert from "node:assert/strict";
import path from "node:path";

import { describe, test } from "mocha";
import * as vscode from "vscode";

async function createRustEditor(content: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    language: "rust",
    content,
  });

  const editor = await vscode.window.showTextDocument(document);

  const start = new vscode.Position(0, 0);
  const endLine = document.lineCount - 1;

  const end = new vscode.Position(endLine, document.lineAt(endLine).text.length);

  editor.selection = new vscode.Selection(start, end);

  return editor;
}

// async function openRustDocument() {
//   const document = await vscode.workspace.openTextDocument(
//     vscode.Uri.file(path.resolve("test/fixtures/comments/test.rs")),
//   );

//   const editor = await vscode.window.showTextDocument(document);

//   editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(1, 3));

//   return { document, editor };
// }

suite("Estate Rust comment commands", () => {
  test("adds // line comments", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "rust",
      content: "foo\nbar",
    });

    const editor = await vscode.window.showTextDocument(document);

    console.log("BEFORE", {
      text: document.getText(),
      language: document.languageId,
      lineCount: document.lineCount,
    });

    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(1, 3));

    await vscode.commands.executeCommand("estate.commentToggle.line");

    console.log("AFTER", document.getText());

    assert.strictEqual(document.getText(), "// foo\n// bar");
  });
  test("adds // line comments", async () => {
    const editor = await createRustEditor("foo;\nbar;");

    await vscode.commands.executeCommand("estate.commentToggle.line");

    assert.strictEqual(editor.document.getText(), "// foo;\n// bar;");
  });

  test("removes // line comments", async () => {
    const editor = await createRustEditor("// foo;\n// bar;");

    await vscode.commands.executeCommand("estate.commentToggle.line");

    assert.strictEqual(editor.document.getText(), "foo;\nbar;");
  });

  test("adds /// doc comments", async () => {
    const editor = await createRustEditor("foo;\nbar;");

    await vscode.commands.executeCommand("estate.commentToggle.doc");

    assert.strictEqual(editor.document.getText(), "/// foo;\n/// bar;");
  });

  test("removes /// doc comments", async () => {
    const editor = await createRustEditor("/// foo;\n/// bar;");

    await vscode.commands.executeCommand("estate.commentToggle.doc");

    assert.strictEqual(editor.document.getText(), "foo;\nbar;");
  });

  test("adds //! inner doc comments", async () => {
    const editor = await createRustEditor("foo;\nbar;");

    await vscode.commands.executeCommand("estate.commentToggle.innerDoc");

    assert.strictEqual(editor.document.getText(), "//! foo;\n//! bar;");
  });

  test("removes //! inner doc comments", async () => {
    const editor = await createRustEditor("//! foo;\n//! bar;");

    await vscode.commands.executeCommand("estate.commentToggle.innerDoc");

    assert.strictEqual(editor.document.getText(), "foo;\nbar;");
  });
});

async function createEditor(language: string, content: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    language,
    content,
  });

  const editor = await vscode.window.showTextDocument(document);

  editor.selection = new vscode.Selection(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );

  return editor;
}

suite("Estate JavaScript comment commands", () => {
  test("adds // line comments", async () => {
    const editor = await createEditor("javascript", "foo();\nbar();");

    await vscode.commands.executeCommand("estate.commentToggle.line");

    assert.strictEqual(editor.document.getText(), "// foo();\n// bar();");
  });

  test("removes // line comments", async () => {
    const editor = await createEditor("javascript", "// foo();\n// bar();");

    await vscode.commands.executeCommand("estate.commentToggle.line");

    assert.strictEqual(editor.document.getText(), "foo();\nbar();");
  });

  test("adds /** doc block", async () => {
    const editor = await createEditor("javascript", "foo();\nbar();");

    await vscode.commands.executeCommand("estate.commentToggle.doc");

    assert.strictEqual(editor.document.getText(), "/**\n * foo();\n * bar();\n*/");
  });

  test("removes /** doc block", async () => {
    const editor = await createEditor("javascript", "/**\n * foo();\n * bar();\n*/");

    await vscode.commands.executeCommand("estate.commentToggle.doc");

    assert.strictEqual(editor.document.getText(), "foo();\nbar();");
  });

  test("adds /* block comment", async () => {
    const editor = await createEditor("javascript", "foo();\nbar();");

    await vscode.commands.executeCommand("estate.commentToggle.block");

    assert.strictEqual(editor.document.getText(), "/*\n * foo();\n * bar();\n*/");
  });

  test("removes /* block comment", async () => {
    const editor = await createEditor("javascript", "/*\n * foo();\n * bar();\n*/");

    await vscode.commands.executeCommand("estate.commentToggle.block");

    assert.strictEqual(editor.document.getText(), "foo();\nbar();");
  });
});
