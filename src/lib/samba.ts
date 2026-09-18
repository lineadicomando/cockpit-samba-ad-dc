import cockpit from "cockpit";
import { cache, cacheKey, checkName, runAsRoot, getDCNetbiosName, HOMES_DIR } from "./exec.ts";
import type { User, Group, Computer, PasswordPolicy, LdapFields } from "./types.ts";
import {
    parseList, parseLdapShow, parseLdapMulti, firstValue, listValue,
    deriveUserStatus, deriveLastActivity, ridFromSid, dnToName,
    parseDomainPasswordSettings, parseGroupType,
} from "./parsers.ts";

const LDB_PATH = "/var/lib/samba/private/sam.ldb";
const LDB_KEY_USERS = "ldb:users";
const LDB_KEY_GROUPS = "ldb:groups";
const LDB_KEY_COMPUTERS = "ldb:computers";
const LDB_KEY_PRIMARY_COUNTS = "ldb:primary-counts";

const PROTECTED_USERS = new Set(["administrator", "krbtgt", "guest"]);
const PROTECTED_GROUPS = new Set([
    "administrators", "domain admins", "enterprise admins", "schema admins",
    "domain controllers", "users", "guests", "domain users",
    "domain guests", "domain computers",
    "dnsadmins", "dnsupdateproxy",
]);

async function runSamba(args: string[]): Promise<string> {
    return runAsRoot(["samba-tool", ...args]);
}

// Feeds secrets via stdin (samba-tool's getpass() falls back to stdin without a
// tty) so they never appear in the process argv, readable via /proc/<pid>/cmdline.
async function runSambaWithInput(args: string[], input: string): Promise<string> {
    try {
        return await cockpit.spawn(["samba-tool", ...args], { superuser: "require", err: "message" }).input(input);
    } catch (e) {
        // getpass() prints tty warnings and prompts to stderr before the real
        // error — strip that noise so the user sees only the ERROR line.
        const msg = e instanceof Error ? e.message : String(e);
        const idx = msg.indexOf("ERROR");
        throw idx > 0 ? new Error(msg.slice(idx)) : e;
    }
}

async function runSambaCached(args: string[], ttlMs: number): Promise<string> {
    const key = args.join("\x1f");
    const cached = cache.get(key, ttlMs);
    if (cached !== null) return cached;
    const output = await runSamba(args);
    cache.set(key, output);
    return output;
}

async function runLdb(args: string[]): Promise<string> {
    return runAsRoot(["ldbsearch", ...args]);
}

async function runLdbCached(key: string, args: string[], ttlMs: number): Promise<string> {
    const cached = cache.get(key, ttlMs);
    if (cached !== null) return cached;
    const output = await runLdb(args);
    cache.set(key, output);
    return output;
}

// Read from the local sam.ldb rootDSE rather than "samba-tool domain info
// 127.0.0.1", which is a CLDAP network query and fails when Samba does not
// listen on loopback (e.g. "bind interfaces only").
async function getBaseDN(): Promise<string> {
    const raw = await runLdbCached("ldb:rootdse", ["-H", LDB_PATH, "-s", "base", "-b", "", "defaultNamingContext"], 3_600_000);
    const dn = parseLdapMulti(raw).map(f => firstValue(f, "defaultNamingContext")).find(Boolean);
    if (!dn) throw new Error("Cannot determine the domain naming context from sam.ldb");
    return dn;
}

function loadGroupsRaw(baseDN: string): Promise<string> {
    return runLdbCached(LDB_KEY_GROUPS, [
        "-H", LDB_PATH, "-b", baseDN,
        "(objectClass=group)",
        "sAMAccountName", "cn", "description", "member",
        "objectSid", "isCriticalSystemObject", "groupType",
    ], 60_000);
}

// Maps a group RID to its name, to resolve users' primaryGroupID.
function buildRidToGroup(groupsRaw: string): Map<string, string> {
    return new Map(
        parseLdapMulti(groupsRaw)
            .filter(f => firstValue(f, "sAMAccountName") !== "")
            .map(f => [ridFromSid(firstValue(f, "objectSid")), firstValue(f, "sAMAccountName")] as [string, string])
    );
}

// --- ldbsearch bulk loaders ---

