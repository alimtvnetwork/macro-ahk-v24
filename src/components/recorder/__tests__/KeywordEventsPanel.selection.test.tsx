/**
 * Component-level smoke tests for Gmail-style multi-selection wired into the
 * Keyword Events panel. We mount the panel directly (skipping the dialog
 * shell) and assert that:
 *
 *   • a plain click on an event selects only that event,
 *   • a Shift-click on a later event extends the range from the anchor,
 *   • a Ctrl/Cmd-click toggles individual events.
 *
 * The underlying reducer is unit-tested in detail in
 * src/hooks/__tests__/use-shift-click-selection.test.tsx — this file only
 * verifies the panel actually wires the hook to its rows.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { KeywordEventsPanel } from "@/components/recorder/KeywordEventsPanel";

function openPanel(): void {
    fireEvent.click(screen.getByTestId("keyword-events-open"));
}

function addEvent(name: string): void {
    const input = screen.getByTestId("keyword-events-new-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: "Enter" });
}

function eventCard(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("[data-testid^=keyword-event-]"))
        .filter(el => /^keyword-event-[^-]+$/.test(el.dataset.testid ?? ""));
}

describe("KeywordEventsPanel — multi-selection", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("plain, shift, and ctrl clicks drive the selection toolbar count", () => {
        render(<KeywordEventsPanel />);
        openPanel();
        act(() => {
            addEvent("alpha");
            addEvent("bravo");
            addEvent("charlie");
        });

        const cards = eventCard();
        expect(cards.length).toBe(3);

        // Plain click on the first card → 1 selected.
        fireEvent.click(cards[0]);
        expect(screen.getByTestId("keyword-events-selection-count").textContent).toBe("1 selected");

        // Shift-click on the third card → range of 3.
        fireEvent.click(cards[2], { shiftKey: true });
        expect(screen.getByTestId("keyword-events-selection-count").textContent).toBe("3 selected");

        // Ctrl-click toggles the middle one off → 2 selected.
        fireEvent.click(cards[1], { ctrlKey: true });
        expect(screen.getByTestId("keyword-events-selection-count").textContent).toBe("2 selected");

        // Clear button empties the selection.
        fireEvent.click(screen.getByTestId("keyword-events-selection-clear"));
        expect(screen.queryByTestId("keyword-events-selection-toolbar")).toBeNull();
    });

    it("selection toolbar is hidden when nothing is selected", () => {
        render(<KeywordEventsPanel />);
        openPanel();
        act(() => { addEvent("solo"); });
        expect(screen.queryByTestId("keyword-events-selection-toolbar")).toBeNull();
    });
});
