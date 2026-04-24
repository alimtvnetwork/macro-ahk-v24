/**
 * Owner Switch — row-level validation.
 *
 * Runs after `csv-parser` produces typed rows. Emits one `CsvParseError`
 * per offending field; never throws. Caller (UI) renders errors in the
 * file manager preview and blocks task creation if any are present.
 */

import { OwnerSwitchCsvColumn } from "./csv-column";
import { isValidEmail } from "./email-validator";
import type { OwnerSwitchCsvRow, CsvParseError } from "./csv-types";

const pushEmailError = (
    errors: CsvParseError[],
    rowIndex: number,
    column: OwnerSwitchCsvColumn,
    value: string,
): void => {
    errors.push({
        RowIndex: rowIndex,
        Column: column,
        Message: `Invalid email in ${column}: ${value}`,
    });
};

const validateOptionalEmail = (
    errors: CsvParseError[],
    rowIndex: number,
    column: OwnerSwitchCsvColumn,
    value: string | null,
): void => {
    if (value !== null && !isValidEmail(value)) {
        pushEmailError(errors, rowIndex, column, value);
    }
};

export const validateRow = (row: OwnerSwitchCsvRow): ReadonlyArray<CsvParseError> => {
    const errors: CsvParseError[] = [];

    if (!isValidEmail(row.LoginEmail)) {
        pushEmailError(errors, row.RowIndex, OwnerSwitchCsvColumn.LoginEmail, row.LoginEmail);
    }

    if (!isValidEmail(row.OwnerEmail1)) {
        pushEmailError(errors, row.RowIndex, OwnerSwitchCsvColumn.OwnerEmail1, row.OwnerEmail1);
    }

    validateOptionalEmail(errors, row.RowIndex, OwnerSwitchCsvColumn.OwnerEmail2, row.OwnerEmail2);

    return errors;
};
