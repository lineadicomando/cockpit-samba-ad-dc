// Characters AD forbids in sAMAccountName: " / \ [ ] : ; | = , + * ? < >
const SAM_INVALID_CHARS = /["/\\[\]:;|=,+*?<>]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/;

// sAMAccountName is capped at 20 characters for users (and computers);
// the schema allows up to 256 for groups.
const USERNAME_MAX_LENGTH = 20;
const GROUP_NAME_MAX_LENGTH = 256;

export type NameViolation =
    | "empty"
    | "tooLong"
    | "invalidChars"
    | "leadingDash"
    | "trailingPeriod";

// "leadingDash" also protects against the name being parsed as a CLI option.
function validateAccountName(name: string, maxLength: number): NameViolation | null {
    if (!name) return "empty";
    if (name.length > maxLength) return "tooLong";
    if (SAM_INVALID_CHARS.test(name) || CONTROL_CHARS.test(name)) return "invalidChars";
    if (name.startsWith("-")) return "leadingDash";
    if (name.endsWith(".")) return "trailingPeriod";
    return null;
}

// Validates a candidate user sAMAccountName before it reaches samba-tool.
export function validateUsername(name: string): NameViolation | null {
    return validateAccountName(name, USERNAME_MAX_LENGTH);
}

// Validates a candidate group sAMAccountName before it reaches samba-tool.
export function validateGroupName(name: string): NameViolation | null {
    return validateAccountName(name, GROUP_NAME_MAX_LENGTH);
}

// Validates an existing account name passed as a group member (user, computer
// ending in "$", or nested group), so the widest length limit applies.
export function validateMemberName(name: string): NameViolation | null {
    return validateAccountName(name, GROUP_NAME_MAX_LENGTH);
}

// Maps a violation to a translated message. Uses literal t() calls so
// i18next-parser can extract the keys statically.
export function usernameViolationMessage(t: (key: string) => string, violation: NameViolation): string {
    switch (violation) {
        case "empty":          return t("Username is required.");
        case "tooLong":        return t("Username cannot exceed 20 characters.");
        case "invalidChars":   return t("Username contains invalid characters: \" / \\ [ ] : ; | = , + * ? < >");
        case "leadingDash":    return t("Username cannot start with a dash.");
        case "trailingPeriod": return t("Username cannot end with a period.");
    }
}

export function groupNameViolationMessage(t: (key: string) => string, violation: NameViolation): string {
    switch (violation) {
        case "empty":          return t("Group name is required.");
        case "tooLong":        return t("Group name cannot exceed 256 characters.");
        case "invalidChars":   return t("Group name contains invalid characters: \" / \\ [ ] : ; | = , + * ? < >");
        case "leadingDash":    return t("Group name cannot start with a dash.");
        case "trailingPeriod": return t("Group name cannot end with a period.");
    }
}

// Characters not allowed in share names: the smb.conf section syntax and
// Windows path rules forbid most, and "%" would trigger smb.conf variable
// substitution in the path, which is derived from the name.
const SHARE_INVALID_CHARS = /["/\\[\]:;|=,+*?<>%]/;
const SHARE_NAME_MAX_LENGTH = 80;
// Built-in smb.conf sections, the DC shares, the module's home share, and
// names that would resolve to a parent directory in the derived path.
const RESERVED_SHARE_NAMES = new Set([
    "global", "homes", "printers", "print$", "ipc$", "admin$",
    "sysvol", "netlogon", "home", ".", "..",
]);

export type ShareNameViolation =
    | "empty"
    | "tooLong"
    | "invalidChars"
    | "surroundingSpaces"
    | "leadingDash"
    | "reserved";

// Share names are case-insensitive, hence the lowercase reserved-name lookup.
export function validateShareName(name: string): ShareNameViolation | null {
    if (!name) return "empty";
    if (name.length > SHARE_NAME_MAX_LENGTH) return "tooLong";
    if (SHARE_INVALID_CHARS.test(name) || CONTROL_CHARS.test(name)) return "invalidChars";
    if (name !== name.trim()) return "surroundingSpaces";
    if (name.startsWith("-")) return "leadingDash";
    if (RESERVED_SHARE_NAMES.has(name.toLowerCase())) return "reserved";
    return null;
}
