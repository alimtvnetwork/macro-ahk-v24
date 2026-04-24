/**
 * Owner Switch — email format validator.
 *
 * Lightweight RFC-5322-lite check (single `@`, non-empty local + domain
 * with a dot). Avoids heavyweight regex; rejects whitespace and commas.
 */

const FORBIDDEN_CHARS = [" ", ",", ";", "\t", "\r", "\n"];

const hasForbiddenChars = (value: string): boolean => {
    for (const ch of FORBIDDEN_CHARS) {
        if (value.includes(ch)) {
            return true;
        }
    }

    return false;
};

export const isValidEmail = (value: string): boolean => {
    if (hasForbiddenChars(value)) {
        return false;
    }

    const at = value.indexOf("@");

    if (at <= 0 || at !== value.lastIndexOf("@")) {
        return false;
    }

    const domain = value.slice(at + 1);

    return domain.length >= 3 && domain.includes(".");
};
