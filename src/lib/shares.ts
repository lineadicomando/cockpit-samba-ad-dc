import { cache, checkName, runAsRoot, getWorkgroup, SHARES_DIR } from "./exec.ts";
import { parseNetConf, parseSmbUserList, parseSmbBool } from "./parsers.ts";
import { validateShareName } from "./validators.ts";
import type { SharedFolder, ShareAccess } from "./types.ts";

const NET_CONF_KEY = "net:conf";

export interface ShareData {
    comment: string;
    browseable: boolean;
    access: ShareAccess[];
}

// Registry shares live in "net conf"; only those under SHARES_DIR are
// managed here, so the module never runs a recursive setfacl or rm on a path
// it did not create (e.g. the home share or hand-made shares).
function isManagedPath(path: string): boolean {
    return path.startsWith(`${SHARES_DIR}/`) && !path.slice(SHARES_DIR.length).split("/").includes("..");
}

async function loadNetConf(): Promise<Map<string, Record<string, string>>> {
    let raw = cache.get(NET_CONF_KEY, 30_000);
    if (raw === null) {
        raw = await runAsRoot(["net", "conf", "list"]);
        cache.set(NET_CONF_KEY, raw);
    }
    return parseNetConf(raw);
}

function principalKey(p: { name: string; kind: string }): string {
    return `${p.kind}:${p.name.toLowerCase()}`;
}

function buildShare(name: string, params: Record<string, string>): SharedFolder {
    const readOnly = params["read only"] !== undefined
        ? parseSmbBool(params["read only"], true)
        : !parseSmbBool(params["writeable"] ?? params["writable"] ?? params["write ok"], false);
    const readList = new Set(parseSmbUserList(params["read list"] ?? "").map(principalKey));
    const writeList = new Set(parseSmbUserList(params["write list"] ?? "").map(principalKey));
    const access: ShareAccess[] = parseSmbUserList(params["valid users"] ?? "").map(p => {
        const key = principalKey(p);
        const canWrite = !readList.has(key) && (!readOnly || writeList.has(key));
        return { ...p, level: canWrite ? "write" : "read" };
    });
    return {
        name,
        path: params["path"] ?? "",
        comment: params["comment"] ?? "",
        browseable: parseSmbBool(params["browseable"] ?? params["browsable"], true),
        access,
    };
}

export async function listShares(): Promise<SharedFolder[]> {
    const conf = await loadNetConf();
    return [...conf.entries()]
        .filter(([, params]) => isManagedPath(params["path"] ?? ""))
        .map(([name, params]) => buildShare(name, params));
}

async function findShare(name: string): Promise<SharedFolder> {
    const share = (await listShares()).find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!share) throw new Error(`Shared folder "${name}" not found`);
    return share;
}

function formatUserList(entries: ShareAccess[], workgroup: string): string {
    return entries.map(e => `${e.kind === "group" ? "@" : ""}"${workgroup}\\${e.name}"`).join(" ");
}

// getent resolves both users and groups here: on a DC, winbind maps each
// SID as both a uid and a gid (ID_TYPE_BOTH).
async function principalExists(workgroup: string, name: string): Promise<boolean> {
    try {
        await runAsRoot(["getent", "passwd", `${workgroup}\\${name}`]);
        return true;
    } catch {
        return false;
    }
}

