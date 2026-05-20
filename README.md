# cockpit-samba-ad-dc

[![GitHub tag](https://img.shields.io/github/v/tag/lineadicomando/cockpit-samba-ad-dc?label=version)](https://github.com/lineadicomando/cockpit-samba-ad-dc/tags)
[![License: LGPL v2.1](https://img.shields.io/badge/license-LGPL%20v2.1-blue)](./LICENSE)
[![CI](https://github.com/lineadicomando/cockpit-samba-ad-dc/actions/workflows/ci.yml/badge.svg)](https://github.com/lineadicomando/cockpit-samba-ad-dc/actions/workflows/ci.yml)
[![GitHub issues](https://img.shields.io/github/issues/lineadicomando/cockpit-samba-ad-dc)](https://github.com/lineadicomando/cockpit-samba-ad-dc/issues)

Cockpit module for managing a Samba Active Directory Domain Controller via `samba-tool`.

## Features

- **Users** — list, create, edit password, enable/disable, delete
- **Groups** — list, create, rename, delete, member management (add/remove)
- **Computers** — list, delete
- Automatic protection of built-in system objects (Administrator, krbtgt, Domain Admins, etc.)
- Live search and filter in every section
- Full support for Cockpit light/dark theme

## Tech stack

| Component | Version |
|---|---|
| Cockpit | 337 |
| Samba | 4.22 |
| React | 18.3 |
| PatternFly | 6.1 |
| TypeScript | 5.9 |
| esbuild | 0.28 |
| Node.js | ≥ 18 |

## Requirements

- Git
- Make
- Cockpit ≥ 337 installed on the server
- `samba-tool` available at `/usr/bin/samba-tool`
- Node.js ≥ 18 on the development machine
- npm (bundled with Node.js)

## Installation

```bash

# Clone repository
git clone https://github.com/lineadicomando/cockpit-samba-ad-dc.git
cd cockpit-samba-ad-dc

# Install dependencies
npm install

# Build and install into production Cockpit extensions directory
sudo make install
```

This installs the module to:
`/usr/share/cockpit/samba-ad-dc`

For pre-`1.0.0` releases, deployment is Make-based (`sudo make install`).

## Development

```bash
# Install dependencies
npm install

# Build
make build

# Install by copying dist/ into production cockpit (/usr/share/cockpit/samba-ad-dc)
sudo make install

# Install as symlink into local cockpit (development shortcut)
make devel-install

# Run unit tests
make check

# Watch mode (auto-rebuild on save)
make watch
```

## Privilege escalation

The module uses `cockpit.spawn` with `superuser: "require"` — no hardcoded `sudo` in command arguments. Cockpit handles privilege escalation via PolicyKit.

## License

Same license as the Cockpit project: **GNU LGPL v2.1 or later** (`LGPL-2.1-or-later`).
See [LICENSE](./LICENSE).
