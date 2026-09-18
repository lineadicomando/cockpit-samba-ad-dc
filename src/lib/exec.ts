import cockpit from "cockpit";
import { createCache } from "./cache.ts";

// Shared by samba.ts and shares.ts, so mutations in one module can invalidate
// entries cached by the other.
export const cache = createCache();

export function cacheKey(...args: string[]): string {
    return args.join("\x1f");
}

// Everything the module creates on disk lives under one base directory.
export const SAMBA_BASE = "/srv/samba";
export const HOMES_DIR = `${SAMBA_BASE}/home`;
export const SHARES_DIR = `${SAMBA_BASE}/shares`;

// Defense in depth for names reaching samba-tool/chown as positional args:
// a leading "-" would be parsed as an option. The UI validates new names, but
// existing directory objects and future callers go through here too.
export function checkName(...names: string[]): void {
    for (const name of names) {
        if (!name || name.startsWith("-")) throw new Error(`Invalid account name: "${name}"`);
    }
}

export function runAsRoot(args: string[]): Promise<string> {
    return cockpit.spawn(args, { superuser: "require", err: "message" });
}

// Read from the local config rather than "samba-tool domain info", which is a
// CLDAP network query and fails when Samba does not listen on loopback.
const smbConfParams = new Map<string, string>();

async function getSmbConfParam(name: string): Promise<string> {
    const known = smbConfParams.get(name);
    if (known) return known;
    const value = (await runAsRoot(["testparm", "-s", `--parameter-name=${name}`])).trim();
    if (!value) throw new Error(`Cannot determine "${name}" from smb.conf`);
    smbConfParams.set(name, value);
    return value;
}

export function getDCNetbiosName(): Promise<string> {
    return getSmbConfParam("netbios name");
}

// NetBIOS domain name, the prefix winbind expects in "DOMAIN\name".
export function getWorkgroup(): Promise<string> {
    return getSmbConfParam("workgroup");
}
