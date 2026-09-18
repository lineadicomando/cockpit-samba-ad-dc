// Runs samba.ts against the spawn() test double (see cockpit-loader.mjs).
// samba.ts keeps module state (cache, home share promise, NetBIOS name), so
// the tests below share one instance and are written to be order-independent.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setSpawnHandler, calls, type SpawnCall } from "./mocks/cockpit.ts";
import { listUsers, createUser, createGroup, addGroupMembers, deleteUser, provisionHomeDir } from "../src/lib/samba.ts";

const ROOT_DSE = [
    "# record 1",
    "dn: ",
    "defaultNamingContext: DC=school,DC=internal",
    "",
    "# returned 1 records",
].join("\n");

// Verbatim shape of ldbsearch output on Samba 4.22: non-ASCII values in
// base64, long lines folded at 78 columns, trailing referrals.
const USERS = [
    "# record 1",
    "dn: CN=Nicolò Rossi,CN=Users,DC=school,DC=internal",
    "cn:: Tmljb2zDsiBSb3NzaQ==",
    "givenName:: Tmljb2zDsg==",
    "sAMAccountName: nrossi",
    "userAccountControl: 512",
    "objectSid: S-1-5-21-1-2-3-1112",
    "primaryGroupID: 513",
    "memberOf: CN=Gruppo docenti con un nome decisamente lungo per il test LDIF,CN=",
    " Users,DC=school,DC=internal",
    "",
    "# Referral",
    "ref: ldap://school.internal/CN=Configuration,DC=school,DC=internal",
    "",
    "# returned 2 records",
].join("\n");

const GROUPS = [
    "# record 1",
    "dn: CN=Domain Users,CN=Users,DC=school,DC=internal",
    "sAMAccountName: Domain Users",
    "objectSid: S-1-5-21-1-2-3-513",
    "",
].join("\n");

function isCmd(call: SpawnCall, ...prefix: string[]): boolean {
    return prefix.every((p, i) => call.args[i] === p);
}

function ldbHandler(call: SpawnCall): string {
    if (call.args.includes("-s") && call.args.includes("base")) return ROOT_DSE;
    if (call.args.includes("(objectClass=group)")) return GROUPS;
    return USERS;
}

describe("listUsers", () => {
    it("decodes base64 names, unfolds long DNs and resolves the primary group", async () => {
        setSpawnHandler(call => (isCmd(call, "ldbsearch") ? ldbHandler(call) : ""));
        const users = await listUsers();
        assert.equal(users.length, 1);
        assert.equal(users[0].username, "nrossi");
        assert.equal(users[0].fullName, "Nicolò Rossi");
        assert.equal(users[0].givenName, "Nicolò");
        assert.deepEqual(users[0].groups, [
            "Gruppo docenti con un nome decisamente lungo per il test LDIF",
            "Domain Users",
        ]);
        assert.equal(users[0].primaryGroup, "Domain Users");
    });

    it("reads the base DN from the local rootDSE, not from a network query", async () => {
        setSpawnHandler(call => (isCmd(call, "ldbsearch") ? ldbHandler(call) : ""));
        await listUsers();
        assert.ok(!calls.some(c => c.args.includes("domain") && c.args.includes("info")));
    });
});

describe("createUser", () => {
    it("passes the password on stdin, never in argv", async () => {
        setSpawnHandler(() => "");
        await createUser("mrossi", "S3cret!pw", "Mario", "Rossi");
        const add = calls.find(c => isCmd(c, "samba-tool", "user", "add"));
        assert.ok(add);
        assert.ok(!add.args.some(a => a.includes("S3cret!pw")));
        assert.equal(add.input, "S3cret!pw\nS3cret!pw\n");
        assert.deepEqual(add.args, ["samba-tool", "user", "add", "mrossi", "--given-name=Mario", "--surname=Rossi"]);
    });
});

describe("option-like names", () => {
    it("are rejected before any command runs", async () => {
        setSpawnHandler(() => "");
        await assert.rejects(createGroup("-H"), /Invalid account name/);
        await assert.rejects(deleteUser("--help"), /Invalid account name/);
        await assert.rejects(addGroupMembers("Teachers", ["alice", "-x"]), /Invalid account name/);
        assert.equal(calls.length, 0);
    });
});

describe("provisionHomeDir", () => {
    it("creates the home share once when several users are provisioned in parallel", async () => {
        let shareExists = false;
        let addshareCount = 0;
        setSpawnHandler(async call => {
            if (isCmd(call, "testparm")) return "DC\n";
            if (isCmd(call, "samba-tool", "user", "show")) {
                return `dn: CN=${call.args[3]},CN=Users,DC=school,DC=internal\nsAMAccountName: ${call.args[3]}\n`;
            }
            if (isCmd(call, "net", "conf", "getparm")) {
                if (!shareExists) throw new Error("share not found");
                return "/srv/samba/home\n";
            }
            if (isCmd(call, "net", "conf", "addshare")) {
                // Real "net conf addshare" fails if the share already exists
                if (shareExists) throw new Error("ERROR: share home already exists");
                await new Promise(r => setTimeout(r, 10));
                shareExists = true;
                addshareCount++;
                return "";
            }
            return "";
        });

        const users = ["alice", "bob", "carol"];
        await Promise.all(users.map(u => provisionHomeDir(u)));

        assert.equal(addshareCount, 1);
        for (const u of users) {
            const chown = calls.find(c => isCmd(c, "chown") && c.args[2] === `/srv/samba/home/${u}`);
            assert.deepEqual(chown?.args, ["chown", `${u}:`, `/srv/samba/home/${u}`]);
            const modify = calls.find(c => isCmd(c, "ldbmodify") && c.input?.includes(`CN=${u},`));
            assert.ok(modify?.input?.includes(`homeDirectory: \\\\DC\\home\\${u}`));
            assert.ok(modify?.input?.includes("homeDrive: H:"));
        }
    });
});

describe("home share", () => {
    it("moves an existing home share to the current base directory", async () => {
        // Separate module instance: the home share promise above is already settled
        // @ts-expect-error -- the query string is not a path TypeScript can resolve
        const { provisionHomeDir: provision } = await import("../src/lib/samba.ts?home-move");
        setSpawnHandler(call => {
            if (isCmd(call, "testparm")) return "DC\n";
            if (isCmd(call, "samba-tool", "user", "show")) return "dn: CN=u1,CN=Users,DC=school,DC=internal\n";
            if (isCmd(call, "net", "conf", "getparm")) return "/home/samba\n";
            return "";
        });
        await provision("u1");
        assert.ok(calls.some(c => c.args.join(" ") === "net conf setparm home path /srv/samba/home"));
        assert.ok(!calls.some(c => isCmd(c, "net", "conf", "addshare")));
    });
});
