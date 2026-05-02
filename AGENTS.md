## Commands

```bash
make build          # compile src/ → dist/ with esbuild
make watch          # same, with file-watching and inline sourcemaps
make check          # run unit tests (Node --experimental-strip-types, no compile step)
make devel-install  # symlink dist/ into ~/.local/share/cockpit/samba-ad-dc
make vm-deploy      # build and rsync dist/ to the test VM (maint@172.16.0.3)
```

Run a single test file:
```bash
node --experimental-strip-types --test test/parsers.test.ts
```

TypeScript type-check only (no output):
```bash
npx tsc --noEmit
```

## Architecture

### Three-layer design

```
UI components (src/components/)
    ↓  call
API layer (src/lib/samba.ts)
    ↓  cockpit.spawn(["samba-tool", ...], { superuser: "require" })
samba-tool on the server
```

**`src/lib/samba.ts`** is the sole place that executes commands. All write operations call `runSamba()` directly and then call `cache.invalidate()` to purge stale read-cache entries. Read operations use `runSambaCached()` with per-resource TTLs (users: 30 s, groups: 60 s, computers: 60 s, password policy: 5 min).

**`src/lib/parsers.ts`** converts the LDAP-style key-value text that `samba-tool show` emits into typed objects. `parseLdapShow()` handles multi-valued fields (returns `string[]`). `deriveUserStatus()` decodes the Windows `userAccountControl` bitmask; `deriveLastActivity()` converts Windows FILETIME ticks to a locale date string.

**`src/lib/cache.ts`** is a simple in-memory TTL cache keyed on the joined argument string (`\x1f`-separated). The TTL is evaluated at read time, not at write time.

**`src/lib/types.ts`** defines the four shared interfaces: `User`, `Group`, `Computer`, `PasswordPolicy`, plus `LdapFields`.

### Build quirks

`build.js` uses a custom esbuild plugin (`cockpit-external`) that resolves `import cockpit from "cockpit"` to `window.cockpit` at runtime — cockpit.js is loaded by the HTML shell, not bundled. The `cockpit-dark-theme` import is stubbed to a no-op.

### Cockpit integration rules

- The module runs inside a Cockpit iframe. **Never** wrap content in a `<Page>` that includes a sidebar — use `<Page sidebar={null}>` to avoid the PF6 grid leaving a sidebar gap.
- Dark theme must be synced manually from the parent frame. `src/index.tsx` does this with a `MutationObserver` on `window.parent.document.documentElement`.
- Privilege escalation is handled entirely by Cockpit via PolicyKit (`superuser: "require"`). Do not embed `sudo` in command arguments.

### Protected objects

`samba.ts` maintains `PROTECTED_USERS` and `PROTECTED_GROUPS` sets. UI components must respect the `isProtected` flag on each object — destructive actions (delete, rename, disable) must be disabled for protected objects.

### Test VM

The VM at `maint@172.16.0.3` runs Debian 13, Cockpit 337, Samba 4.22.8, domain `acme.internal`. `make vm-deploy` tarballs `dist/` and extracts it into the VM's user-local cockpit directory. No package manager or systemd restart needed.
