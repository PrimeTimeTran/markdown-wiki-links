import type { CommandDefinition } from "./command-schema";

const newCmd: CommandDefinition = {
  id: "estate.anchor.view",
  title: "Estate: View anchor",
  icon: "$(preview)",
  menus: [
    {
      menu: "editor/title/context",
      group: "navigation",
    },
  ],
};

// const items = ["bookmark", "series", "settings", "pipeline"];

// TODO:
// Menu icons aren't behaving consistently in sidebar click of file explorer
// Tab switch hotkey)
export const COMMANDS: CommandDefinition[] = [
  // {
  //   title: "Estate: Trace Flow through app",
  //   id: "estate.flow.create",
  //   shortTitle: "Toggle `//` line comments.",
  //   icon: "$(comment)",
  //   category: "comment",
  //   menus: [],
  //   keybindings: [
  //     {
  //       key: "cmd+/",
  //       when: "editorTextFocus && !editorReadonly && (editorLangId == rust || editorLangId == javascript || editorLangId == typescript)",
  //     },
  //   ],
  // },
  {
    title: "Estate: Toggle Line Comment '//'",
    id: "estate.commentToggle.line",
    shortTitle: "Toggle `//` line comments.",
    icon: "$(comment)",
    category: "comment",
    menus: [],
    keybindings: [
      {
        key: "cmd+/",
        when: "editorTextFocus && !editorReadonly && (editorLangId == rust || editorLangId == javascript || editorLangId == typescript)",
      },
    ],
  },
  {
    title: "Estate: Toggle Rust Inner Doc Comment '//!'",
    id: "estate.commentToggle.innerDoc",
    shortTitle: "Toggle `//!` inner doc comments.",
    icon: "$(comment-discussion)",
    category: "comment",
    menus: [],
    keybindings: [
      {
        key: "f13 f13 cmd+/",
        when: "editorLangId == rust && editorTextFocus && !editorReadonly",
      },
    ],
  },
  {
    title: "Estate: Toggle Rust Outer Doc Comment '///'",
    id: "estate.commentToggle.outerDoc",
    shortTitle: "Toggle `///` outer doc comments.",
    icon: "$(comment-discussion)",
    category: "comment",
    menus: [],
    keybindings: [
      {
        key: "f13 cmd+/",
        when: "editorLangId == rust && editorTextFocus && !editorReadonly",
      },
    ],
  },
  {
    title: "Estate: Toggle JavaScript Doc Comment '/** */'",
    id: "estate.commentToggle.doc",
    shortTitle: "Toggle `/** **/` doc comments.",
    icon: "$(comment-discussion)",
    category: "comment",
    menus: [],
    keybindings: [
      {
        key: "f13 cmd+/",
        when: "(editorLangId == javascript || editorLangId == typescript) && editorTextFocus && !editorReadonly",
      },
    ],
  },
  {
    title: "Estate: Toggle JavaScript Block Comment '/* */'",
    id: "estate.commentToggle.block",
    shortTitle: "Toggle `/* */` block comments.",
    icon: "$(comment-discussion)",
    category: "comment",
    menus: [],
    keybindings: [
      {
        key: "f13 f13 cmd+/",
        when: "(editorLangId == javascript || editorLangId == typescript) && editorTextFocus && !editorReadonly",
      },
    ],
  },
  {
    title: "Estate: Open Command Palette",
    id: "estate.cmdPalette.show",
    shortTitle: "Find commands easily using the cmd palette",
    icon: "$(zap)",
    category: "cmd",
    menus: [],
  },
  {
    title: "Estate: Development Start",
    id: "estate.pipeline.start",
    shortTitle: "Start pipeline",
    icon: "$(debug-start)",
    group: "pipeline",
    category: "pipeline",
    menus: [
      {
        menu: "view/title",
        group: "navigation",
        when: "view == estateExplorer && !estate.leader || estate.leader == 0",
      },
    ],
  },
  {
    title: "Estate: Development Stop",
    id: "estate.pipeline.stop",
    shortTitle: "Stop pipeline",
    icon: "$(debug-stop)",
    group: "pipeline",
    category: "pipeline",
    menus: [
      {
        menu: "view/title",
        group: "navigation",
        when: "view == estateExplorer && estate.leader == 1",
      },
    ],
  },
  {
    title: "Estate: Development Clear",
    id: "estate.pipeline.clear",
    shortTitle: "Clear pipeline",
    icon: "$(debug-console-clear-all)",
    group: "pipeline",
    category: "pipeline",
    menus: [
      {
        menu: "view/title",
        group: "navigation",
        when: "view == estateExplorer && estate.leader == 2",
      },
    ],
  },
  {
    title: "Estate: Create settings",
    id: "estate.settings.create",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor && estateExplorer.visible",
      },
      {
        menu: "editor/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
    icon: "$(add)",
  },
  {
    title: "Estate: View settings",
    id: "estate.settings.read",
    icon: "$(gear)",
    enablement: "estateExplorer.visible",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Edit settings",
    id: "estate.settings.update",
    icon: "$(edit)",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Delete settings",
    id: "estate.settings.delete",
    icon: "$(trash)",
    menus: [
      {
        menu: "editor/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Create series",
    id: "estate.series.create",
    icon: "$(add)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: View series",
    id: "estate.series.read",
    icon: "$(view)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: Edit series",
    id: "estate.series.update",
    icon: "$(edit)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: Delete series",
    id: "estate.series.delete",
    icon: "$(trash)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: Create bookmark",
    id: "estate.bookmark.create",
    icon: "$(add)",
    group: "bookmarks@1",
    menus: [
      {
        // File Exploer right click
        menu: "explorer/context",
        group: "navigation",
      },
      {
        // Sidebar top level menu
        menu: "view/title",
        group: "navigation",
        when: "view == estateExplorer",
      },
      {
        // Editor top tabs menu
        menu: "editor/title",
        group: "navigation",
        when: "!estate.hasAnchor",
      },
      {
        // Sidebar tree list row
        menu: "view/item/context",
        group: "inline@1",
        // Section header?
        when: "viewItem == folder",
      },
    ],
  },
  {
    title: "Estate: View bookmark",
    id: "estate.bookmark.read",
    icon: "$(preview)",
    group: "bookmarks@2",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        // When Sidebar Estate Explorer is visible
        when: "estate.hasAnchor && !estateExplorer.visible",
      },
      {
        menu: "view/item/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Edit bookmark",
    id: "estate.bookmark.update",
    icon: "$(preferences-open-settings)",
    group: "bookmarks@3",
    menus: [
      {
        menu: "view/item/context",
        group: "inline@2",
        when: "viewItem == folder",
      },
    ],
  },
  {
    title: "Estate: Delete bookmark",
    id: "estate.bookmark.delete",
    icon: "$(trash)",
    group: "bookmarks@4",
    menus: [
      // Show an option to delete this bookmark item in the editor title
      // when estate explorer is visible
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor",
      },
      {
        menu: "view/item/context",
        group: "inline@3",
        when: "estate.hasAnchor",
      },
      {
        menu: "editor/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    id: "ui.toggleMDPreview",
    title: "Wiki Links: Preview Mode (Toggle)",
  },
  {
    id: "flowify.analyzeLine",
    title: "Estate: Analyze Subject",
  },
  {
    id: "estate.snippet.create",
    title: "Estate: Create snippet",
    icon: "$(add)",
    shortTitle: "Open a scratch pad for brainstorming ideas out quick and easy.",
  },
  {
    id: "estate.snippet.read",
    title: "Estate: Read snippet",
    icon: "$(view)",
    shortTitle: "View snippets",
  },
  {
    id: "estate.snippet.update",
    title: "Estate: Update snippet",
    icon: "$(edit)",
    shortTitle: "Update snippets",
  },
  {
    id: "estate.snippet.delete",
    title: "Estate: Delete snippet",
    icon: "$(trash)",
    shortTitle: "Delete snippet",
  },
  {
    id: "estate.anchor.pipeline",
    title: "Estate: Anchor a pipeline's flow",
    shortTitle:
      "Understand your code by noting steps through configuration files, branches, and variants",

    icon: "$(type-hierarchy-sub)",

    category: "Estate",

    enablement: "estate.input",

    docs: {
      path: "docs/commands/anchor-pipeline.md",
      description: "Creates pipeline anchors from configuration and code flow.",
    },

    implementation: {
      file: "src/commands/anchorPipeline.ts",
      symbol: "anchorPipeline",
    },

    menus: [
      {
        menu: "view/item/context",
        when: "view == estateTree",
        group: "estate@1",
      },
    ],
    keybindings: [
      {
        key: "ctrl+alt+a",
        when: "editorTextFocus",
      },
    ],
  },
  {
    title: "Estate: Filter bookmarks",
    id: "estate.bookmark.filter",
    icon: "$(filter)",
    // Adding to the maain contributes.commands reveals in editor group right click reveal panel
    // {
    //     "command": "estate.bookmark.filter",
    //     "title": "Estate: Filter bookmarks",
    //     "icon": "$(filter)"
    //   },
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor && estateExplorer.visible",
      },
      {
        menu: "view/item/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
      // Editor group right click context.
      // The pop up panel when user right clicks
      {
        menu: "editor/title/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: View Options",
    id: "estate.explore.options",
    icon: "$(filter)",
    menus: [
      {
        menu: "view/title",
        group: "navigation",
        when: "view == estateExplorer",
      },
    ],
  },
  {
    title: "Estate: Open Quick Pick",
    id: "estate.ui.quickPick",
    shortTitle: "Quick Pick from the command palette",
    icon: "$(zap)",
    menus: [
      // {
      //   menu: "view/title",
      //   group: "navigation",
      //   when: "view == estateExplorer",
      // },
    ],
  },
  {
    id: "estate.ownership.show",
    title: "Estate: Show Rust Ownership Analysis",
    shortTitle: "Visualize ownership relationships and affected code regions",
    icon: "$(references)",
    category: "ownership",
    enablement: "estate.rustAnalyzerReady",
    docs: {
      path: "docs/commands/show-ownership.md",
    },

    implementation: {
      file: "src/commands/showOwnership.ts",
      symbol: "showOwnership",
    },

    menus: [
      //{
      //menu: "editor/title",
      // when: "editorLangId == rust",
      //group: "estate",
      // },

      {
        // Editor top tabs menu
        menu: "editor/title",
        group: "navigation",
        when: "!estate.hasAnchor && editorLangId == rust",
      },
    ],
    keybindings: [
      {
        key: "ctrl+alt+o",
        when: "editorLangId == rust",
      },
    ],
  },
];
