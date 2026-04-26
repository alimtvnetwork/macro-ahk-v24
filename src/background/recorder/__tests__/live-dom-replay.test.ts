// @vitest-environment jsdom

/**
 * Marco Extension — Live-DOM Replay Executor tests
 *
 * Verifies that the executor turns persisted Step + Selector rows into real
 * DOM events (`click`, `input`, `change`) on the right element, with
 * `{{Column}}` templates resolved against the active data row.
 */

import { describe, expect, it, vi } from "vitest";
import { executeReplay, type ReplayStepInput } from "../live-dom-replay";
import { SelectorKindId } from "../../recorder-db-schema";
import type { PersistedSelector } from "../step-persistence";

function fullXPathSelector(stepId: number, expr: string): PersistedSelector[] {
    return [{
        SelectorId: stepId * 10,
        StepId: stepId,
        SelectorKindId: SelectorKindId.XPathFull,
        Expression: expr,
        AnchorSelectorId: null,
        IsPrimary: 1,
    }];
}

function cssSelector(stepId: number, expr: string): PersistedSelector[] {
    return [{
        SelectorId: stepId * 10,
        StepId: stepId,
        SelectorKindId: SelectorKindId.Css,
        Expression: expr,
        AnchorSelectorId: null,
        IsPrimary: 1,
    }];
}

describe("executeReplay", () => {
    it("dispatches click events on a button located via XPath", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const btn = document.getElementById("go")!;
        const onClick = vi.fn();
        btn.addEventListener("click", onClick);

        const steps: ReplayStepInput[] = [{
            StepId: 1, Index: 1, Kind: "Click",
            Selectors: fullXPathSelector(1, '//button[@id="go"]'),
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("types into an input via Css selector and resolves {{Column}} from Row", async () => {
        document.body.innerHTML = `<input id="email" />`;
        const input = document.getElementById("email") as HTMLInputElement;
        const onInput = vi.fn();
        input.addEventListener("input", onInput);

        const steps: ReplayStepInput[] = [{
            StepId: 2, Index: 1, Kind: "Type",
            Selectors: cssSelector(2, "#email"),
            Value: "{{Email}}",
        }];

        const outcome = await executeReplay(steps, {
            Doc: document,
            Row: { Email: "alice@example.com" },
        });

        expect(outcome.Results[0]!.Ok).toBe(true);
        expect(input.value).toBe("alice@example.com");
        expect(onInput).toHaveBeenCalledTimes(1);
    });

    it("selects a value in a <select> and fires change", async () => {
        document.body.innerHTML = `<select id="x"><option>A</option><option>B</option></select>`;
        const sel = document.getElementById("x") as HTMLSelectElement;
        const onChange = vi.fn();
        sel.addEventListener("change", onChange);

        const steps: ReplayStepInput[] = [{
            StepId: 3, Index: 1, Kind: "Select",
            Selectors: cssSelector(3, "#x"),
            Value: "B",
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
        expect(sel.value).toBe("B");
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns Ok=false with a clear error when the element is missing", async () => {
        document.body.innerHTML = "";
        const steps: ReplayStepInput[] = [{
            StepId: 4, Index: 1, Kind: "Click",
            Selectors: cssSelector(4, "#nope"),
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(false);
        expect(outcome.Results[0]!.Error).toMatch(/Element not found/);
    });

    it("Wait step uses the injected sleep and resolves Ok", async () => {
        const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
        const steps: ReplayStepInput[] = [{
            StepId: 5, Index: 1, Kind: "Wait", Selectors: [], WaitMs: 250,
        }];
        const outcome = await executeReplay(steps, { Doc: document, Sleep: sleep });
        expect(sleep).toHaveBeenCalledWith(250);
        expect(outcome.Results[0]!.Ok).toBe(true);
    });

    it("executes steps in order and collects per-step results", async () => {
        document.body.innerHTML = `<input id="a" /><button id="b">go</button>`;
        const a = document.getElementById("a") as HTMLInputElement;
        const b = document.getElementById("b") as HTMLButtonElement;
        const clicked = vi.fn();
        b.addEventListener("click", clicked);

        const steps: ReplayStepInput[] = [
            { StepId: 10, Index: 1, Kind: "Type",  Selectors: cssSelector(10, "#a"), Value: "hi" },
            { StepId: 11, Index: 2, Kind: "Click", Selectors: cssSelector(11, "#b") },
        ];
        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results.map((r) => r.Index)).toEqual([1, 2]);
        expect(outcome.Results.every((r) => r.Ok)).toBe(true);
        expect(a.value).toBe("hi");
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it("fails Type step with Reason=VariableMissing and full Variable diagnostics", async () => {
        document.body.innerHTML = `<input id="a" />`;
        const steps: ReplayStepInput[] = [{
            StepId: 20, Index: 1, Kind: "Type",
            Selectors: cssSelector(20, "#a"),
            Value: "Hi {{Email}}",
        }];
        const outcome = await executeReplay(steps, {
            Doc: document,
            Row: { Name: "Alice" },   // Email is missing
        });
        const r = outcome.Results[0]!;
        expect(r.Ok).toBe(false);
        expect(r.FailureReport).toBeDefined();
        expect(r.FailureReport!.Reason).toBe("VariableMissing");
        expect(r.FailureReport!.Variables).toHaveLength(1);
        expect(r.FailureReport!.Variables[0]).toMatchObject({
            Name: "Email", FailureReason: "MissingColumn", ResolvedValue: null,
        });
        // The DOM was not touched because we short-circuited on the variable.
        expect((document.getElementById("a") as HTMLInputElement).value).toBe("");
    });

    it("fails Type step with Reason=VariableNull when value is explicitly null", async () => {
        document.body.innerHTML = `<input id="a" />`;
        const steps: ReplayStepInput[] = [{
            StepId: 21, Index: 1, Kind: "Type",
            Selectors: cssSelector(21, "#a"),
            Value: "{{Phone}}",
        }];
        // Cast — runtime FieldRow may carry null when sourced from SQLite.
        const outcome = await executeReplay(steps, {
            Doc: document,
            Row: { Phone: null } as unknown as Record<string, string>,
        });
        const r = outcome.Results[0]!;
        expect(r.FailureReport!.Reason).toBe("VariableNull");
        expect(r.FailureReport!.Variables[0].Name).toBe("Phone");
    });
});
