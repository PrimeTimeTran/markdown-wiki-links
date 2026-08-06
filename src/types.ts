import * as vscode from "vscode";

import { Anchor } from "./anchor";
import { EstateContext, EstateFlag } from "./estate";

export interface AnchorSource {
  uri: string;
  startLine: number;
  endLine: number;
  startCharacter?: number;
  endCharacter?: number;
  languageId?: string;
}
export interface AnchorRef {
  id: string;
  line: number;
  start: number;
  end: number;
}
export interface AnchorLocation {
  uri: string;
  line: number;
  start: number;
  end: number;
}

export interface CreateAnchorOptions {
  label?: string;
  description?: string;
  privacy: "personal" | "repo" | "workspace";
  captureCode?: boolean;
  captureScope?: boolean;
  captureContext?: boolean;
}
export interface Result<T> {
  ok: boolean;
  value?: T;
  error?: string;
}
export type AnchorOrigin = "system" | "personal" | "workspace";

// CRUD
// - [ ] Create
// - [ ] Read
// - [ ] Update
// - [ ] Delete
export interface AnchorStoreType {
  //
  get(id: string): Anchor | undefined;
  loadRegistry(path: string): void;
  save(): void;
  create(
    id: string,
    ctx: EstateContext,
    opts: CreateAnchorOptions,
    anchor: Partial<Anchor>,
  ): Partial<Anchor>;
  update(anchor: Anchor): void;
  delete(id: string): void;
  find(file: vscode.Uri, text: string, line: number): AnchorRef[];
  findByUri(uri: vscode.Uri): Anchor[];

  list(): Anchor[];
  hasFlag(id: string): boolean;
  getFlag(id: string): EstateFlag | undefined;
}
