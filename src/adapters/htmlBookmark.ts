import { Bookmark } from './bookmarkService';

export const bookmarkShowPage = (b: Bookmark) => {
  return `
<!doctype html>
<html>
    <head>
    <link rel="stylesheet" href="highlight.min.css">
    <script src="highlight.min.js"></script>
        ${rootCSS2()}
    </head>
    <body>
        <div class="container">
            <h1>Bookmark</h1>
            <div class="form">
                <div class="field">
                    <label>Label</label>
                    <input
                        name="label"
                        value="${b.label}" />
                </div>

                <div class="field">
                    <label>Description</label>
                    <input
                        name="description"
                        value="${b.description}" />
                </div>

                <div class="row">
                    <div class="field">
                        <label>Privacy</label>
                        <select name="privacy">
                            <option selected>workspace</option>
                            <option>private</option>
                            <option>public</option>
                        </select>
                    </div>

                    <div class="field">
                        <label>Type</label>
                        <select
                            name="type"
                            value="${b.type}">
                            <option selected>code</option>
                            <option>note</option>
                            <option>reference</option>
                        </select>
                    </div>
                </div>

                <div class="field">
                    <label>Tags</label>
                        <div class="tag">architecture ×</div>
                        <div class="tag">rust ×</div>
                        <div class="tag new">+ Add tag</div>
                </div>

                <div class="field">
                    <label>Body</label>
                    <pre><code class="language-rust">${escapeHtml(b.body)}</code></pre>

                </div>
                <div class="field">
                    <label>Scratchpad</label>
                    <textarea
                        name="scratchpadBody"
                        class="scratchpad-editor">
                    ${b.scratchpadBody}
                    </textarea>
                </div>

                <div class="field">
                    <label>Context</label>
                    <textarea> </textarea>
                </div>

                <div class="field">
                    <label>Code</label>
                    <textarea></textarea>
                </div>

                <div class="field">
                    <label>Repository</label>
                    <input />
                </div>

                <div class="field">
                    <label>Commit</label>
                    <input />
                </div>

                <div class="field">
                    <label>Scope</label>
                    <input value="source.selection" />
                </div>

                <div class="actions">
                    <button>Cancel</button>
                    <button
                        name="save"
                        class="save">
                        Save Bookmark
                    </button>
                </div>
            </div>
        </div>
        ${rootScript()}
    </body>
</html>
    `;
};

