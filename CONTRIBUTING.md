# Contributing

Thank you for your interest in contributing to cockpit-samba-ad-dc.

## Development setup

**Requirements:** Git, Node.js ≥ 18, npm, a running Samba AD DC with Cockpit ≥ 337.

```bash
git clone https://github.com/lineadicomando/cockpit-samba-ad-dc.git
cd cockpit-samba-ad-dc
npm install
```

Common commands:

```bash
make build          # compile src/ → dist/
make watch          # rebuild on file change
make check          # run unit tests
make devel-install  # symlink dist/ into ~/.local/share/cockpit/samba-ad-dc
sudo make install   # install into /usr/share/cockpit/samba-ad-dc
```

After `make devel-install`, open Cockpit in a browser — the module appears immediately without restarting the service.

## Architecture overview

```
UI components (src/components/)
    ↓
API layer (src/lib/samba.ts)   ← only place that calls samba-tool
    ↓
samba-tool on the server
```

Key conventions:
- All command execution goes through `src/lib/samba.ts`. Never call `cockpit.spawn` directly from components.
- Write operations must call `cache.invalidate()` after the command succeeds.
- Destructive actions (delete, rename, disable) must be disabled for entries in `PROTECTED_USERS` / `PROTECTED_GROUPS`.
- Privilege escalation is handled by Cockpit via PolicyKit (`superuser: "require"`). Never embed `sudo` in command arguments.

See [AGENTS.md](./AGENTS.md) for the full architecture reference.

## Submitting changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Add or update tests in `test/` when relevant.
3. Verify everything passes:
   ```bash
   npx tsc --noEmit
   make check
   make build
   ```
4. Open a pull request against `main` with a clear description of what changed and why.

## Reporting bugs

Open an issue using the **Bug report** template. Include the Cockpit version, Samba version, and the exact steps to reproduce.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be respectful and constructive.
