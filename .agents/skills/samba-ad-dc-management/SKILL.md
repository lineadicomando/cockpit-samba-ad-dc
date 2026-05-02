---
name: samba-ad-dc-management
description: Use when implementing user, group, or computer management against a Samba Active Directory Domain Controller via samba-tool — triggered by tasks involving samba-tool commands, parsing LDAP-style output, AD domain operations, or building cockpit modules that wrap samba-tool. Reference for Samba 4.22 (Debian 13).
---

# Samba AD DC Management via samba-tool

## Overview

`samba-tool` is the primary CLI for managing a Samba AD DC. All commands require root (run via `cockpit.spawn` with `superuser: "require"`). Output is LDAP-style `key: value` text. Domain: run as `samba-ad-dc.service`.

**Reference environment:** Samba 4.22.8, Debian 13 (Trixie), domain `acme.internal`.

## Privilege Requirement

All samba-tool subcommands need root access. In Cockpit:

```typescript
const output = await cockpit.spawn(
    ["samba-tool", ...args],
    { superuser: "require", err: "message" }
);
```

Privilege escalation is handled by Cockpit/PolicyKit. Do not wrap commands with `sudo` in command arguments.

## Output Format: LDAP-style Parsing

`show` commands return `key: value` lines (multi-value fields repeat the key):

```
dn: CN=alice,CN=Users,DC=acme,DC=internal
cn: alice
objectClass: user
objectClass: person
memberOf: CN=Domain Users,CN=Users,DC=acme,DC=internal
memberOf: CN=Staff,CN=Users,DC=acme,DC=internal
userAccountControl: 512
objectSid: S-1-5-21-...-1104
```

**Parser pattern:**

```typescript
function parseShow(raw: string): Record<string, string | string[]> {
    const fields: Record<string, string | string[]> = {};
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
```

## User Management

### List users
```bash
samba-tool user list
# Output: one username per line
```

### Show user details
```bash
samba-tool user show <username>
# Returns LDAP-style fields (see parser above)
```

**Key fields to extract:**
| samba-tool field | Meaning |
|---|---|
| `cn` / `name` | Full name |
| `userAccountControl` | `& 2 === 2` → Disabled |
| `objectSid` | Last RID segment = numeric ID |
| `uidNumber` | Unix UID (if RFC2307) |
| `lastLogonTimestamp` | Windows ticks → Unix: `ticks / 10000 - 11644473600000` |
| `memberOf` | DN list; extract `CN=X` from first component |

**Derive account status:**
```typescript
const uac = parseInt(fields.userAccountControl as string, 10);
const disabled = !isNaN(uac) && (uac & 2) === 2;
```

### Create user
```bash
samba-tool user add <username> <password> [--given-name=X] [--surname=Y] [--mail-address=Z]
```

### Delete user
```bash
samba-tool user delete <username>
```

### Enable / Disable
```bash
samba-tool user enable <username>
samba-tool user disable <username>
```

### Set password
```bash
samba-tool user setpassword <username> --newpassword=<password>
```

### Password policy (domain-wide)
```bash
samba-tool domain passwordsettings show
```
Key output fields: `Password complexity`, `Minimum password length`, `Password history length`.

### Protected users (never delete/disable via UI)
- `Administrator`
- `krbtgt`
- `Guest`

## Group Management

### List groups
```bash
samba-tool group list
# Output: one group name per line
```

### Show group
```bash
samba-tool group show <groupname>
```

**Key fields:**
| Field | Meaning |
|---|---|
| `objectSid` | Last segment = RID (numeric ID) |
| `member` | DN list of members |
| `isCriticalSystemObject` | `TRUE` = protected, do not modify |
| `description` | Optional description |

### Create group
```bash
samba-tool group add <groupname>
```

### Delete group
```bash
samba-tool group delete <groupname>
```

### Add members
```bash
samba-tool group addmembers <groupname> <member1>,<member2>
```

### Remove members
```bash
samba-tool group removemembers <groupname> <member1>,<member2>
```

### List members
```bash
samba-tool group listmembers <groupname>
# Output: one member CN per line
```

### Rename group
```bash
samba-tool group rename <oldname> <newname>
```

### Protected groups (never delete/rename via UI)
Built-in AD groups with `isCriticalSystemObject: TRUE` plus the static protected set used by this codebase:
`Administrators`, `Domain Admins`, `Enterprise Admins`, `Schema Admins`,
`Domain Controllers`, `Users`, `Guests`, `Domain Users`, `Domain Guests`, `Domain Computers`.

## Computer Management

### List computers
```bash
samba-tool computer list
# Output: one computer name per line (without $)
```

### Show computer
```bash
samba-tool computer show <computername>
```

### Add computer (pre-stage)
```bash
samba-tool computer add <computername>
```

### Delete computer
```bash
samba-tool computer delete <computername>
```

### Move computer to OU
```bash
samba-tool computer move <computername> "OU=Workstations,DC=acme,DC=internal"
```

## Organizational Unit Management

### List OUs
```bash
samba-tool ou list
```

### Create OU
```bash
samba-tool ou create "OU=MyOU,DC=acme,DC=internal"
```

## Domain Info

```bash
samba-tool domain info 127.0.0.1
# Returns: Forest, Domain, Netbios domain, DC name, Server site
```

## DN Parsing Helpers

Extract name from Distinguished Name:
```typescript
function dnToName(dn: string): string {
    const first = dn.split(",")[0] ?? "";
    return first.replace(/^CN=/i, "").trim();
}

function ridFromSid(sid: string): string {
    const parts = sid.split("-");
    return parts[parts.length - 1] ?? "-";
}
```

## Common samba-tool Errors

| Error message | Cause |
|---|---|
| `User 'X' already exists` | Duplicate username |
| `Failed to find user 'X'` | User does not exist |
| `Password does not meet complexity` | Policy violation |
| `Could not connect to server` | samba-ad-dc.service not running |
| `access denied` | Not running as root |

## Caching Strategy

samba-tool reads are slow (LDAP round-trips). Safe TTLs:

| Command | Recommended TTL |
|---|---|
| `user list` | 30 seconds |
| `user show` | 30 seconds |
| `group list` | 60 seconds |
| `group show` | 60 seconds |
| `domain passwordsettings show` | 5 minutes |
| Any mutation | Invalidate immediately |

Use in-memory cache (Map) keyed by command args. Do NOT expose cache controls in the UI.
