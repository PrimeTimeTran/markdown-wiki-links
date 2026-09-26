export type MenuId =
  | "editor/context"
  | "editor/title"
  | "editor/title/context"
  | "explorer/context"
  | "view/item/context"
  | "view/title"
  
export interface Keybinding {
  key: string;
  when?: string;
}
export interface MenuContribution {
  menu: MenuId;
  when?: string;
  group?: string;
}
export type CommandId = string;

export interface CommandDefinition {
  id: CommandId;
  title: string;
  shortTitle?: string;
  icon?: string;
  category?: string;
  group?: string;
  docs?: {
    path: string;
    description?: string;
  };
  configKey?: string; 
  implementation?: {
    file: string;
    symbol?: string;
  };

  enablement?: string;

  menus?: MenuContribution[];

  keybindings?: Keybinding[];
}