// Rewrites the POSIX ACL of the whole tree: the same model as the home
// directories (no NT ACL is written; acl_xattr derives it from the POSIX ACL
// and notices when that changes).
async function applyAcl(path: string, oldAccess: ShareAccess[], newAccess: ShareAccess[]): Promise<void> {
    const workgroup = await getWorkgroup();
    const names = [...new Set([...oldAccess, ...newAccess].map(a => a.name.toLowerCase()))];
    const exists = new Map(await Promise.all(
        names.map(async n => [n, await principalExists(workgroup, n)] as const)
    ));
    const missing = newAccess.filter(a => !exists.get(a.name.toLowerCase()));
    if (missing.length > 0) {
        throw new Error(`Unknown user or group: ${missing.map(a => a.name).join(", ")}`);
    }

    // Files created over SMB carry each principal as both a "u:" and a "g:"
    // entry (see principalExists), so both are cleared before re-adding the
    // current ones: a stale "g:<user>" entry would otherwise keep granting
    // write access after a downgrade to read-only.
    const remove = names
        .filter(n => exists.get(n))
        .flatMap(n => ["u", "g", "d:u", "d:g"].map(tag => `${tag}:${workgroup}\\${n}`));
    const add = ["g::---", "d:u::rwx", "d:g::---", "d:o::---"];
    for (const a of newAccess) {
        const entry = `${a.kind === "group" ? "g" : "u"}:${workgroup}\\${a.name}:${a.level === "write" ? "rwX" : "r-X"}`;
        add.push(entry, `d:${entry}`);
    }
    const args = ["setfacl", "-R"];
    if (remove.length > 0) args.push("-x", remove.join(","));
    args.push("-m", add.join(","), path);
    await runAsRoot(args);
}

async function applyShareParams(name: string, data: ShareData): Promise<void> {
    const workgroup = await getWorkgroup();
    const readers = data.access.filter(a => a.level === "read");
    const set = (param: string, value: string) => runAsRoot(["net", "conf", "setparm", name, param, value]);
    const del = (param: string) => runAsRoot(["net", "conf", "delparm", name, param]);

    await set("valid users", formatUserList(data.access, workgroup));
    await (readers.length > 0 ? set("read list", formatUserList(readers, workgroup)) : del("read list"));
    await (data.comment ? set("comment", data.comment) : del("comment"));
    await set("browseable", data.browseable ? "yes" : "no");
}

function checkShareData(data: ShareData): void {
    // An empty "valid users" would open the share to every domain user
    if (data.access.length === 0) throw new Error("A shared folder needs at least one user or group");
    checkName(...data.access.map(a => a.name));
}

export async function createShare(name: string, data: ShareData): Promise<void> {
    const violation = validateShareName(name);
    if (violation) throw new Error(`Invalid share name "${name}": ${violation}`);
    checkShareData(data);
    cache.invalidate(k => k === NET_CONF_KEY);
    const conf = await loadNetConf();
    if ([...conf.keys()].some(s => s.toLowerCase() === name.toLowerCase())) {
        throw new Error(`A share named "${name}" already exists`);
    }

    const path = `${SHARES_DIR}/${name}`;
    try {
        await runAsRoot(["mkdir", "-p", path]);
        await runAsRoot(["chown", "root:root", path]);
        // setgid keeps new files in the directory's group
        await runAsRoot(["chmod", "2770", path]);
        await applyAcl(path, [], data.access);
        await runAsRoot(["net", "conf", "addshare", name, path, "writeable=y", "guest_ok=n"]);
        await runAsRoot(["net", "conf", "setparm", name, "inherit acls", "yes"]);
        await applyShareParams(name, data);
    } finally {
        cache.invalidate(k => k === NET_CONF_KEY);
    }
}

export async function updateShare(name: string, data: ShareData): Promise<void> {
    checkShareData(data);
    cache.invalidate(k => k === NET_CONF_KEY);
    const share = await findShare(name);
    try {
        await applyAcl(share.path, share.access, data.access);
        await applyShareParams(share.name, data);
    } finally {
        cache.invalidate(k => k === NET_CONF_KEY);
    }
}

export async function deleteShare(name: string, deleteData: boolean): Promise<void> {
    cache.invalidate(k => k === NET_CONF_KEY);
    const share = await findShare(name);
    try {
        await runAsRoot(["net", "conf", "delshare", share.name]);
        if (deleteData) await runAsRoot(["rm", "-rf", "--one-file-system", "--", share.path]);
    } finally {
        cache.invalidate(k => k === NET_CONF_KEY);
    }
}
