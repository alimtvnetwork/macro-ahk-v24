/**
 * Marco Extension — Hover Field-Binding Overlay
 *
 * Phase 08 — Macro Recorder.
 *
 * In-page UI mounted in a closed Shadow Root that follows the cursor as the
 * user hovers over input-like elements (`input`, `textarea`,
 * `[contenteditable]`). Shows a column picker — clicking a column emits a
 * binding payload that the caller persists via `RECORDER_FIELD_BINDING_UPSERT`.
 *
 * The overlay does *not* mutate the host page (no `{{Column}}` is written
 * into the input). It also previews the resolved value via
 * {@link resolveFieldReferences} when a sample row is supplied.
 *
 * @see ./field-reference-resolver.ts — `{{Column}}` substitution
 * @see spec/31-macro-recorder/08-field-reference-wrapper.md
 */

import { resolveFieldReferences, type FieldRow } from "./field-reference-resolver";

export const FIELD_BINDING_HOST_ID = "marco-recorder-field-binding-host";

export interface FieldBindingOptions {
    /** Column names available in the active data source. */
    readonly Columns: ReadonlyArray<string>;
    /** Optional sample row used to preview the resolved value of a column. */
    readonly SampleRow?: FieldRow;
    /** Invoked when the user clicks a column for the currently-hovered field. */
    readonly OnBind: (binding: FieldBindingPayload) => void;
}

export interface FieldBindingPayload {
    readonly Target: HTMLElement;
    readonly ColumnName: string;
    readonly Template: string; // e.g. "{{Email}}"
    readonly PreviewValue: string | null;
}

export interface FieldBindingHandle {
    readonly Host: HTMLElement;
    readonly Root: ShadowRoot;
    /** Currently-hovered bindable element, if any. */
    GetHoveredTarget(): HTMLElement | null;
    Destroy(): void;
}

const STYLE = `
:host { all: initial; }
.popover {
    position: fixed; z-index: 2147483645;
    display: none; min-width: 180px; max-width: 240px;
    padding: 8px; border-radius: 8px;
    background: #111; color: #fff;
    font: 500 12px/1.3 system-ui, -apple-system, sans-serif;
    box-shadow: 0 6px 20px rgba(0,0,0,.45);
}
.popover[data-open="true"] { display: block; }
.title { font-size: 10px; opacity: .7; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
.col {
    display: flex; justify-content: space-between; gap: 10px;
    width: 100%; box-sizing: border-box;
    appearance: none; border: 0; cursor: pointer;
    padding: 5px 8px; border-radius: 6px;
    background: transparent; color: inherit; font: inherit; text-align: left;
}
.col:hover, .col:focus { background: #2a2a2a; outline: none; }
.col-name { font-weight: 600; }
.col-preview { opacity: .65; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline {
    position: fixed; z-index: 2147483644; pointer-events: none;
    border: 2px solid #16a34a; border-radius: 4px; display: none;
}
.outline[data-open="true"] { display: block; }
`;

const BINDABLE_SELECTOR = "input, textarea, [contenteditable=''], [contenteditable='true']";

export function mountFieldBindingOverlay(
    options: FieldBindingOptions,
    container: ParentNode = document.body,
): FieldBindingHandle {
    if (container === null || container === undefined) {
        throw new Error("mountFieldBindingOverlay: no container available");
    }

    const host = document.createElement("div");
    host.id = FIELD_BINDING_HOST_ID;
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    const outline = document.createElement("div");
    outline.className = "outline";
    outline.dataset.open = "false";
    root.appendChild(outline);

    const popover = document.createElement("div");
    popover.className = "popover";
    popover.dataset.open = "false";
    popover.setAttribute("role", "menu");
    popover.setAttribute("aria-label", "Field bindings");
    root.appendChild(popover);

    container.appendChild(host);

    let hovered: HTMLElement | null = null;
    let pinned = false;

    renderColumns();

    function renderColumns(): void {
        popover.innerHTML = "";
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = "Bind to column";
        popover.appendChild(title);

        for (const col of options.Columns) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "col";
            btn.dataset.column = col;
            btn.setAttribute("role", "menuitem");

            const name = document.createElement("span");
            name.className = "col-name";
            name.textContent = col;
            btn.appendChild(name);

            const preview = document.createElement("span");
            preview.className = "col-preview";
            preview.textContent = options.SampleRow?.[col] ?? "";
            btn.appendChild(preview);

            btn.addEventListener("mousedown", (e) => { e.preventDefault(); }); // don't blur target
            btn.addEventListener("click", () => { handleBind(col); });
            popover.appendChild(btn);
        }
    }

    function handleBind(col: string): void {
        if (hovered === null) { return; }
        const template = `{{${col}}}`;
        let preview: string | null = null;
        if (options.SampleRow !== undefined) {
            try { preview = resolveFieldReferences(template, options.SampleRow); }
            catch { preview = null; }
        }
        options.OnBind({ Target: hovered, ColumnName: col, Template: template, PreviewValue: preview });
        pinned = false;
        hide();
    }

    function show(target: HTMLElement): void {
        hovered = target;
        const rect = target.getBoundingClientRect();
        outline.style.left   = `${rect.left}px`;
        outline.style.top    = `${rect.top}px`;
        outline.style.width  = `${rect.width}px`;
        outline.style.height = `${rect.height}px`;
        outline.dataset.open = "true";

        popover.style.left = `${rect.left}px`;
        popover.style.top  = `${rect.bottom + 6}px`;
        popover.dataset.open = "true";
    }
    function hide(): void {
        if (pinned) { return; }
        hovered = null;
        outline.dataset.open = "false";
        popover.dataset.open = "false";
    }

    function isOurNode(node: EventTarget | null): boolean {
        return node === host || (node instanceof Node && host.contains(node));
    }

    function onMove(e: MouseEvent): void {
        if (pinned) { return; }
        const t = e.target;
        if (isOurNode(t)) { return; }
        if (!(t instanceof HTMLElement)) { hide(); return; }
        const candidate = t.closest(BINDABLE_SELECTOR);
        if (candidate instanceof HTMLElement) {
            show(candidate);
        } else {
            hide();
        }
    }

    function onClick(e: MouseEvent): void {
        const t = e.target;
        if (isOurNode(t)) { return; }
        if (!(t instanceof HTMLElement)) { return; }
        const candidate = t.closest(BINDABLE_SELECTOR);
        if (candidate instanceof HTMLElement) {
            e.preventDefault();
            pinned = true;
            show(candidate);
        } else {
            pinned = false;
            hide();
        }
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click",     onClick, true);

    let destroyed = false;
    return {
        Host: host,
        Root: root,
        GetHoveredTarget: () => hovered,
        Destroy: () => {
            if (destroyed) { return; }
            destroyed = true;
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("click",     onClick, true);
            host.remove();
        },
    };
}
