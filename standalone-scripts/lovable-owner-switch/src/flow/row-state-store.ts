/**
 * Owner Switch — row-state persistence interface.
 *
 * Storage-agnostic. P10 wires the in-memory implementation; the
 * runtime SQLite adapter binds the same interface to actual UPDATE
 * statements against `OwnerSwitchRow`.
 *
 * Q10: log persistence uses the same dependency-inversion pattern via
 * `LogSink`.
 */

export interface RowStateUpdate {
    RowIndex: number;
    IsDone: boolean;
    HasError: boolean;
    LastError: string | null;
    CompletedAtUtc: string | null;
}

export interface RowStateStore {
    update(update: RowStateUpdate): void;
}
