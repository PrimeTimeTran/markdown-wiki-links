# VSCode Extension Command Maintenance

They diverge when we have to extract keys in each section for different reasons

- Code
- pkg.json configurations

1. Define root registry in `./cmds.ts`

```ts

```

```ts
./cmds.ts
const COMMAND_NAMES = [
    {
        "command": "estate.anchor.pipeline",
        "title": "Estate: Anchor a pipeline's flow",
        "shortTitle": "Understand your code by noting steps through configuration files, branches, and variants",
        "icon": "$(type-hierarchy-sub)",
        "category": "UI",
        "enablement": "estate.input"
    },
    // ...
]
```

2. Generate a variant to maintain type system while coding.

```ts
export const CMD = {
  estate: {
    anchor: "anchor.pipeline",
    //...
  },
  //...
};
```

3. Generate an object used to keep pkg.json up to date with the "latest version" of cmds

```ts
let pkgJson = {
  menus: {
    // A single command can be inside of multiple contexts...? I dont underatand the system.
    "view/title": [],
    "view/item/context": [],
    "editor/context": [],
    "editor/title": [],
    "editor/title/context": [],
  },
  keybindings: [],
  commands: [],
};
```

4. Expected output.

```ts

```
