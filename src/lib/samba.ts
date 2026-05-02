import cockpit from "cockpit";
import { createCache } from "./cache.ts";
import type { UserRow, User, GroupRow, Group, ComputerRow, Computer, PasswordPolicy } from "./types.ts";
import {
    parseList, parseLdapShow, firstValue, listValue,
    deriveUserStatus, deriveLastActivity, ridFromSid, dnToName,
    parseDomainPasswordSettings,
} from "./parsers.ts";

const cache = createCache();

const PROTECTED_USERS = new Set(["administrator", "krbtgt", "guest"]);
const PROTECTED_GROUPS = new Set([
    "administrators", "domain admins", "enterprise admins", "schema admins",
    "domain controllers", "users", "guests", "domain users",
    "domain guests", "domain computers",
]);

async function runSamba(args: string[]): Promise<string> {
    return cockpit.spawn(["samba-tool", ...args], { superuser: "require", err: "message" });
}

async function runSambaCached(args: string[], ttlMs: number): Promise<string> {
    const key = args.join("\x1f");
    const cached = cache.get(key, ttlMs);
    if (cached !== null) return cached;
    const output = await runSamba(args);
    cache.set(key, output);
    return output;
}

function cacheKey(...args: string[]): string {
    return args.join("\x1f");
}

// --- Users ---

function buildUser(username: string, raw: string, groups: string[]): User {
    const fields = parseLdapShow(raw);
    const sid = firstValue(fields, "objectSid");
    return {
        username,
        fullName: firstValue(fields, "cn") || firstValue(fields, "name") || username,
        givenName: firstValue(fields, "givenName"),
        surname: firstValue(fields, "sn"),
        email: firstValue(fields, "mail"),
        id: firstValue(fields, "uidNumber") || ridFromSid(sid),
        status: deriveUserStatus(firstValue(fields, "userAccountControl")),
        lastActivity: deriveLastActivity(firstValue(fields, "lastLogonTimestamp") || firstValue(fields, "lastLogon")),
        groups,
        isAdmin: groups.some(g => /domain admins|administrators/i.test(g)),
        isProtected: PROTECTED_USERS.has(username.toLowerCase()) || firstValue(fields, "isCriticalSystemObject").toUpperCase() === "TRUE",
        isStatusLocked: ["500", "502"].includes(ridFromSid(sid)),
        homeDrive: firstValue(fields, "homeDrive"),
        homeDirectory: firstValue(fields, "homeDirectory"),
        detailsLoaded: true as const,
    };
}

export async function listUsersLight(): Promise<UserRow[]> {
    const raw = await runSambaCached(["user", "list"], 30_000);
    return parseList(raw).map(username => ({
        username,
        isProtected: PROTECTED_USERS.has(username.toLowerCase()),
        detailsLoaded: false as const,
    }));
}

export async function getUserDetails(username: string): Promise<User> {
    const [detail, groupsRaw] = await Promise.all([
        runSambaCached(["user", "show", username], 30_000),
        runSambaCached(["user", "getgroups", username], 30_000),
    ]);
    return buildUser(username, detail, parseList(groupsRaw));
}

export async function refreshUser(username: string): Promise<User> {
    cache.invalidate(k =>
        k === cacheKey("user", "show", username) ||
        k === cacheKey("user", "getgroups", username)
    );
    return getUserDetails(username);
}

export async function createUser(username: string, password: string, givenName?: string, surname?: string): Promise<void> {
    const args = ["user", "add", username, password];
    if (givenName) args.push(`--given-name=${givenName}`);
    if (surname) args.push(`--surname=${surname}`);
    await runSamba(args);
    cache.invalidate(k => k.includes("user"));
}

export async function deleteUser(username: string): Promise<void> {
    await runSamba(["user", "delete", username]);
    cache.invalidate(k => k.includes("user"));
}

export async function enableUser(username: string): Promise<void> {
    await runSamba(["user", "enable", username]);
    cache.invalidate(k => k === cacheKey("user", "show", username));
}

export async function disableUser(username: string): Promise<void> {
    await runSamba(["user", "disable", username]);
    cache.invalidate(k => k === cacheKey("user", "show", username));
}

export async function modifyUser(username: string, data: { givenName: string; surname: string; email: string; newUsername?: string }): Promise<void> {
    const args = ["user", "rename", username];
    if (data.givenName) args.push(`--given-name=${data.givenName}`);
    if (data.surname) args.push(`--surname=${data.surname}`);
    if (data.email) args.push(`--mail-address=${data.email}`);
    if (data.newUsername && data.newUsername !== username) args.push(`--samaccountname=${data.newUsername}`);
    if (args.length === 3) return;
    await runSamba(args);
    cache.invalidate(k => k === cacheKey("user", "show", username) || k === cacheKey("user", "list"));
}

export async function setUserPassword(username: string, newPassword: string, mustChange: boolean): Promise<void> {
    const args = ["user", "setpassword", username, `--newpassword=${newPassword}`];
    if (mustChange) args.push("--must-change-at-next-login");
    await runSamba(args);
}

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
    const raw = await runSambaCached(["domain", "passwordsettings", "show"], 300_000);
    return parseDomainPasswordSettings(raw);
}

// --- Groups ---

function buildGroup(name: string, raw: string): Group {
    const fields = parseLdapShow(raw);
    const members = listValue(fields, "member").map(dnToName).filter(Boolean);
    const sid = firstValue(fields, "objectSid");
    const isCritical = firstValue(fields, "isCriticalSystemObject").toUpperCase() === "TRUE";
    return {
        name,
        description: firstValue(fields, "description"),
        id: ridFromSid(sid),
        memberCount: members.length,
        members,
        isCriticalSystemObject: isCritical,
        isProtected: PROTECTED_GROUPS.has(name.toLowerCase()) || isCritical,
        detailsLoaded: true as const,
    };
}

