import * as vscode from "vscode";

type LineCommentStyle = {
  kind: "line";
  prefix: string;
};

type BlockCommentStyle = {
  kind: "block";
  start: string;
  end: string;
};

type LanguageComments = {
  line?: LineCommentStyle;
  doc?: LineCommentStyle | BlockCommentStyle;
  innerDoc?: LineCommentStyle;
  block?: BlockCommentStyle;
};

const COMMENT_STYLES: Record<string, LanguageComments> = {
  rust: {
    line: {
      kind: "line",
      prefix: "//",
    },

    doc: {
      kind: "line",
      prefix: "///",
    },

    innerDoc: {
      kind: "line",
      prefix: "//!",
    },
  },

  javascript: {
    line: {
      kind: "line",
      prefix: "//",
    },

    doc: {
      kind: "block",
      start: "/**",
      end: "*/",
    },

    block: {
      kind: "block",
      start: "/*",
      end: "*/",
    },
  },

  javascriptreact: {
    line: {
      kind: "line",
      prefix: "//",
    },

    doc: {
      kind: "block",
      start: "/**",
      end: "*/",
    },

    block: {
      kind: "block",
      start: "/*",
      end: "*/",
    },
  },

  typescript: {
    line: {
      kind: "line",
      prefix: "//",
    },

    doc: {
      kind: "block",
      start: "/**",
      end: "*/",
    },

    block: {
      kind: "block",
      start: "/*",
      end: "*/",
    },
  },

  typescriptreact: {
    line: {
      kind: "line",
      prefix: "//",
    },

    doc: {
      kind: "block",
      start: "/**",
      end: "*/",
    },

    block: {
      kind: "block",
      start: "/*",
      end: "*/",
    },
  },
};

function getLanguageComments(document: vscode.TextDocument): LanguageComments | undefined {
  return COMMENT_STYLES[document.languageId];
}

function hasExactCommentPrefix(text: string, prefix: string): boolean {
  const content = text.trimStart();

  if (!content.startsWith(prefix)) {
    return false;
  }

  const next = content[prefix.length];

  // `//` must not match `///` or `//!`.
  if (prefix === "//" && (next === "/" || next === "!")) {
    return false;
  }

  return true;
}

async function toggleSmartLineComments(
  editor: vscode.TextEditor,
  comments: LanguageComments,
): Promise<void> {
  const { document, selection } = editor;

  const lines = getSelectedLines(document, selection);

  const prefixes = [
    comments.doc?.kind === "line" ? comments.doc.prefix : undefined,
    comments.innerDoc?.prefix,
    comments.line?.prefix,
  ].filter((prefix): prefix is string => Boolean(prefix));

  const isCommented = (line: vscode.TextLine) =>
    prefixes.some((prefix) => hasExactCommentPrefix(line.text, prefix));

  const shouldRemove = lines.every(isCommented);

  await editor.edit((edit) => {
    for (const line of lines) {
      console.log("ADDING", {
        line: line.lineNumber,
        text: line.text,
        prefix: comments.line!.prefix,
        range: {
          start: line.range.start,
          end: line.range.end,
        },
      });
      if (shouldRemove) {
        const prefix = prefixes.find((prefix) => hasExactCommentPrefix(line.text, prefix));

        if (prefix) {
          removeCommentPrefix(edit, line, prefix);
        }
      } else {
        addCommentPrefix(edit, line, comments.line!.prefix);
      }
    }
  });
}

