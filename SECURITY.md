# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in NVRemote, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@nvremote.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x-alpha | Yes |
| < 0.4.0 | No |

## Security Model

NVRemote implements defense-in-depth:

- **Authentication** — Google OAuth 2.0 with JWT access/refresh tokens. Global JWT guard on all endpoints (default-closed).
- **Authorization** — Organization-scoped data isolation. Platform super-admin role (`isSuperAdmin`) for admin endpoints.
- **Host Authentication** — Unique API tokens for host agent registration and heartbeats.
- **Transport Security** — DTLS 1.3 for P2P media streams, TLS for all control plane traffic.
- **Rate Limiting** — Global request throttling with per-endpoint overrides for sensitive operations.
- **Input Validation** — Strict DTO validation with whitelist mode (unknown properties rejected).
- **Infrastructure** — Non-root Docker containers, Cloud Run with automatic TLS, private Cloud SQL.

## Scope

The following are in scope for security reports:

- Authentication/authorization bypass
- Data exposure across tenant boundaries
- Injection vulnerabilities (SQL, XSS, command injection)
- Cryptographic weaknesses in transport or token handling
- Privilege escalation
- Denial of service via resource exhaustion

## Out of Scope

- Social engineering attacks
- Physical access attacks
- Vulnerabilities in third-party dependencies (report these upstream)
- Issues requiring unlikely user interaction