export async function listGroupsLight(): Promise<GroupRow[]> {
    const raw = await runSambaCached(["group", "list"], 60_000);
    return parseList(raw).map(name => ({
        name,
        isProtected: PROTECTED_GROUPS.has(name.toLowerCase()),
        detailsLoaded: false as const,
    }));
}

export async function getGroupDetails(name: string): Promise<Group> {
    const detail = await runSambaCached(["group", "show", name], 60_000);
    return buildGroup(name, detail);
}

export async function refreshGroup(name: string): Promise<Group> {
    cache.invalidate(k => k === cacheKey("group", "show", name));
    return getGroupDetails(name);
}

export async function listGroupMembers(groupName: string): Promise<string[]> {
    const raw = await runSamba(["group", "listmembers", groupName]);
    return parseList(raw);
}

export async function createGroup(name: string): Promise<void> {
    await runSamba(["group", "add", name]);
    cache.invalidate(k => k.includes("group"));
}

export async function deleteGroup(name: string): Promise<void> {
    await runSamba(["group", "delete", name]);
    cache.invalidate(k => k.includes("group"));
}

export async function renameGroup(oldName: string, newName: string): Promise<void> {
    await runSamba(["group", "rename", oldName, newName]);
    cache.invalidate(k => k.includes("group"));
}

export async function addGroupMembers(groupName: string, members: string[]): Promise<void> {
    try {
        await runSamba(["group", "addmembers", groupName, members.join(",")]);
    } catch (e) {
        // already member via primaryGroupID — not an error
        if (String(e).includes("primaryGroupID")) return;
        throw e;
    }
    cache.invalidate(k => k === cacheKey("group", "show", groupName));
}

export async function removeGroupMembers(groupName: string, members: string[]): Promise<void> {
    await runSamba(["group", "removemembers", groupName, members.join(",")]);
    cache.invalidate(k => k === cacheKey("group", "show", groupName));
}

// --- Computers ---

function buildComputer(name: string, raw: string): Computer {
    const fields = parseLdapShow(raw);
    const sid = firstValue(fields, "objectSid");
    return {
        name,
        dn: firstValue(fields, "dn"),
        id: ridFromSid(sid),
        os: firstValue(fields, "operatingSystem") || "-",
        lastLogon: deriveLastActivity(firstValue(fields, "lastLogonTimestamp") || firstValue(fields, "lastLogon")),
        detailsLoaded: true as const,
    };
}

export async function listComputersLight(): Promise<ComputerRow[]> {
    const raw = await runSambaCached(["computer", "list"], 60_000);
    return parseList(raw).map(name => ({ name, detailsLoaded: false as const }));
}

export async function getComputerDetails(name: string): Promise<Computer> {
    const detail = await runSambaCached(["computer", "show", name], 60_000);
    return buildComputer(name, detail);
}

export async function deleteComputer(name: string): Promise<void> {
    await runSamba(["computer", "delete", name]);
    cache.invalidate(k => k.includes("computer"));
}

// --- Home directories ---

async function getDCNetbiosName(): Promise<string> {
    const raw = await runSambaCached(["domain", "info", "127.0.0.1"], 3_600_000);
    const match = raw.match(/DC netbios name\s*:\s*(\S+)/i);
    if (!match) throw new Error("Cannot determine DC NetBIOS name from domain info");
    return match[1];
}

async function getUserDN(username: string): Promise<string> {
    const raw = await runSambaCached(["user", "show", username], 30_000);
    const fields = parseLdapShow(raw);
    const dn = firstValue(fields, "dn");
    if (!dn) throw new Error(`Cannot find DN for user ${username}`);
    return dn;
}

async function setHomeDirAttributes(dn: string, homeDrive: string, homeDirectory: string): Promise<void> {
    const ldif = [
        `dn: ${dn}`,
        `changetype: modify`,
        `replace: homeDrive`,
        `homeDrive: ${homeDrive}`,
        `-`,
        `replace: homeDirectory`,
        `homeDirectory: ${homeDirectory}`,
        `-`,
        ``,
    ].join("\n");
    await cockpit.spawn(
        ["ldbmodify", "-H", "/var/lib/samba/private/sam.ldb"],
        { superuser: "require", err: "message" },
    ).input(ldif);
}

async function ensureHomeShare(): Promise<void> {
    try {
        await cockpit.spawn(["net", "conf", "showshare", "home"], { superuser: "require", err: "message" });
        return;
    } catch {
        // share does not exist yet
    }
    await cockpit.spawn(["net", "conf", "addshare", "home", "/home/samba", "writeable=y", "guest_ok=n"],
        { superuser: "require", err: "message" });
    for (const [param, value] of [
        ["browseable", "no"],
        ["create mask", "0700"],
        ["directory mask", "0700"],
    ] as const) {
        await cockpit.spawn(["net", "conf", "setparm", "home", param, value],
            { superuser: "require", err: "message" });
    }
}

export async function provisionHomeDir(username: string): Promise<void> {
    const [netbiosName, dn] = await Promise.all([getDCNetbiosName(), getUserDN(username)]);
    const homeDir = `/home/samba/${username}`;
    const uncPath = `\\\\${netbiosName}\\home\\${username}`;

    await cockpit.spawn(
        ["bash", "-c", `mkdir -p "${homeDir}" && chmod 700 "${homeDir}" && chown "${username}":"${username}" "${homeDir}"`],
        { superuser: "require", err: "message" },
    );
    await setHomeDirAttributes(dn, "H:", uncPath);
    await ensureHomeShare();
    cache.invalidate(k => k === cacheKey("user", "show", username));
}
