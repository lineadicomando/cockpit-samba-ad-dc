---
name: cockpit-module-development
description: Use when developing, refactoring, or reviewing Cockpit web console modules (plugins) — triggered by tasks involving manifest.json, cockpit.spawn, PatternFly components inside Cockpit, or any cockpit package structure. Covers the standard build stack, UX patterns, and API usage for Cockpit 337 with React 18 + PatternFly 6.
---

# Cockpit Module Development

## Overview

Cockpit modules are web apps served by the cockpit bridge and embedded in the cockpit shell iframe. The canonical stack is **React 18 + PatternFly 6 + esbuild + TypeScript**. Vanilla JS with custom CSS violates Cockpit UX guidelines.

**Reference environment:** Cockpit 337, Debian 13 (Trixie), React 18.3.1, PatternFly 6.1.0, esbuild 0.28, TypeScript 5.9.

## Project Structure

```
my-module/
  src/
    app.tsx          # Root React component
    index.tsx        # Entry point: mounts React into #app
    index.html       # HTML shell (must include index.css link + cockpit.js script)
    manifest.json    # Module metadata and menu registration
    app.scss         # Module-specific styles (import PF6 from npm)
  dist/              # esbuild output (gitignored)
  package.json
  Makefile
  build.js           # esbuild config
```

## Key Technologies & Versions

| Technology | Version |
|---|---|
| React | 18.3.1 |
| react-dom | 18.3.1 |
| @patternfly/react-core | 6.1.0 |
| @patternfly/react-icons | 6.1.0 |
| @patternfly/patternfly | 6.1.0 |
| TypeScript | 5.9.3 |
| esbuild | 0.28.0 |

## index.html — MUST include CSS link and cockpit.js script

**Critical:** esbuild outputs CSS as a separate `index.css` file. Without the `<link>` tag, PatternFly styles are absent. Without `cockpit.js`, `window.cockpit` is undefined and all `cockpit.spawn` calls fail.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My Module</title>
  <link rel="stylesheet" href="index.css">
</head>
<body>
  <div id="app"></div>
  <script src="../base1/cockpit.js"></script>
  <script type="module" src="index.js"></script>
</body>
</html>
```

`../base1/cockpit.js` must load **before** the module script so `window.cockpit` is set up before the bundle runs.

## cockpit.js Import (in TypeScript/TSX files)

In source files, import cockpit as a module — esbuild resolves it to `window.cockpit` at runtime via a plugin:

```typescript
import cockpit from "cockpit";
```

The esbuild plugin (in `build.js`) maps this to `window.cockpit`, which is populated by the `../base1/cockpit.js` script loaded in `index.html`.

**NEVER use `["sudo", "-n", ...]`** — use `superuser: "require"` instead.

## index.tsx (Entry Point) — Dark Theme Sync

`cockpit-dark-theme` is a no-op when using a custom esbuild setup. Implement dark mode sync manually with a `MutationObserver` on the parent frame:

```typescript
import React from "react";
import { createRoot } from "react-dom/client";
import "@patternfly/patternfly/patternfly.css";
import "@patternfly/patternfly/patternfly-addons.css";
import "./app.scss";
import { App } from "./app.tsx";

// Mirror pf-v6-theme-dark from the Cockpit shell parent frame onto this iframe
// so PatternFly dark-mode tokens activate when the user switches theme.
function syncDarkTheme() {
    const html = document.documentElement;
    const apply = (dark: boolean) => html.classList.toggle("pf-v6-theme-dark", dark);
    try {
        const parentHtml = window.parent?.document?.documentElement;
        if (parentHtml && parentHtml !== html) {
            const sync = () => apply(parentHtml.classList.contains("pf-v6-theme-dark"));
            sync();
            new MutationObserver(sync).observe(parentHtml, { attributes: true, attributeFilter: ["class"] });
            return;
        }
    } catch { /* cross-origin: skip */ }
    apply(html.classList.contains("pf-v6-theme-dark"));
}

syncDarkTheme();

document.addEventListener("DOMContentLoaded", () => {
    createRoot(document.getElementById("app")!).render(<App />);
});
```

## build.js (esbuild) — cockpit plugin + font loaders

`@patternfly/patternfly` CSS references font files (`.woff2`, `.ttf`, etc.) — configure loaders explicitly:

```javascript
import * as esbuild from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";
import { cpSync, mkdirSync } from "fs";

const cockpitPlugin = {
    name: "cockpit-external",
    setup(build) {
        build.onResolve({ filter: /^cockpit$/ }, () => ({
            path: "cockpit", namespace: "cockpit-external",
        }));
        build.onLoad({ filter: /.*/, namespace: "cockpit-external" }, () => ({
            contents: "export default window.cockpit;", loader: "js",
        }));
        // cockpit-dark-theme handled manually in index.tsx
        build.onResolve({ filter: /^cockpit-dark-theme$/ }, () => ({
            path: "cockpit-dark-theme", namespace: "cockpit-noop",
        }));
        build.onLoad({ filter: /.*/, namespace: "cockpit-noop" }, () => ({
            contents: "", loader: "js",
        }));
    },
};

