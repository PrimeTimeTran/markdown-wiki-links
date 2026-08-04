export type Command = {
  id: string;
  label: string;
  description: string;
  scope: string;
  action: string;
  title: string;
  command: string;
};

const commands: Command[] = [
  {
    id: "@mdPreviewMode",
    label: "MD Preview Mode",
    title: "Wiki Links: Toggle Preview Mode",
    command: "ui.toggleMDPreview",
    scope: "language",
    action: "ui.toggleMDPreview",
    description: "View rendered .md files ",
  },
];

export { commands };
