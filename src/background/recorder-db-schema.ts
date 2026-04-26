/**
 * Marco Extension — Recorder DB Schema
 *
 * Canonical SQL for the per-project Macro Recorder database. This module is
 * the single source of truth for the 9-table recording-steps schema and is
 * applied automatically by `project-db-manager.initProjectDb()` whenever a
 * new project's SQLite file is created.
 *
 * Conventions (see spec/04-database-conventions/01-naming-conventions.md):
 *   - Singular PascalCase table names
 *   - Primary key = `{TableName}Id INTEGER PRIMARY KEY AUTOINCREMENT`
 *   - Foreign keys reuse the exact PK column name
 *   - Booleans stored as TINYINT (0/1) with `Is`/`Has` prefix
 *   - Every Kind/Status column → its own normalised lookup table
 *
 * @see spec/31-macro-recorder/03-data-model.md — Authoritative schema
 * @see spec/31-macro-recorder/04-per-project-db-provisioning.md — Provisioning flow
 */

/* ------------------------------------------------------------------ */
/*  Lookup table DDL + seed rows                                       */
/* ------------------------------------------------------------------ */

const LOOKUP_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS DataSourceKind (
    DataSourceKindId INTEGER PRIMARY KEY AUTOINCREMENT,
    Name             TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS SelectorKind (
    SelectorKindId   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name             TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS StepKind (
    StepKindId       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name             TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS StepStatus (
    StepStatusId     INTEGER PRIMARY KEY AUTOINCREMENT,
    Name             TEXT    NOT NULL UNIQUE
);
`;

const LOOKUP_SEED_DML = `
INSERT OR IGNORE INTO DataSourceKind (DataSourceKindId, Name) VALUES (1, 'Csv'), (2, 'Json');

INSERT OR IGNORE INTO SelectorKind (SelectorKindId, Name)
VALUES (1, 'XPathFull'), (2, 'XPathRelative'), (3, 'Css'), (4, 'Aria');

INSERT OR IGNORE INTO StepKind (StepKindId, Name)
VALUES (1, 'Click'), (2, 'Type'), (3, 'Select'), (4, 'JsInline'), (5, 'Wait');

INSERT OR IGNORE INTO StepStatus (StepStatusId, Name)
VALUES (1, 'Draft'), (2, 'Active'), (3, 'Disabled');
`;

/* ------------------------------------------------------------------ */
/*  Business table DDL                                                 */
/* ------------------------------------------------------------------ */

// Note: Project ownership lives in extension-level storage (see project-handler.ts).
// The per-project DB only stores recorder-scoped rows that all implicitly
// belong to that project — no `Project` table is duplicated here.

const DATA_SOURCE_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS DataSource (
    DataSourceId     INTEGER PRIMARY KEY AUTOINCREMENT,
    DataSourceKindId INTEGER NOT NULL,
    FilePath         TEXT    NOT NULL,
    Columns          TEXT    NOT NULL,
    RowCount         INTEGER NOT NULL DEFAULT 0,
    CreatedAt        TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (DataSourceKindId) REFERENCES DataSourceKind(DataSourceKindId)
);
CREATE INDEX IF NOT EXISTS IxDataSourceKind ON DataSource(DataSourceKindId);
`;

const STEP_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS Step (
    StepId         INTEGER PRIMARY KEY AUTOINCREMENT,
    StepKindId     INTEGER NOT NULL,
    StepStatusId   INTEGER NOT NULL DEFAULT 1,
    OrderIndex     INTEGER NOT NULL,
    VariableName   TEXT    NOT NULL,
    Label          TEXT    NOT NULL,
    InlineJs       TEXT,
    IsBreakpoint   INTEGER NOT NULL DEFAULT 0,
    CapturedAt     TEXT    NOT NULL DEFAULT (datetime('now')),
    UpdatedAt      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (StepKindId)   REFERENCES StepKind(StepKindId),
    FOREIGN KEY (StepStatusId) REFERENCES StepStatus(StepStatusId),
    CHECK (InlineJs IS NULL OR StepKindId = 4)
);
CREATE INDEX IF NOT EXISTS IxStepOrder ON Step(OrderIndex);
CREATE UNIQUE INDEX IF NOT EXISTS IxStepVariableNameUnique ON Step(VariableName);
`;

const SELECTOR_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS Selector (
    SelectorId        INTEGER PRIMARY KEY AUTOINCREMENT,
    StepId            INTEGER NOT NULL,
    SelectorKindId    INTEGER NOT NULL,
    Expression        TEXT    NOT NULL,
    AnchorSelectorId  INTEGER,
    IsPrimary         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (StepId)           REFERENCES Step(StepId)             ON DELETE CASCADE,
    FOREIGN KEY (SelectorKindId)   REFERENCES SelectorKind(SelectorKindId),
    FOREIGN KEY (AnchorSelectorId) REFERENCES Selector(SelectorId),
    CHECK (AnchorSelectorId IS NULL OR SelectorKindId = 2)
);
CREATE INDEX IF NOT EXISTS IxSelectorStep   ON Selector(StepId);
CREATE INDEX IF NOT EXISTS IxSelectorAnchor ON Selector(AnchorSelectorId);
CREATE UNIQUE INDEX IF NOT EXISTS IxSelectorPrimaryPerStep
    ON Selector(StepId) WHERE IsPrimary = 1;
`;

const FIELD_BINDING_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS FieldBinding (
    FieldBindingId  INTEGER PRIMARY KEY AUTOINCREMENT,
    StepId          INTEGER NOT NULL UNIQUE,
    DataSourceId    INTEGER NOT NULL,
    ColumnName      TEXT    NOT NULL,
    CreatedAt       TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (StepId)       REFERENCES Step(StepId)             ON DELETE CASCADE,
    FOREIGN KEY (DataSourceId) REFERENCES DataSource(DataSourceId) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS IxFieldBindingDataSource ON FieldBinding(DataSourceId);
`;

const JS_SNIPPET_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS JsSnippet (
    JsSnippetId  INTEGER PRIMARY KEY AUTOINCREMENT,
    Name         TEXT    NOT NULL UNIQUE,
    Description  TEXT    NOT NULL DEFAULT '',
    Body         TEXT    NOT NULL,
    CreatedAt    TEXT    NOT NULL DEFAULT (datetime('now')),
    UpdatedAt    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS IxJsSnippetName ON JsSnippet(Name);
`;

/* ------------------------------------------------------------------ */
/*  Composite schema                                                   */
/* ------------------------------------------------------------------ */

/**
 * Full recorder schema applied on every project DB init.
 * Idempotent — uses `IF NOT EXISTS` and `INSERT OR IGNORE` everywhere so
 * repeated boots are safe.
 */
export const RECORDER_DB_SCHEMA: string =
    LOOKUP_TABLES_DDL +
    LOOKUP_SEED_DML +
    DATA_SOURCE_TABLE_DDL +
    STEP_TABLE_DDL +
    SELECTOR_TABLE_DDL +
    FIELD_BINDING_TABLE_DDL;

/* ------------------------------------------------------------------ */
/*  Code-side enum mirrors                                             */
/* ------------------------------------------------------------------ */

export const SelectorKindId = {
    XPathFull: 1,
    XPathRelative: 2,
    Css: 3,
    Aria: 4,
} as const;

export const StepKindId = {
    Click: 1,
    Type: 2,
    Select: 3,
    JsInline: 4,
    Wait: 5,
} as const;

export const StepStatusId = {
    Draft: 1,
    Active: 2,
    Disabled: 3,
} as const;

export const DataSourceKindId = {
    Csv: 1,
    Json: 2,
} as const;
