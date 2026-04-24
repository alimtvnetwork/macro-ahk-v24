/**
 * User Add — row-level validation.
 *
 * Validates `MemberEmail` format and `WorkspaceUrl` shape (must be a
 * Lovable URL). Role validity is already enforced by the normalizer
 * during row build (errors there are reported as parse errors). Never
 * throws.
 */

import { UserAddCsvColumn } from "./csv-column";
import { isValidEmail } from "./email-validator";
import type { UserAddCsvRow, CsvParseError } from "./csv-types";

const LOVABLE_HOST = "lovable.dev";

const isValidWorkspaceUrl = (value: string): boolean => {
    try {
        const parsed = new URL(value);

        return parsed.host === LOVABLE_HOST || parsed.host.endsWith(`.${LOVABLE_HOST}`);
    } catch {
        return false;
    }
};

export const validateRow = (row: UserAddCsvRow): ReadonlyArray<CsvParseError> => {
    const errors: CsvParseError[] = [];

    if (!isValidEmail(row.MemberEmail)) {
        errors.push({
            RowIndex: row.RowIndex, Column: UserAddCsvColumn.MemberEmail,
            Message: `Invalid email in MemberEmail: ${row.MemberEmail}`,
        });
    }

    if (!isValidWorkspaceUrl(row.WorkspaceUrl)) {
        errors.push({
            RowIndex: row.RowIndex, Column: UserAddCsvColumn.WorkspaceUrl,
            Message: `Invalid Lovable workspace URL: ${row.WorkspaceUrl}`,
        });
    }

    return errors;
};
