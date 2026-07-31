import { Bookmark } from "./bookmarkService";

export const bookmarkShowPage = `
<!DOCTYPE html>
<html>
<head>
<style>
html, body {
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
    opacity: .8;
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
    opacity: .5;
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
</head>

<body>

<div class="container">

<h1>Edit Bookmark</h1>

<div class="form">

    <div class="field">
        <label>Label</label>
        <input value="Bookmark @1785514980825">
    </div>


    <div class="field">
        <label>Description</label>
        <input value="Captured source block">
    </div>


    <div class="row">

        <div class="field">
            <label>Privacy</label>
            <select>
                <option selected>workspace</option>
                <option>private</option>
                <option>public</option>
            </select>
        </div>


        <div class="field">
            <label>Type</label>
            <select>
                <option selected>code</option>
                <option>note</option>
                <option>reference</option>
            </select>
        </div>

    </div>


    <div class="field">
        <label>Tags</label>

        <div class="tags">

            <div class="tag">architecture ×</div>
            <div class="tag">rust ×</div>

            <div class="tag new">
                + Add tag
            </div>

        </div>
    </div>


    <div class="field">
        <label>Body</label>

        <textarea class="body-editor">
# @note

# @context
        </textarea>
    </div>


    <div class="field">
        <label>Context</label>

        <textarea>
        </textarea>
    </div>


    <div class="field">
        <label>Code</label>

        <textarea>
        </textarea>
    </div>


    <div class="field">
        <label>Repository</label>

        <input>
    </div>


    <div class="field">
        <label>Commit</label>

        <input>
    </div>


    <div class="field">
        <label>Scope</label>

        <input value="source.selection">
    </div>


    <div class="actions">
        <button>Cancel</button>
        <button>Save Bookmark</button>
    </div>

</div>

</div>

</body>
</html>
`;

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
