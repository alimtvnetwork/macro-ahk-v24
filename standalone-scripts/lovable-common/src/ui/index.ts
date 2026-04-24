/**
 * Shared XPath Editor — public barrel.
 *
 * Consumed by lovable-owner-switch (P18 wires it into its popup) and
 * lovable-user-add (P18 wires it into its popup). Single source of
 * truth — both popups render the same editor; backing storage is the
 * project's own `XPathSetting` table.
 */

export { mountXPathEditor } from "./xpath-editor-shell";
export { buildDefaultEditorRows } from "./xpath-editor-defaults";
export { buildEditorTable } from "./xpath-editor-table";
export { readEditorRows } from "./xpath-editor-reader";
export type { XPathEditorOptions, XPathEditorRow } from "./xpath-editor-types";
export { TITLE_EDITOR, LABEL_RESET, LABEL_SAVE } from "./xpath-editor-constants";
