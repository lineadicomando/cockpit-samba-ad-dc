import type { LdapFields } from "./types.ts";

export function parseList(raw: string): string[] {
    return raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

export function parseLdapShow(raw: string): LdapFields {
    const fields: LdapFields = {};
    for (const line of raw.split("\n")) {
        const singleSep = line.indexOf(": ");
        const doubleSep = line.indexOf(":: ");
        // Prefer :: over : when it appears first (base64-encoded values)
        const useDouble = doubleSep >= 0 && (singleSep < 0 || doubleSep < singleSep);
        const sep = useDouble ? doubleSep : singleSep;
        if (sep <= 0) continue;
        const key = line.slice(0, sep).trim();
        const val = line.slice(sep + (useDouble ? 3 : 2)).trim();
        const existing = fields[key];
        if (existing !== undefined) {
            fields[key] = Array.isArray(existing) ? [...existing, val] : [existing, val];
        } else {
            fields[key] = val;
        }
    }
    return fields;
}

export function parseLdapMulti(raw: string): LdapFields[] {
    return raw
        .split(/\n\s*\n/)
        .map(block => {
            const cleaned = block
                .split("\n")
                .filter(line => !line.trim().startsWith("#"))
                .join("\n")
                .trim();
            return cleaned;
        })
        .filter(block => block.length > 0)
        .map(block => parseLdapShow(block));
}

export function firstValue(fields: LdapFields, key: string): string {
    const val = fields[key];
    return Array.isArray(val) ? (val[0] ?? "") : (val ?? "");
}

export function listValue(fields: LdapFields, key: string): string[] {
    const val = fields[key];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
}

export function deriveUserStatus(uacRaw: string): "Active" | "Disabled" | "Unknown" {
    const uac = parseInt(uacRaw, 10);
    if (isNaN(uac)) return "Unknown";
    return (uac & 2) === 2 ? "Disabled" : "Active";
}

export function deriveLastActivity(ticksRaw: string): string {
    // Windows FILETIME values exceed Number.MAX_SAFE_INTEGER; use BigInt to avoid precision loss.
    if (!ticksRaw || !/^\d+$/.test(ticksRaw)) return "Never";
    const ticks = BigInt(ticksRaw);
    if (ticks <= 0n) return "Never";
    const unixMs = Number(ticks / 10000n) - 11644473600000;
    if (unixMs <= 0) return "Never";
    const date = new Date(unixMs);
    if (isNaN(date.getTime())) return "Never";
    return date.toLocaleDateString();
}

export function ridFromSid(sid: string): string {
    if (!sid) return "-";
    const parts = sid.split("-");
    return parts[parts.length - 1] ?? "-";
}

export function dnToName(dn: string): string {
    const first = dn.split(",")[0] ?? "";
    return first.replace(/^CN=/i, "").trim();
}

export function parseGroupType(raw: string): "Security" | "Distribution" {
    const val = parseInt(raw, 10);
    if (isNaN(val)) return "Security"; // default AD per nuovi gruppi
    return val < 0 ? "Security" : "Distribution";
}

export function parseDomainPasswordSettings(raw: string): { complexityRequired: boolean; minLength: number; historyLength: number } {
    let complexityRequired = true;
    let minLength = 8;
    let historyLength = 0;
    for (const line of raw.split("\n")) {
        const sep = line.indexOf(": ");
        if (sep <= 0) continue;
        const key = line.slice(0, sep).trim().toLowerCase();
        const val = line.slice(sep + 2).trim().toLowerCase();
        if (key === "password complexity") complexityRequired = val === "on";
        if (key === "minimum password length") {
            const n = parseInt(val, 10);
            // 0 is valid: it means the domain enforces no minimum
            if (isFinite(n) && n >= 0) minLength = n;
        }
        if (key === "password history length") {
            const n = parseInt(val, 10);
            if (isFinite(n) && n >= 0) historyLength = n;
        }
    }
    return { complexityRequired, minLength, historyLength };
}
