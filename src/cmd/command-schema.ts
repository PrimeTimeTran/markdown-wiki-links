export type MenuId =
  | "commandPalette"
  | "view/title"
  | "view/item/context"
  | "editor/context"
  | "editor/title"
  | "explorer/context"
  | "editor/title/context"
  | "commandPalette";
export interface Keybinding {
  key: string;
  when?: string;
}
export interface MenuContribution {
  menu: MenuId;
  when?: string;
  group?: string;
}
export interface CommandDefinition {
  id: string;

  title: string;
  shortTitle?: string;

  icon?: string;
  category?: string;

  docs?: {
    path: string;
    description?: string;
  };

  implementation?: {
    file: string;
    symbol?: string;
  };

  enablement?: string;

  menus?: MenuContribution[];

  keybindings?: Keybinding[];
}
