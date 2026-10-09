# TODO

Roadmap of `samba-tool` features not yet exposed by the module, checked against
Samba 4.22. Subcommand names and flags must be confirmed on the target version
(`samba-tool <cmd> --help`) before implementing: some were renamed across
releases (e.g. `ou create` → `ou add`, `computer create` → `computer add`).

Legend: `[ ]` planned · `[?]` left out for now, future implementation to be decided

Each item, when implemented, also needs: validators in `src/lib/validators.ts`,
parsers and tests under `test/`, cache invalidation in `src/lib/samba.ts`,
strings in both `src/locales/en` and `src/locales/it`, and a line in the README
feature list.

## 1. Account lockout and expiry (high priority)

Small additions to the existing user page.

- [ ] **Unlock account** — `samba-tool user unlock <username>`
  - [ ] Read `lockoutTime` in the `ldbsearch` user query and expose a locked
        state on `User` (a non-zero `lockoutTime` is only a lock while the
        domain lockout duration has not elapsed)
  - [ ] "Locked" label in the users table and on the user detail page
  - [ ] "Unlock" action on the detail page and as a bulk action
  - [ ] "Locked only" filter in the users list
- [ ] **Account expiry** — `samba-tool user setexpiry <username> --days=N | --noexpiry`
  - [ ] Read `accountExpires` and show the expiry date on the detail page
  - [ ] Date picker converted to a number of days, plus "never expires"
  - [ ] "Expired" label in the users table
  - [ ] Bulk action (e.g. expire a whole class at the end of the school year)

## 2. Password policy (high priority)

The policy is currently read-only (`domain passwordsettings show`) and only
three fields are parsed (`PasswordPolicy` in `src/lib/types.ts`).

- [ ] **Edit the domain policy** — `samba-tool domain passwordsettings set`
  - [ ] Extend `PasswordPolicy` and its parser: min/max password age, lockout
        threshold, lockout duration, reset-lockout-after
  - [ ] Settings form: `--complexity`, `--min-pwd-length`, `--history-length`,
        `--min-pwd-age`, `--max-pwd-age`, `--account-lockout-threshold`,
        `--account-lockout-duration`, `--reset-account-lockout-after`
  - [ ] Invalidate the cached policy (300 s TTL) after a change
  - [ ] Decide where it lives in the UI (new "Domain" tab, see section 6)
- [ ] **Fine-grained policies (PSO)** — `samba-tool domain passwordsettings pso`
  - [ ] List and detail: `pso list`, `pso show <name>`
  - [ ] Create, edit, delete: `pso create <name> <precedence>`, `pso set`, `pso delete`
  - [ ] Assign to users and groups: `pso apply`, `pso unapply`
  - [ ] Effective policy on the user detail page: `pso show-user <username>`
  - [ ] Make the password field in the create/reset modals validate against
        the effective policy rather than the domain one

## 3. Organizational units (high priority, largest change)

No OU support today: every object is created in the default container. This
touches the navigation of all sections, so it should be designed as a whole.

- [ ] **OU management** — `samba-tool ou`
  - [ ] Tree view: `ou list`, `ou listobjects <ou_dn>`
  - [ ] Create, rename, move: `ou add`, `ou rename`, `ou move`
  - [ ] Delete: `ou delete`, with an explicit confirmation for
        `--force-subtree-delete` on non-empty OUs
- [ ] **Move objects between OUs** — `user move`, `group move`, `computer move`
  - [ ] Single and bulk move from the list pages
- [ ] **Create inside an OU** — `--userou` on `user add`, `--groupou` on `group add`
- [ ] Show the OU as a column and filter in the users, groups and computers lists
- [ ] Protect built-in containers (`Domain Controllers`, `Users`, `Computers`)

## 4. Richer create and edit forms (medium priority)

- [ ] **Users** — more `user add` options in the create modal:
      `--must-change-at-next-login`, `--description`, `--mail-address`
- [ ] **Groups** — `group add` options: `--description`, `--group-scope`
      (Domain/Global/Universal), `--group-type` (Security/Distribution),
      `--mail-address`; edit description on existing groups
- [ ] **Computers**
  - [ ] Detail page — `samba-tool computer show <name>`
  - [ ] Pre-create an account in a chosen OU — `samba-tool computer add`
  - [ ] Depends on section 3 for the OU selector

## 5. DNS and Group Policy (medium priority)

