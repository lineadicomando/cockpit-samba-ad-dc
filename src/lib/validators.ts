// Characters AD forbids in sAMAccountName: " / \ [ ] : ; | = , + * ? < >
const SAM_INVALID_CHARS = /["/\\[\]:;|=,+*?<>]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/;

export type UsernameViolation =
    | "empty"
    | "tooLong"
    | "invalidChars"
    | "leadingDash"
    | "trailingPeriod";

// Validates a candidate sAMAccountName before it reaches samba-tool.
// "leadingDash" also protects against the name being parsed as a CLI option.
export function validateUsername(name: string): UsernameViolation | null {
    if (!name) return "empty";
    if (name.length > 20) return "tooLong";
    if (SAM_INVALID_CHARS.test(name) || CONTROL_CHARS.test(name)) return "invalidChars";
    if (name.startsWith("-")) return "leadingDash";
    if (name.endsWith(".")) return "trailingPeriod";
    return null;
}

// Maps a violation to a translated message. Uses literal t() calls so
// i18next-parser can extract the keys statically.
export function usernameViolationMessage(t: (key: string) => string, violation: UsernameViolation): string {
    switch (violation) {
        case "empty":          return t("Username is required.");
        case "tooLong":        return t("Username cannot exceed 20 characters.");
        case "invalidChars":   return t("Username contains invalid characters: \" / \\ [ ] : ; | = , + * ? < >");
        case "leadingDash":    return t("Username cannot start with a dash.");
        case "trailingPeriod": return t("Username cannot end with a period.");
    }
}