// directGroups: group names from memberOf (bulk ldbsearch) or from
// "samba-tool user getgroups" (detail view).
function buildUser(fields: LdapFields, directGroups: string[], ridToGroup: Map<string, string>, username = firstValue(fields, "sAMAccountName")): User {
    const sid = firstValue(fields, "objectSid");
    const primaryGroup = ridToGroup.get(firstValue(fields, "primaryGroupID")) ?? "";
    // primaryGroupID is not reflected in memberOf — add it to ensure consistency
    const groups = primaryGroup && !directGroups.includes(primaryGroup)
        ? [...directGroups, primaryGroup]
        : directGroups;
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
        primaryGroup,
        isAdmin: groups.some(g => /domain admins|administrators/i.test(g)),
        isProtected: PROTECTED_USERS.has(username.toLowerCase()) || firstValue(fields, "isCriticalSystemObject").toUpperCase() === "TRUE",
        isStatusLocked: ["500", "502"].includes(ridFromSid(sid)),
        homeDrive: firstValue(fields, "homeDrive"),
        homeDirectory: firstValue(fields, "homeDirectory"),
    };
}

// primaryCounts: users per primary group RID (not reflected in "member").
function buildGroup(fields: LdapFields, primaryCounts?: Map<string, number>, name = firstValue(fields, "sAMAccountName")): Group {
    const members = listValue(fields, "member").map(dnToName).filter(Boolean);
    const sid = firstValue(fields, "objectSid");
    const rid = ridFromSid(sid);
    const isCritical = firstValue(fields, "isCriticalSystemObject").toUpperCase() === "TRUE";
    const primaryCount = primaryCounts?.get(rid) ?? 0;
    return {
        name,
        description: firstValue(fields, "description"),
        id: rid,
        memberCount: members.length + primaryCount,
        members,
        isCriticalSystemObject: isCritical,
        isProtected: PROTECTED_GROUPS.has(name.toLowerCase()) || isCritical,
        groupType: parseGroupType(firstValue(fields, "groupType")),
    };
}

function buildComputerFromFields(fields: LdapFields): Computer {
    const rawName = firstValue(fields, "sAMAccountName");
    const name = rawName.replace(/\$$/, ""); // strip trailing $ from computer account names
    const sid = firstValue(fields, "objectSid");
    return {
        name,
        dn: firstValue(fields, "dn"),
        id: ridFromSid(sid),
        os: firstValue(fields, "operatingSystem") || "-",
        lastLogon: deriveLastActivity(firstValue(fields, "lastLogonTimestamp") || firstValue(fields, "lastLogon")),
    };
}

export async function listUsers(): Promise<User[]> {
    const baseDN = await getBaseDN();
    const [usersRaw, groupsRaw] = await Promise.all([
        runLdbCached(LDB_KEY_USERS, [
            "-H", LDB_PATH, "-b", baseDN,
            "(&(objectClass=user)(!(objectClass=computer)))",
            "sAMAccountName", "cn", "givenName", "sn", "mail", "uidNumber",
            "userAccountControl", "lastLogon", "lastLogonTimestamp",
            "objectSid", "memberOf", "isCriticalSystemObject",
            "homeDrive", "homeDirectory", "primaryGroupID",
        ], 30_000),
        loadGroupsRaw(baseDN),
    ]);
    const ridToGroup = buildRidToGroup(groupsRaw);
    return parseLdapMulti(usersRaw)
        .filter(f => firstValue(f, "sAMAccountName") !== "")
        .map(f => buildUser(f, listValue(f, "memberOf").map(dnToName).filter(Boolean), ridToGroup));
}

export async function listGroups(): Promise<Group[]> {
    const baseDN = await getBaseDN();
    const [groupsRaw, primaryRaw] = await Promise.all([
        loadGroupsRaw(baseDN),
        runLdbCached(LDB_KEY_PRIMARY_COUNTS, [
            "-H", LDB_PATH, "-b", baseDN,
            "(&(objectClass=user)(!(objectClass=computer)))",
            "primaryGroupID",
        ], 30_000),
    ]);
    const primaryCounts = new Map<string, number>();
    for (const f of parseLdapMulti(primaryRaw)) {
        const rid = firstValue(f, "primaryGroupID");
        if (rid) primaryCounts.set(rid, (primaryCounts.get(rid) ?? 0) + 1);
    }
    return parseLdapMulti(groupsRaw)
        .filter(f => firstValue(f, "sAMAccountName") !== "")
        .map(f => buildGroup(f, primaryCounts));
}

export async function listComputers(): Promise<Computer[]> {
    const baseDN = await getBaseDN();
    const raw = await runLdbCached(LDB_KEY_COMPUTERS, [
        "-H", LDB_PATH, "-b", baseDN,
        "(objectClass=computer)",
        "sAMAccountName", "cn", "operatingSystem", "operatingSystemVersion",
        "objectSid", "dNSHostName", "lastLogon", "lastLogonTimestamp",
    ], 60_000);
    return parseLdapMulti(raw)
        .filter(f => firstValue(f, "sAMAccountName") !== "")
        .map(buildComputerFromFields);
}

// --- Users ---

