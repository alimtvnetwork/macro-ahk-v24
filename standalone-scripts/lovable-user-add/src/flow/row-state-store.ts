/**
 * User Add — row-state persistence interface.
 *
 * Storage-agnostic. Mirrors Owner Switch's `RowStateStore` so the
 * runtime SQLite adapter can bind both with the same UPDATE pattern
 * against `UserAddRow` (P12 schema).
 *
 * Q10 alignment: log persistence uses the same dependency-inversion
 * pattern via `LogSink` in `log-sink.ts`.
 */

export interface UserAddRowStateUpdate {
    RowIndex: number;
    IsDone: boolean;
    HasError: boolean;
    LastError: string | null;
    StepBRan: boolean;
    CompletedAtUtc: string | null;
}

export interface UserAddRowStateStore {
    update(update: UserAddRowStateUpdate): void;
}