function getSelectedLines(
  document: vscode.TextDocument,
  selection: vscode.Selection,
): vscode.TextLine[] {
  console.log("GET LINES DEBUG", {
    text: document.getText(),
    lineCount: document.lineCount,
    start: selection.start.line,
    end: selection.end.line,
  });

  const lines: vscode.TextLine[] = [];

  for (let line = selection.start.line; line <= selection.end.line; line++) {
    console.log("LINE", line, "OF", document.lineCount);
    lines.push(document.lineAt(line));
  }

  return lines;
}
async function toggleBlockComment(
  editor: vscode.TextEditor,
  block: BlockCommentStyle,
): Promise<void> {
  const { document, selection } = editor;

  const startLine = selection.start.line;
  const endLine = selection.end.line;

  const firstLine = document.lineAt(startLine);
  const lastLine = document.lineAt(endLine);

  const firstText = firstLine.text.trim();
  const lastText = lastLine.text.trim();

  const isBlockComment = firstText === block.start && lastText === block.end && startLine < endLine;

  if (isBlockComment) {
    await removeStarBlockComment(editor, block, startLine, endLine);
    return;
  }

  await addStarBlockComment(editor, block, startLine, endLine);
}
async function addStarBlockComment(
  editor: vscode.TextEditor,
  block: BlockCommentStyle,
  startLine: number,
  endLine: number,
): Promise<void> {
  const { document } = editor;

  const firstLine = document.lineAt(startLine);
  const indentation = firstLine.text.match(/^\s*/)?.[0] ?? "";

  const lines: string[] = [];

  for (let line = startLine; line <= endLine; line++) {
    const text = document.lineAt(line).text;
    const lineIndentation = text.match(/^\s*/)?.[0] ?? "";
    const body = text.slice(lineIndentation.length);

    lines.push(`${lineIndentation} * ${body}`);
  }

  const content = [`${indentation}${block.start}`, ...lines, `${indentation}${block.end}`].join(
    "\n",
  );

  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, document.lineAt(endLine).text.length),
  );

  await editor.edit((edit) => {
    edit.replace(range, content);
  });
}
async function removeStarBlockComment(
  editor: vscode.TextEditor,
  block: BlockCommentStyle,
  startLine: number,
  endLine: number,
): Promise<void> {
  const { document } = editor;

  const lines: string[] = [];

  for (let line = startLine + 1; line < endLine; line++) {
    const text = document.lineAt(line).text;

    const body = text.replace(/^\s*\*\s?/, "");

    lines.push(body);
  }

  const lastLine = document.lineAt(endLine);

  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, lastLine.text.length),
  );

  await editor.edit((edit) => {
    edit.replace(range, lines.join("\n"));
  });
}

async function toggleLineCommentStyle(
  editor: vscode.TextEditor,
  style: LineCommentStyle,
): Promise<void> {
  const { document, selection } = editor;
  const lines = getSelectedLines(document, selection);

  const shouldRemove = lines.every((line) => hasExactCommentPrefix(line.text, style.prefix));

  await editor.edit((edit) => {
    for (const line of lines) {
      if (shouldRemove) {
        removeCommentPrefix(edit, line, style.prefix);
      } else {
        addCommentPrefix(edit, line, style.prefix);
      }
    }
  });
}
function addCommentPrefix(
  edit: vscode.TextEditorEdit,
  line: vscode.TextLine,
  prefix: string,
): void {
  const indentation = line.text.match(/^\s*/)?.[0] ?? "";

  edit.insert(new vscode.Position(line.lineNumber, indentation.length), `${prefix} `);
}
function removeCommentPrefix(
  edit: vscode.TextEditorEdit,
  line: vscode.TextLine,
  prefix: string,
): void {
  const indentation = line.text.match(/^\s*/)?.[0] ?? "";
  const start = indentation.length;

  if (!hasExactCommentPrefix(line.text, prefix)) {
    return;
  }

  let end = start + prefix.length;

  // Remove the optional space after the comment marker too.
  if (line.text[end] === " ") {
    end++;
  }

  edit.delete(
    new vscode.Range(
      new vscode.Position(line.lineNumber, start),
      new vscode.Position(line.lineNumber, end),
    ),
  );
}

export async function toggleLineComments(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  const comments = getLanguageComments(editor.document);

  if (!comments?.line) {
    return;
  }

  await toggleSmartLineComments(editor, comments);
}

export async function toggleOuterDocComments(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  const comments = getLanguageComments(editor.document);
  const style = comments?.doc;

  if (!style) {
    return;
  }

  if (style.kind === "line") {
    await toggleLineCommentStyle(editor, style);
  } else {
    await toggleBlockComment(editor, style);
  }
}

export async function toggleInnerDocComments(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  const comments = getLanguageComments(editor.document);
  const style = comments?.innerDoc;

  if (!style || style.kind !== "line") {
    return;
  }

  await toggleLineCommentStyle(editor, style);
}

export async function toggleBlockComments(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  const comments = getLanguageComments(editor.document);

  if (!comments?.block) {
    return;
  }

  await toggleBlockComment(editor, comments.block);
}
