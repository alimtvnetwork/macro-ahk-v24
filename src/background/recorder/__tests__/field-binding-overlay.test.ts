// @vitest-environment jsdom

/**
 * Marco Extension — Field-Binding Overlay tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    FIELD_BINDING_HOST_ID,
    mountFieldBindingOverlay,
    type FieldBindingHandle,
    type FieldBindingPayload,
} from "../field-binding-overlay";

let handle: FieldBindingHandle | null = null;
afterEach(() => {
    handle?.Destroy();
    handle = null;
    document.body.innerHTML = "";
});

function moveOver(target: Element): void {
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}

describe("FieldBindingOverlay", () => {
    it("mounts a closed shadow root with one button per column", () => {
        handle = mountFieldBindingOverlay({
            Columns: ["Name", "Email"],
            OnBind: () => {},
        });
        expect(document.getElementById(FIELD_BINDING_HOST_ID)).toBe(handle.Host);
        const buttons = handle.Root.querySelectorAll<HTMLButtonElement>("button.col");
        expect(Array.from(buttons).map((b) => b.dataset.column)).toEqual(["Name", "Email"]);
    });

    it("shows the popover when hovering an input and emits a binding on column click", () => {
        const onBind = vi.fn<(p: FieldBindingPayload) => void>();
        handle = mountFieldBindingOverlay({
            Columns: ["Email"],
            SampleRow: { Email: "a@x.com" },
            OnBind: onBind,
        });

        const input = document.createElement("input");
        input.type = "text";
        document.body.appendChild(input);
        moveOver(input);
        expect(handle.GetHoveredTarget()).toBe(input);

        const colBtn = handle.Root.querySelector<HTMLButtonElement>('button[data-column="Email"]');
        colBtn!.click();

        expect(onBind).toHaveBeenCalledTimes(1);
        const payload = onBind.mock.calls[0]![0];
        expect(payload.ColumnName).toBe("Email");
        expect(payload.Template).toBe("{{Email}}");
        expect(payload.PreviewValue).toBe("a@x.com");
        expect(payload.Target).toBe(input);
    });

    it("does not show the popover for non-bindable elements", () => {
        handle = mountFieldBindingOverlay({ Columns: ["X"], OnBind: () => {} });
        const div = document.createElement("div");
        document.body.appendChild(div);
        moveOver(div);
        expect(handle.GetHoveredTarget()).toBeNull();
    });

    it("supports contenteditable elements", () => {
        const onBind = vi.fn<(p: FieldBindingPayload) => void>();
        handle = mountFieldBindingOverlay({ Columns: ["Note"], OnBind: onBind });
        const editable = document.createElement("div");
        editable.setAttribute("contenteditable", "true");
        document.body.appendChild(editable);
        moveOver(editable);
        expect(handle.GetHoveredTarget()).toBe(editable);
    });

    it("Destroy removes the host and detaches listeners", () => {
        handle = mountFieldBindingOverlay({ Columns: ["X"], OnBind: () => {} });
        handle.Destroy();
        expect(document.getElementById(FIELD_BINDING_HOST_ID)).toBeNull();
    });
});
