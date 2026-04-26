/**
 * Marco Extension — Field Reference Resolver
 *
 * Phase 08 — Macro Recorder.
 *
 * Replaces `{{ColumnName}}` tokens in a template string with values from the
 * current data-source row. Used by the replay engine (Phase 09) and by the
 * preview tooltip in the field-binding UI (Phase 09).
 *
 * Rules:
 *   - Token syntax: `{{ColumnName}}` — PascalCase, no spaces, no expressions.
 *   - Whitespace inside the braces is tolerated: `{{ Email }}` works.
 *   - Unknown columns raise — silent fallbacks would corrupt replay data.
 *   - Escaped braces (`\{{Foo}}`) are emitted literally as `{{Foo}}`.
 *
 * Pure: no DOM, no chrome, no async — fully unit-testable.
 */

const TOKEN_PATTERN = /\\?\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export type FieldRow = Readonly<Record<string, string>>;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Resolve every `{{Column}}` token in `template` against `row`.
 * Throws when a referenced column is not present in `row`.
 */
export function resolveFieldReferences(
    template: string,
    row: FieldRow,
): string {
    return template.replace(TOKEN_PATTERN, (match, name: string) => {
        const isEscaped = match.charAt(0) === "\\";
        if (isEscaped) return match.slice(1);

        const hasColumn = Object.prototype.hasOwnProperty.call(row, name);
        if (hasColumn === false) {
            throw new Error(`Field reference {{${name}}} — column missing in row`);
        }

        return row[name] ?? "";
    });
}

/* ------------------------------------------------------------------ */
/*  Static analysis                                                    */
/* ------------------------------------------------------------------ */

/** Lists every distinct column name referenced in a template. */
export function extractReferencedColumns(template: string): ReadonlyArray<string> {
    const found = new Set<string>();
    const pattern = new RegExp(TOKEN_PATTERN.source, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(template)) !== null) {
        const isEscaped = match[0].charAt(0) === "\\";
        if (isEscaped === false) {
            found.add(match[1]!);
        }
    }

    return Array.from(found);
}
