# Cockpit Samba AD DC - Roadmap to 1.0.0

## Objective
Deliver `1.0.0` as a feature-complete first major release including all requested capabilities:
1. Bulk user operations: group membership changes.
2. User/group import and export.
3. Shared folder management.
4. Configurable paths for shared folders and home root.
5. Configurable home drive letter (currently hardcoded as `H:`).
6. Automatic mapping of shared folders.

## Current Baseline (what already exists)
- Users, groups, computers CRUD-like operations are already available via `src/lib/samba.ts` + PF UI pages.
- Protected objects are enforced (`PROTECTED_USERS`, `PROTECTED_GROUPS`) and exposed as `isProtected` in UI models.
- Home provisioning already exists (`provisionHomeDir`) but is currently hardcoded:
  - home directory root: `/home/samba/<username>`
  - SMB share name/path: `home` -> `/home/samba`
  - AD homeDrive: `H:`
- Build/test pipeline is already in place.

This means the 1.0.0 scope is realistic if implemented incrementally and validated on the test VM.

## Feasibility Assessment by Requirement

### 1) Bulk user operations: group membership changes
Feasibility: **High**.

Why:
- APIs already exist for single operations (`addGroupMembers`, `removeGroupMembers`) and user/group listing.
- Current UI already supports per-user group membership editing, so behavior and errors are known.

Main work:
- Add multi-select users in `UsersPage`.
- Add bulk action modal with three modes: `add`, `remove`, `replace` memberships.
- Apply batched operations with per-user result collection.

Risks:
- Partial failures (some users updated, others failed).
- Protected/system account handling in bulk flows.

Mitigation:
- Preflight validation + dry preview of impacted users.
- Result report (`success`, `failed`, reason).

---

### 2) Import/export users/groups
Feasibility: **Medium-High**.

Why:
- Create/update primitives exist for users/groups.
- Export can be built from existing list + details APIs.

Main work:
- Define stable formats:
  - Export: JSON first (authoritative), optional CSV for human editing.
  - Import: CSV + JSON with strict schema/version.
- Add import engine with validation pipeline:
  - Parse
  - Validate required fields
  - Resolve references (group existence)
  - Execute with idempotent strategy
- Add downloadable error report for rejected rows.

Risks:
- Ambiguous update semantics (create-only vs upsert).
- Password handling in import (security + policy constraints).

Mitigation:
- For 1.0.0 define explicit modes:
  - `create-only`
  - `upsert-safe` (no destructive rename/delete)
- Do not export/import clear-text passwords.
- Require admin-provided password policy compliant defaults when needed.

---

### 3) Shared folder management
Feasibility: **Medium**.

Why:
- Current code already uses `net conf` commands for `home` share bootstrap.
- Cockpit privilege model is already correct (`superuser: "require"`).

Main work:
- Add API wrappers for shares (`list/show/add/delete/setparm`).
- Add UI page for shared folders (list, create, edit, delete).
- Add basic ACL integration policy (initially group-based access rules).

Risks:
- Samba configuration variability across hosts.
- ACL complexity (filesystem ACL vs Samba share parameters).

Mitigation:
- Scope 1.0.0 to a supported baseline (Debian 13 + Samba 4.22 VM profile).
- Start with clear minimal contract:
  - share path
  - read/write allowed groups
  - browseable/guest flags

---

### 4) Configurable shared/home paths (remove hardcoded `/home/samba`)
Feasibility: **High**.

Why:
- Hardcoded values are isolated in `provisionHomeDir` and `ensureHomeShare`.

Main work:
- Introduce central runtime config (e.g. `HomeConfig` + `SharesConfig`) in `samba.ts`.
- Add UI/admin settings to configure:
  - home root path
  - shared root path
  - home share name
- Apply config to provisioning and shared-folder creation flows.

Risks:
- Invalid path inputs and path traversal issues.

Mitigation:
- Strict path validation + normalized absolute paths.
- Deny unsafe values and show actionable errors.

---

### 5) Configurable home drive letter (remove hardcoded `H:`)
Feasibility: **High**.

Why:
- Single hardcoded call exists today (`setHomeDirAttributes(..., "H:", ...)`).

Main work:
- Add configurable policy:
  - global default drive letter (`A:`..`Z:` constrained, with reserved exclusions)
  - optional per-rule override (future compatible)
- Reflect value in user detail UI and provisioning logs.

Risks:
- Conflicts with existing client mappings.

Mitigation:
- Validation + warning on commonly conflicting letters.
- Non-destructive rollout (new assignments for new/updated users only unless explicit remap action).

---

### 6) Automatic mapping of shared folders
Feasibility: **Medium** (depends on delivery model).

Why:
- Technically possible, but mechanism choice matters.

Supported implementation options:
1. **Logon script integration** (recommended for 1.0.0): generate/update script and assign via AD attributes/GPO-compatible flow.
2. Group Policy object management from this UI (higher complexity).
3. Client-side push agent (out of scope for this project architecture).

Recommendation for 1.0.0:
- Implement option 1 only.
- Define mapping rules: group -> `\\SERVER\\share` -> drive letter.
- Generate deterministic script content from rules.

Risks:
- Existing customer logon scripts.
- Order/conflict of multiple mappings.

Mitigation:
- Keep generated block delimited (`BEGIN/END managed by cockpit-samba-ad-dc`).
- Preview + explicit apply.

## 1.0.0 Delivery Scope (Accepted)
All six requirements are feasible for `1.0.0` with this scoped interpretation:
- Bulk operations for memberships only (no bulk rename/delete in 1.0.0).
- Import/export with strict schemas and safe modes.
- Shared folders with baseline create/edit/delete + basic access model.
- Configurable paths and drive letter with validation.
- Auto-mount via managed logon script workflow.

## Gaps to close before implementation starts
1. Functional spec for import formats (`users.csv`, `groups.csv`, `export.json`).
2. Decision on where persistent module settings are stored (Samba config-backed vs module local state).
3. Exact rule model for auto-mount (priority, collisions, default drive assignment).
4. Security rules for who can run destructive import/bulk/share operations.

## Proposed Milestones to 1.0.0
- `0.2.0-alpha`: bulk membership operations + config-driven home path/drive.
- `0.3.0-alpha`: shared folder management baseline.
- `0.4.0-alpha`: import/export engine + validation reports.
- `0.5.0-alpha`: auto-mount rules + managed logon script apply.
- `0.9.0-rc`: stabilization, regression testing, docs, packaging checks.
- `1.0.0`: final QA on VM matrix + release.

## Definition of Done for 1.0.0
- All 6 features implemented and reachable from UI.
- Unit tests updated for parsers/validation logic.
- End-to-end manual test checklist passed on Debian 13 + Samba 4.22.8 VM.
- No hardcoded home path/drive remains in code.
- Import and bulk operations produce machine-readable success/failure reports.
- Build and unit-test workflow remains green.