export async function getUserDetails(username: string): Promise<User> {
    checkName(username);
    const baseDN = await getBaseDN();
    const [detail, groupsRaw, groupsForMap] = await Promise.all([
        runSambaCached(["user", "show", username], 30_000),
        runSambaCached(["user", "getgroups", username], 30_000),
        loadGroupsRaw(baseDN),
    ]);
    return buildUser(parseLdapShow(detail), parseList(groupsRaw), buildRidToGroup(groupsForMap), username);
}

export async function refreshUser(username: string): Promise<User> {
    cache.invalidate(k =>
        k === cacheKey("user", "show", username) ||
        k === cacheKey("user", "getgroups", username) ||
        k === LDB_KEY_USERS ||
        k === LDB_KEY_PRIMARY_COUNTS
    );
    return getUserDetails(username);
}

export async function createUser(username: string, password: string, givenName?: string, surname?: string): Promise<void> {
    checkName(username);
    const args = ["user", "add", username];
    if (givenName) args.push(`--given-name=${givenName}`);
    if (surname) args.push(`--surname=${surname}`);
    // samba-tool prompts "New Password:" / "Retype Password:" when omitted from argv
    await runSambaWithInput(args, `${password}\n${password}\n`);
    cache.invalidate(k => k.startsWith(cacheKey("user", "")) || k === LDB_KEY_USERS || k === LDB_KEY_PRIMARY_COUNTS);
}

export async function deleteUser(username: string): Promise<void> {
    checkName(username);
    await runSamba(["user", "delete", username]);
    cache.invalidate(k => k.startsWith(cacheKey("user", "")) || k === LDB_KEY_USERS || k === LDB_KEY_PRIMARY_COUNTS);
}

export async function enableUser(username: string): Promise<void> {
    checkName(username);
    await runSamba(["user", "enable", username]);
    cache.invalidate(k =>
        k === cacheKey("user", "show", username) ||
        k === cacheKey("user", "getgroups", username) ||
        k === LDB_KEY_USERS
    );
}

export async function disableUser(username: string): Promise<void> {
    checkName(username);
    await runSamba(["user", "disable", username]);
    cache.invalidate(k =>
        k === cacheKey("user", "show", username) ||
        k === cacheKey("user", "getgroups", username) ||
        k === LDB_KEY_USERS
    );
}

export async function modifyUser(username: string, data: { givenName?: string; surname?: string; email?: string; newUsername?: string }): Promise<void> {
    checkName(username);
    const args = ["user", "rename", username];
    if (data.givenName !== undefined) args.push(`--given-name=${data.givenName}`);
    if (data.surname !== undefined) args.push(`--surname=${data.surname}`);
    if (data.email !== undefined) args.push(`--mail-address=${data.email}`);
    if (data.newUsername && data.newUsername !== username) args.push(`--samaccountname=${data.newUsername}`);
    if (args.length === 3) return;
    await runSamba(args);
    cache.invalidate(k =>
        k === cacheKey("user", "show", username) ||
        k === cacheKey("user", "getgroups", username) ||
        k === LDB_KEY_USERS
    );
}

export async function setUserPassword(username: string, newPassword: string, mustChange: boolean): Promise<void> {
    checkName(username);
    const args = ["user", "setpassword", username];
    if (mustChange) args.push("--must-change-at-next-login");
    // samba-tool prompts "New Password:" / "Retype Password:" when omitted from argv
    await runSambaWithInput(args, `${newPassword}\n${newPassword}\n`);
}

export async function setPrimaryGroup(username: string, groupName: string): Promise<void> {
    checkName(username, groupName);
    await runSamba(["user", "setprimarygroup", username, groupName]);
    cache.invalidate(k =>
        k === cacheKey("user", "show", username) ||
        k === cacheKey("user", "getgroups", username) ||
        k === LDB_KEY_USERS ||
        k === LDB_KEY_PRIMARY_COUNTS
    );
}

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
    const raw = await runSambaCached(["domain", "passwordsettings", "show"], 300_000);
    return parseDomainPasswordSettings(raw);
}

// --- Groups ---

export async function getGroupDetails(name: string): Promise<Group> {
    checkName(name);
    const baseDN = await getBaseDN();
    const detail = await runSambaCached(["group", "show", name], 60_000);
    const g = buildGroup(parseLdapShow(detail), undefined, name);
    // Count users whose primary group is this group (not reflected in the member attribute)
    const primaryRaw = await runLdb(["-H", LDB_PATH, "-b", baseDN,
        `(&(objectClass=user)(!(objectClass=computer))(primaryGroupID=${g.id}))`,
        "dn",
    ]);
    const primaryCount = parseLdapMulti(primaryRaw).filter(f => Object.keys(f).length > 0).length;
    return { ...g, memberCount: g.memberCount + primaryCount };
}