Both areas need a design decision first: these commands talk to the server
over RPC/SMB and normally require domain credentials, while the rest of the
module only runs as root against the local `sam.ldb`. Options to evaluate:
machine account credentials (`-P`), a prompt for an administrator password
fed through stdin (as `runSambaWithInput` already does), or direct local
access as done for the "Cockpit - Mapped drives" GPO.

- [ ] **Decide the authentication approach** for RPC-based commands
- [ ] **DNS** — `samba-tool dns`
  - [ ] Zones: `zonelist`, `zoneinfo`
  - [ ] Records: `query`, `add`, `delete`, `update` (A, AAAA, CNAME, PTR, TXT, SRV, MX)
  - [ ] Protect the records the domain depends on (`_msdcs`, `_ldap`, `_kerberos`, DC A records)
- [ ] **Group Policy** — `samba-tool gpo`
  - [ ] List and detail: `gpo listall`, `gpo show <gpo>`
  - [ ] Links: `gpo getlink`, `gpo setlink`, `gpo dellink`, `gpo listcontainers`
        (depends on section 3)
  - [ ] Backup and restore: `gpo backup`, `gpo restore`
  - [ ] Keep the module's own drive-mapping GPO out of destructive actions

## 6. Domain status and maintenance (medium priority, low effort)

A new, mostly read-only "Domain" tab.

- [ ] **Overview** — `domain info`, `domain level show`, `fsmo show`, `processes`
- [ ] **Health checks** run on demand, with the raw output shown:
  - [ ] `samba-tool dbcheck` (report only; `--fix` is not exposed)
  - [ ] `samba-tool ntacl sysvolcheck`, with `sysvolreset` offered on failure
  - [ ] `testparm -s`
- [ ] **Backup** — `samba-tool domain backup offline --targetdir=<dir>`
  - [ ] Choose and validate the target directory, list existing backups
  - [ ] Long-running command: progress and error reporting
  - [ ] Document restore as a manual procedure (`domain backup restore`)

## Left out — future implementation to be decided

Not planned: outside the current scope of the module (a single-DC domain
managed by non-specialist administrators). Each entry can be reconsidered;
the note says what would make it worth doing.

| | Command | Why left out | Would be reconsidered if |
|---|---|---|---|
| [?] | `drs showrepl`, `drs replicate`, `drs kcc` | Meaningless with one DC | Multi-DC deployments are supported |
| [?] | `domain join`, `domain demote`, `domain provision` | One-off, destructive, better done from a shell | A guided setup wizard is wanted |
| [?] | `fsmo transfer`, `fsmo seize` | Rare and risky; only `fsmo show` is planned | Multi-DC deployments are supported |
| [?] | `domain level raise`, `domain schemaupgrade` | Irreversible | A guided upgrade procedure is wanted |
| [?] | `domain trust` | No use case with a single domain | Trusts with other domains are needed |
| [?] | `sites`, `sites subnet` | Single-site domain | Multi-site deployments are supported |
| [?] | `schema`, `dsacl` | Expert-only, easy to break the directory | An "advanced" section is added |
| [?] | `delegation`, `spn` | Only needed for service accounts and Kerberos delegation | Services integrated with AD need it |
| [?] | `service-account`, `domain kds` (gMSA) | Same as above | Same as above |
| [?] | `domain auth policy`, `domain auth silo`, `domain claim` | Advanced access control, requires functional level 2016 | Hardening of privileged accounts is in scope |
| [?] | `contact` | Address-book objects, no mail integration | A mail server uses the directory |
| [?] | `user addunixattrs`, `group addunixattrs` | The module relies on winbind ID mapping | RFC2307 attributes are needed for Linux clients |
| [?] | `user getpassword`, `user syncpasswords` | Exposes password material | Password sync to an external system is needed |
| [?] | `domain exportkeytab` | Writes key material to disk | Kerberized services need a keytab |
| [?] | `user sensitive` | Niche | Delegation is implemented |
| [?] | `domain tombstones expunge` | Maintenance detail, handled by Samba itself | A recycle-bin view for deleted objects is added |
| [?] | `gpo manage ...`, `gpo admxload` | Policies for Linux clients and ADMX templates, large surface | A full GPO editor is in scope |
| [?] | `dns zonecreate`, `dns zonedelete`, `dns cleanup` | Record editing covers the common cases | Reverse zones or extra zones are needed |
| [?] | `visualize` | Replication graphs, multi-DC only | Multi-DC deployments are supported |
