import type { LdapFields } from "./types.ts";

export function parseList(raw: string): string[] {
    return raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

export function parseLdapShow(raw: string): LdapFields {
    const fields: LdapFields = {};
    for (const line of raw.split("\n")) {
        const sep = line.indexOf(": ");
        if (sep <= 0) continue;
        const key = line.slice(0, sep).trim();
        const val = line.slice(sep + 2).trim();
        const existing = fields[key];
        if (existing !== undefined) {
            fields[key] = Array.isArray(existing) ? [...existing, val] : [existing, val];
        } else {
            fields[key] = val;
        }
    }
    return fields;
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
    const ticks = parseInt(ticksRaw, 10);
    if (isNaN(ticks) || ticks <= 0) return "Never";
    const unixMs = Math.floor(ticks / 10000 - 11644473600000);
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
            if (isFinite(n) && n > 0) minLength = n;
        }
        if (key === "password history length") {
            const n = parseInt(val, 10);
            if (isFinite(n) && n >= 0) historyLength = n;
        }
    }
    return { complexityRequired, minLength, historyLength };
}