export function getHtml(bookmark: Bookmark): string {
  return /* html */ `
<!DOCTYPE html>
<html>

<head>
<meta charset="UTF-8">

<script src="https://cdn.tailwindcss.com"></script>

<style>
:root {
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-editor-foreground);

  --input-bg: var(--vscode-input-background);
  --input-fg: var(--vscode-input-foreground);
  --input-border: var(--vscode-input-border);

  --button-bg: var(--vscode-button-background);
  --button-fg: var(--vscode-button-foreground);
  --button-hover: var(--vscode-button-hoverBackground);

  --focus: var(--vscode-focusBorder);
}

body {
  background: var(--bg);
  color: var(--fg);
}

input,
textarea,
select {
  background: var(--input-bg);
  color: var(--input-fg);
  border: 1px solid var(--input-border);
}

input:focus,
textarea:focus,
select:focus {
  outline: 1px solid var(--focus);
}

button {
  background: var(--button-bg);
  color: var(--button-fg);
}

button:hover {
  background: var(--button-hover);
}
</style>

</head>

<body class="p-6">

<div class="max-w-3xl mx-auto space-y-6">

<header>
<h1 class="text-xl font-semibold">
Edit Bookmark
</h1>

<p class="opacity-70 text-sm mt-1">
Store architecture notes, decisions, and references.
</p>
</header>


<div class="grid grid-cols-1 md:grid-cols-2 gap-5">


<div>
<label class="block text-sm font-medium mb-2">
Label
</label>

<input
id="label"
value="${escapeHtml(bookmark.label)}"
class="
w-full rounded-md px-3 py-2
text-sm
shadow-sm
"
>
</div>



<div>
<label class="block text-sm font-medium mb-2">
Scope
</label>

<select
id="scope"
class="
w-full rounded-md px-3 py-2
text-sm
"
>

<option>workspace</option>
<option>package</option>
<option>module</option>
<option>file</option>
<option selected>markdown.heading</option>
<option>function</option>

</select>

</div>


</div>



<div>

<label class="block text-sm font-medium mb-2">
Description
</label>


<input
id="description"
value="${escapeHtml(bookmark.description)}"
class="
w-full rounded-md px-3 py-2
text-sm
"
>

</div>




<div>

<label class="block text-sm font-medium mb-2">
Privacy
</label>


<select
id="privacy"
class="
w-full rounded-md px-3 py-2
text-sm
"
>

<option selected>personal</option>
<option>workspace</option>
<option>public</option>

</select>


</div>




<div>

<label class="block text-sm font-medium mb-3">
Tags
</label>


<div class="
grid grid-cols-2 sm:grid-cols-3 gap-2
">

${renderTag('architecture', bookmark.tags)}
${renderTag('parser', bookmark.tags)}
${renderTag('compiler', bookmark.tags)}
${renderTag('rust', bookmark.tags)}
${renderTag('vscode', bookmark.tags)}

</div>


</div>




<div>

<label class="block text-sm font-medium mb-2">
Body
</label>


<textarea
id="body"
class="
w-full
rounded-md
px-3 py-2
text-sm
resize-y
min-h-[220px]
"
>${escapeHtml(bookmark.body)}</textarea>


</div>




<div class="flex justify-end">

<button
id="save"
class="
rounded-md
px-5 py-2
text-sm
font-medium
transition
"
>
Save Bookmark
</button>


</div>


</div>



<script>

const vscode = acquireVsCodeApi();


document
.getElementById("save")
.onclick = () => {


const tags =
[
...document.querySelectorAll(".tag input")
]
.filter(x=>x.checked)
.map(x=>x.value);



vscode.postMessage({

type:"save",

bookmark:{

label:
document.getElementById("label").value,

description:
document.getElementById("description").value,

scope:
document.getElementById("scope").value,

privacy:
document.getElementById("privacy").value,

body:
document.getElementById("body").value,

tags

}

});


};


</script>


</body>
</html>
`;
}
export function renderTag(tag: string, selected: string[]) {
  const checked = selected?.includes(tag) ? 'checked' : '';
  return /* html */ `

<label
class="
tag
flex
items-center
gap-2
px-3
py-2
rounded-md
cursor-pointer
hover:bg-[var(--vscode-list-hoverBackground)]
"
>

<input
type="checkbox"
value="${tag}"
${checked}
class="accent-current"
>

<span class="text-sm">
${tag}
</span>

</label>

`;
}
export function escapeHtml(value: string = '') {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function rootHtml() {
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
	<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
	<meta name="description" content="" />
	<meta name="author" content="" />
	<meta name="viewport" content="user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, width=device-width" />
	<title></title>
    <style>
        ${rootCSS()}
    </style>
</head>
<body>

	<script type="text/javascript" src="//ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js"></script>
</body>
</html>
    `;
}
function rootCSS() {
  return `
* {
  box-sizing: border-box;
}

h1,
h2,
h3,
h4,
h5,
h6,
p,
ul,
ol,
blockquote {
  margin: 0;
}

body {
  margin: 0;
  font-family: Inter, system-ui, sans-serif;
  line-height: 1.5;

  background: var(--bg);
  color: var(--text);
}

button,
input {
  font: inherit;
}

/* =========================================================
    DESIGN TOKENS
========================================================== */

:root {
  --space-1: 8px;
  --space-2: 12px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;
  --space-6: 48px;

  --bg: #f6f7fb;

  --panel: #ffffff;
  --panel-soft: rgba(255, 255, 255, 0.7);

  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.65);

  --border: rgba(15, 23, 42, 0.12);

  --shadow: 0 10px 30px rgba(0, 0, 0, 0.06);

  --concept: #2563eb;
  --fixed: #22c55e;
  --wrong: #ef4444;

  --code-bg: #f1f5f9;
  --code-text: #0f172a;
  --code-border: rgba(15, 23, 42, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;

    --panel: #141821;
    --panel-soft: rgba(255, 255, 255, 0.04);

    --text: #e5e7eb;
    --muted: rgba(229, 231, 235, 0.65);

    --border: rgba(255, 255, 255, 0.08);

    --shadow: 0 10px 30px rgba(0, 0, 0, 0.4);

    --code-bg: #0b0f17;
    --code-text: #e5e7eb;
    --code-border: rgba(255, 255, 255, 0.1);
  }
}

/* =========================================================
    PAGE
========================================================== */

.page {
  min-height: 100vh;

  padding: var(--space-6);

  display: flex;
  flex-direction: column;
  gap: var(--space-5);

  max-width: 1100px;
  margin: 0 auto;
}

.hero {
  padding: 28px;
  border-radius: 20px;

  background: var(--panel-soft);

  border: 1px solid var(--border);

  box-shadow: var(--shadow);

  backdrop-filter: blur(10px);
}

.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.hero-title {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.hero-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  padding: 4px 10px;

  border-radius: 999px;

  font-size: 11px;
  font-weight: 600;

  border: 1px solid var(--border);

  background: var(--panel);
  color: var(--muted);
}

.tag.proposition {
  color: var(--concept);
}

.tag.fixed {
  color: var(--fixed);
}

.tag.warning {
  color: var(--wrong);
}

.hero-desc {
  margin-top: 14px;

  max-width: 75ch;

  color: var(--muted);
}

/* =========================================================
    CARD
========================================================== */

.demo {
  border-radius: 20px;
  overflow: hidden;

  box-shadow: var(--shadow);
}

.demo-surface {
  position: relative;

  background: var(--panel-soft);

  border: 1px solid var(--border);
}

.role {
  position: relative;
}

.role::before {
  content: "";

  position: absolute;

  left: 0;
  top: 0;
  bottom: 0;

  width: 4px;

  background: var(--concept);
}

.demo-header {
  padding: 16px 20px;

  border-bottom: 1px solid var(--border);

  background: color-mix(in srgb, var(--concept) 10%, transparent);
}

.demo-header h2 {
  font-size: 18px;
  font-weight: 650;
}

.demo-body {
  padding: var(--space-5);

  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* =========================================================
    MINI REACT CARD
========================================================== */

.card {
  display: flex;
  flex-direction: column;
  gap: 18px;

  padding: 28px;

  border-radius: 18px;

  background: var(--panel);

  border: 1px solid var(--border);
}

.card-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.muted {
  color: var(--muted);
}

.counter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  flex-wrap: wrap;
}

.counter-value {
  font-size: 72px;
  font-weight: 800;
  letter-spacing: -0.05em;
  line-height: 1;
}

.controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid var(--border);

  background: var(--panel-soft);

  color: var(--text);

  padding: 12px 18px;

  border-radius: 12px;

  cursor: pointer;

  transition:
    transform 120ms ease,
    background 120ms ease,
    border-color 120ms ease;
}

