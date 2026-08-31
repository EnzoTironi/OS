# Security Policy

## Supported versions

`main` is the only supported line. There are no versioned releases yet.

## Reporting a vulnerability

Use GitHub private vulnerability reporting:

https://github.com/EnzoTironi/OS/security/advisories/new

Do not open a public issue, pull request, or discussion for a vulnerability.

Include:

- Affected commit SHA or `main` HEAD
- What you can do with it
- Reproduction steps

You should hear back within 7 days. If the report is accepted we will fix it on `main` and credit you unless you ask otherwise.

## Secrets

Do not commit tokens, session cookies, or Fly secrets. Push protection is on. Rotate anything that lands in git history.