export async function refreshGroup(name: string): Promise<Group> {
    cache.invalidate(k =>
        k === cacheKey("group", "show", name) ||
        k === LDB_KEY_GROUPS ||
        k === LDB_KEY_PRIMARY_COUNTS ||
        k === LDB_KEY_USERS
    );
    return getGroupDetails(name);
}

export async function listGroupMembers(groupName: string): Promise<string[]> {
    checkName(groupName);
    const raw = await runSamba(["group", "listmembers", groupName]);
    return parseList(raw);
}

// Group mutations also invalidate cached "user getgroups" results, since
// membership lists reference groups by name.
function invalidateGroupCaches(): void {
    cache.invalidate(k =>
        k.startsWith(cacheKey("group", "")) ||
        k.startsWith(cacheKey("user", "getgroups", "")) ||
        k === LDB_KEY_GROUPS ||
        k === LDB_KEY_USERS
    );
}

export async function createGroup(name: string): Promise<void> {
    checkName(name);
    await runSamba(["group", "add", name]);
    invalidateGroupCaches();
}

export async function deleteGroup(name: string): Promise<void> {
    checkName(name);
    await runSamba(["group", "delete", name]);
    invalidateGroupCaches();
}

export async function renameGroup(oldName: string, newName: string): Promise<void> {
    checkName(oldName, newName);
    await runSamba(["group", "rename", oldName, newName]);
    invalidateGroupCaches();
}

export async function addGroupMembers(groupName: string, members: string[]): Promise<void> {
    checkName(groupName, ...members);
    try {
        await runSamba(["group", "addmembers", groupName, members.join(",")]);
    } catch (e) {
        // Samba raises this when the user's primary group is already the target group — not a real error.
        if (!String(e).includes("primaryGroupID")) throw e;
    }
    cache.invalidate(k =>
        k === cacheKey("group", "show", groupName) ||
        k === LDB_KEY_GROUPS ||
        k === LDB_KEY_USERS
    );
}

export async function removeGroupMembers(groupName: string, members: string[]): Promise<void> {
    checkName(groupName, ...members);
    await runSamba(["group", "removemembers", groupName, members.join(",")]);
    cache.invalidate(k =>
        k === cacheKey("group", "show", groupName) ||
        k === LDB_KEY_GROUPS ||
        k === LDB_KEY_USERS
    );
}

// --- Computers ---

export async function deleteComputer(name: string): Promise<void> {
    checkName(name);
    await runSamba(["computer", "delete", name]);
    cache.invalidate(k => k.startsWith(cacheKey("computer", "")) || k === LDB_KEY_COMPUTERS);
}

// --- Home directories ---

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

// Shared across concurrent callers: bulk provisioning runs provisionHomeDir in
// parallel, and without this every call would see the share missing and race
// on "net conf addshare" (all but one failing with "share already exists").
let homeSharePromise: Promise<void> | null = null;

function ensureHomeShare(): Promise<void> {
    if (!homeSharePromise) {
        homeSharePromise = createHomeShareIfMissing().catch(e => {
            homeSharePromise = null; // allow a retry after a failure
            throw e;
        });
    }
    return homeSharePromise;
}

async function createHomeShareIfMissing(): Promise<void> {
    let currentPath: string | null = null;
    try {
        currentPath = (await runAsRoot(["net", "conf", "getparm", "home", "path"])).trim();
    } catch {
        // share does not exist yet
    }
    if (currentPath === HOMES_DIR) return;
    if (currentPath !== null) {
        // Created by an older version with another base directory
        await runAsRoot(["net", "conf", "setparm", "home", "path", HOMES_DIR]);
        return;
    }
    await runAsRoot(["net", "conf", "addshare", "home", HOMES_DIR, "writeable=y", "guest_ok=n"]);
    for (const [param, value] of [
        ["browseable", "no"],
        ["create mask", "0700"],
        ["directory mask", "0700"],
    ] as const) {
        await runAsRoot(["net", "conf", "setparm", "home", param, value]);
    }
}

export async function provisionHomeDir(username: string): Promise<void> {
    checkName(username);
    const [netbiosName, dn] = await Promise.all([getDCNetbiosName(), getUserDN(username)]);
    const homeDir = `${HOMES_DIR}/${username}`;
    const uncPath = `\\\\${netbiosName}\\home\\${username}`;

    await runAsRoot(["mkdir", "-p", homeDir]);
    await runAsRoot(["chmod", "700", homeDir]);
    // "user:" sets the group to the user's login group; unlike "user:user" it
    // does not depend on winbind also mapping the user SID as a group.
    await runAsRoot(["chown", `${username}:`, homeDir]);
    await setHomeDirAttributes(dn, "H:", uncPath);
    await ensureHomeShare();
    cache.invalidate(k =>
        k === cacheKey("user", "show", username) ||
        k === LDB_KEY_USERS
    );
}