.btn:hover {
  transform: translateY(-1px);

  background: color-mix(in srgb, var(--concept) 10%, var(--panel));
}

.btn:active {
  transform: translateY(0);
}

.btn-primary {
  border-color: color-mix(in srgb, var(--concept) 40%, var(--border));
}

.btn-danger {
  border-color: color-mix(in srgb, var(--wrong) 40%, var(--border));
}

.btn-success {
  border-color: color-mix(in srgb, var(--fixed) 40%, var(--border));
}

.code {
  background: var(--code-bg);
  color: var(--code-text);

  border: 1px solid var(--code-border);

  border-radius: 14px;

  padding: 16px;

  overflow: auto;

  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 700px) {
  .page {
    padding: 20px;
  }

  .hero-title {
    font-size: 24px;
  }

  .counter-value {
    font-size: 56px;
  }

  .counter-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
`;
}
function rootScript() {
  return `
<script>
    const vscode = acquireVsCodeApi()

    console.log('webview loaded')

    const button = document.querySelector('button.save')

    console.log('save button', button)

    button.addEventListener('click', () => {
        console.log('clicked')

        vscode.postMessage({
            type: 'saveBookmark',
            bookmark: {
                label: document.querySelector('input[name="label"]')
                    .value,
                description: document.querySelector(
                    'input[name="description"]',
                ).value,
                privacy: document.querySelector(
                    'select[name="privacy"]',
                ).value,
                type: document.querySelector('select[name="type"]')
                    .value,
                body: document.querySelector('textarea[name="body"]')
                    .value,
                context: document.querySelector(
                    'textarea[name="context"]',
                ).value,
                code: document.querySelector('textarea[name="code"]')
                    .value,
                repo: document.querySelector('input[name="repo"]')
                    .value,
                commit: document.querySelector('input[name="commit"]')
                    .value,
                scope: document.querySelector('input[name="scope"]')
                    .value,
            },
        })
    })
</script>
<script>
const vscode = acquireVsCodeApi()

document
    .querySelector('button.save')
    .addEventListener('click', () => {})
hljs.highlightAll();
</script>
    `;
}
function rootCSS2() {
  return `
<style>
    html,
    body {
        margin: 0;
        padding: 0;
        height: 100%;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-font-family);
    }

    .container {
        width: min(1000px, 100%);
        margin: 0 auto;
        padding: 32px;
        box-sizing: border-box;
    }

    h1 {
        margin-top: 0;
        font-size: 26px;
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    label {
        font-size: 13px;
        font-weight: 600;
        opacity: 0.8;
    }

    input,
    textarea,
    select {
        width: 100%;
        box-sizing: border-box;

        padding: 10px 12px;

        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);

        border: 1px solid var(--vscode-input-border);
        border-radius: 5px;

        font-family: inherit;
        font-size: 14px;
    }

    textarea {
        resize: vertical;
        min-height: 120px;
    }

    .body-editor {
        min-height: 300px;
        font-family: var(--vscode-editor-font-family);
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;

        padding: 8px;

        border: 1px solid var(--vscode-input-border);
        border-radius: 5px;

        background: var(--vscode-input-background);
    }

    .tag {
        padding: 4px 10px;
        border-radius: 20px;

        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);

        cursor: pointer;
    }

    .tag.new {
        opacity: 0.5;
    }

    .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
    }

    .actions {
        margin-top: 20px;

        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    button {
        padding: 8px 18px;

        border-radius: 5px;
        border: none;

        cursor: pointer;

        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
    }

    button:hover {
        background: var(--vscode-button-hoverBackground);
    }
</style>    
`;
}
