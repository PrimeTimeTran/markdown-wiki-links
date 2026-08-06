import * as fs from "node:fs";
import * as path from "node:path";

import { COMMANDS } from "./cmds";
import type { Keybinding } from "./command-schema";

interface CommandDefinition {
  id: string;
  title: string;
  shortTitle?: string;
  icon?: string;
  category?: string;
  docs?: {
    path: string;
    anchors?: string[];
  };
  implementation?: {
    file: string;
    symbol?: string;
  };
  enablement?: string;
  menus?: MenuContribution[];
  keybindings?: Keybinding[];
}
interface MenuContribution {
  menu:
    | "view/title"
    | "view/item/context"
    | "editor/context"
    | "editor/title"
    | "editor/title/context";

  when?: string;
  group?: string;
}

interface PackageContributes {
  commands: Array<{
    command: string;
    title: string;
    category?: string;
    icon?: string;
    enablement?: string;
  }>;

  menus: Record<
    string,
    Array<{
      command: string;
      when?: string;
      group?: string;
    }>
  >;

  keybindings: Array<{
    command: string;
    key: string;
    when?: string;
  }>;
}

export function generatePackageContributes(commands: CommandDefinition[]) {
  return {
    commands: commands.map((cmd) => ({
      command: cmd.id,
      title: cmd.title,

      ...(cmd.shortTitle && {
        shortTitle: cmd.shortTitle,
      }),

      ...(cmd.category && {
        category: cmd.category,
      }),

      ...(cmd.icon && {
        icon: cmd.icon,
      }),

      ...(cmd.enablement && {
        enablement: cmd.enablement,
      }),
    })),

    menus: commands.reduce<Record<string, any[]>>((menus, cmd) => {
      for (const menu of cmd.menus ?? []) {
        menus[menu.menu] ??= [];

        menus[menu.menu].push({
          command: cmd.id,

          ...(menu.when && {
            when: menu.when,
          }),

          ...(menu.group && {
            group: menu.group,
          }),
        });
      }

      return menus;
    }, {}),

    keybindings: commands.flatMap((cmd) =>
      (cmd.keybindings ?? []).map((binding) => ({
        command: cmd.id,
        key: binding.key,

        ...(binding.when && {
          when: binding.when,
        }),
      })),
    ),
  };
}

function generatePackageJson(commands: typeof COMMANDS) {
  return {
    contributes: {
      commands: commands.map((cmd) => ({
        command: cmd.id,
        title: cmd.title,
        category: cmd.category,
        icon: cmd.icon,
      })),

      menus: commands.reduce(
        (acc, cmd) => {
          for (const menu of cmd.menus ?? []) {
            acc[menu.menu] ??= [];

            acc[menu.menu].push({
              command: cmd.id,
              when: menu.when,
              group: menu.group,
            });
          }

          return acc;
        },
        {} as Record<string, unknown[]>,
      ),

      keybindings: commands.flatMap((cmd) =>
        (cmd.keybindings ?? []).map((binding) => ({
          command: cmd.id,
          key: binding.key,
          when: binding.when,
        })),
      ),
    },
  };
}

function generateCommandConstants(commands: typeof COMMANDS) {
  const tree: Record<string, any> = {};
  for (const cmd of commands) {
    const parts = cmd.id.split(".");
    let cursor = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        cursor[part] = cmd.id;
      } else {
        cursor[part] ??= {};
        cursor = cursor[part];
      }
    }
  }
  function emit(obj: Record<string, any>, indent = 2): string {
    const spaces = " ".repeat(indent);
    const lines = ["{"];
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        lines.push(`${spaces}${key}: "${value}",`);
      } else {
        lines.push(`${spaces}${key}: ${emit(value, indent + 2)},`);
      }
    }
    lines.push(" ".repeat(indent - 2) + "}");
    return lines.join("\n");
  }
  return [
    "// GENERATED FILE",
    "",
    "export const CMD = ",
    [emit(tree), " as const;", ""].join(""),
  ].join("\n");
}

function generateDocs(commands: typeof COMMANDS) {
  return commands
    .map((cmd) => {
      return `
# ${cmd.title}

Command:

\`${cmd.id}\`

${cmd.shortTitle ?? ""}

Category:
${cmd.category ?? ""}

Documentation:
${cmd.docs?.path ?? "none"}

Implementation:
${cmd.implementation?.file ?? "none"}

Menus:
${(cmd.menus ?? []).map((m) => `- ${m.menu}`).join("\n")}

---
`;
    })
    .join("\n");
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), {
    recursive: true,
  });

  fs.writeFileSync(file, content);
}

export function syncCommands() {
  const root = process.cwd();

  const contributes = generatePackageContributes(COMMANDS);

  //
  // VS Code package.json contributes section
  //
  write(
    path.join(root, "generated/package.contributes.json"),
    JSON.stringify(
      {
        contributes,
      },
      null,
      2,
    ),
  );

  //
  // Typed command constants
  //
  write(path.join(root, "generated/cmd.ts"), generateCommandConstants(COMMANDS));

  //
  // Command documentation index
  //
  write(path.join(root, "generated/commands.md"), generateDocs(COMMANDS));
}

syncCommands();
