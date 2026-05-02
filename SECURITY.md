# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.x (current) | Yes |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Send a report to **alessandro.gagliano@gmail.com** with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive a response within 5 business days. Once the issue is confirmed and a fix is available, a security advisory will be published and you will be credited (unless you prefer to remain anonymous).

## Security model

This module runs as a Cockpit plugin inside a privileged iframe. Privilege escalation is handled entirely by Cockpit via PolicyKit (`superuser: "require"`). The module never embeds credentials or calls `sudo` directly — it relies on the Cockpit session having already authenticated the user.

Access to this module should be restricted to users with Cockpit administrative access on the domain controller.