const ctx = await esbuild.context({
    entryPoints: ["src/index.tsx"],
    bundle: true, outdir: "dist", format: "esm", platform: "browser",
    plugins: [cockpitPlugin, sassPlugin()],
    loader: {
        ".css": "css",
        ".woff2": "file", ".woff": "file", ".ttf": "file",
        ".eot": "file", ".svg": "file", ".png": "file",
    },
    minify: true,
});
mkdirSync("dist", { recursive: true });
cpSync("src/index.html", "dist/index.html");
cpSync("src/manifest.json", "dist/manifest.json");
await ctx.rebuild();
await ctx.dispose();
```

## manifest.json

```json
{
  "version": 0,
  "requires": { "cockpit": "337" },
  "conditions": [
    { "path-exists": "/usr/bin/samba-tool" }
  ],
  "menu": {
    "index": {
      "label": "My Module",
      "order": 90,
      "keywords": [{ "matches": ["keyword1", "keyword2"] }]
    }
  }
}
```

**`path-exists` distro note:** On Debian/Ubuntu, tools are in `/usr/bin/`. On RHEL/Fedora, in `/usr/sbin/`. Verify the actual path on the target system before shipping.

## cockpit.spawn — Privileged Process Execution

```typescript
import cockpit from "cockpit";

const output = await cockpit.spawn(
    ["samba-tool", "user", "list"],
    { superuser: "require", err: "message" }
);

// superuser: "require" — fail with access-denied if not root
// superuser: "try"     — attempt root, fall back to user
// err: "message"       — error text returned in rejection
```

## PatternFly 6 UX Patterns

### Page Shell — MUST pass `sidebar={null}`

**Critical:** Without `sidebar={null}`, PF6's `Page` does not add `pf-m-no-sidebar`. At viewport widths ≥75rem (1200px), the CSS grid switches to 2 columns (`18.125rem sidebar + 1fr main`). Without `pf-m-no-sidebar`, `main-container` occupies only the `"main"` column, leaving ~290px of empty space on the left.

```tsx
import { Page, PageSection, Title } from "@patternfly/react-core";

// sidebar={null} adds pf-m-no-sidebar → main-container spans full width at ≥75rem
<Page sidebar={null}>
  <PageSection>
    <Title headingLevel="h1" size="2xl">Module Title</Title>
  </PageSection>
  <PageSection>
    {/* content */}
  </PageSection>
</Page>
```

### Toolbar + Search

```tsx
import { Toolbar, ToolbarItem, ToolbarContent, SearchInput, Button } from "@patternfly/react-core";

<Toolbar>
  <ToolbarContent>
    <ToolbarItem>
      <SearchInput value={search} onChange={(_e, v) => setSearch(v)} onClear={() => setSearch("")} />
    </ToolbarItem>
    <ToolbarItem>
      <Button variant="primary" onClick={openCreate}>Create</Button>
    </ToolbarItem>
  </ToolbarContent>
</Toolbar>
```

### Tables

Use `@patternfly/react-table` — NOT raw `<table>` HTML:

```tsx
import { Table, Thead, Tbody, Tr, Th, Td, ActionsColumn } from "@patternfly/react-table";

<Table aria-label="Users">
  <Thead><Tr><Th>Username</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
  <Tbody>
    {users.map(user => (
      <Tr key={user.username}>
        <Td>{user.username}</Td>
        <Td>{user.status}</Td>
        <Td><ActionsColumn items={[{ title: "Delete", onClick: () => deleteUser(user) }]} /></Td>
      </Tr>
    ))}
  </Tbody>
</Table>
```

### Modals

```tsx
import { Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter, Button } from "@patternfly/react-core";

<Modal variant={ModalVariant.small} isOpen={isOpen} onClose={onClose}>
  <ModalHeader title="Create user" />
  <ModalBody><Form>...</Form></ModalBody>
  <ModalFooter>
    <Button variant="primary" onClick={handleSubmit}>Create</Button>
    <Button variant="link" onClick={onClose}>Cancel</Button>
  </ModalFooter>
</Modal>
```

### Alerts, Spinner, EmptyState, Labels

```tsx
import { Alert, Spinner, EmptyState, EmptyStateBody, Label } from "@patternfly/react-core";

{error && <Alert variant="danger" isInline title={error} />}
{loading && <Spinner aria-label="Loading" />}
{!loading && items.length === 0 && <EmptyState><EmptyStateBody>No items.</EmptyStateBody></EmptyState>}
<Label color="green">Active</Label>
```

## i18n

```typescript
import cockpit from "cockpit";
const _ = cockpit.gettext;
_("Create user")
```

## Development Workflow

```bash
npm install
make build          # esbuild bundles to dist/
make devel-install  # symlinks dist/ to ~/.local/share/cockpit/<module-name>
make watch          # auto-rebuild on save
make check          # unit tests (node --experimental-strip-types --test)
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| No `<link rel="stylesheet" href="index.css">` in index.html | Add it — esbuild outputs CSS separately |
| No `<script src="../base1/cockpit.js">` in index.html | Add it before module script — populates `window.cockpit` |
| `cockpit.js` script after module script | Must be BEFORE `<script type="module">` |
| `import "cockpit-dark-theme"` expecting auto dark mode | Use MutationObserver on parent frame (see index.tsx above) |
| `<Page>` without `sidebar={null}` | Content shifts right ~290px at ≥75rem — always pass `sidebar={null}` |
| `["sudo", "-n", "samba-tool"]` in spawn args | `cockpit.spawn(args, { superuser: "require" })` |
| Missing font loaders in build.js | Add `.woff2/.ttf/.eot/.svg` loaders — PF6 CSS references them |
| `/usr/sbin/tool` in manifest conditions | Verify actual path per distro (Debian uses `/usr/bin/`) |
| Raw `<table>` HTML | PF6 `Table/Thead/Tbody/Tr/Th/Td` from `@patternfly/react-table` |
| Custom modal `<div>` | PF6 `Modal/ModalHeader/ModalBody/ModalFooter` |
| Custom CSS from scratch | Import and use PF6 components |
| `<details>` for collapsible sections | PF6 `ExpandableSection` |
| Custom `<details>` context menu | PF6 `ActionsColumn` / `Dropdown` |
| Exposing cache internals in UI | Manage internally in state/hooks |
| No `conditions` in manifest.json | Add `path-exists` for required tools |
