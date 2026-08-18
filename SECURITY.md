# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability in a Skill, release
asset, workflow, or registry record. Use GitHub's **Report a vulnerability**
private reporting flow for this repository. If private reporting is unavailable,
contact the EchoWorker organization maintainers through a private channel and
include the repository name.

Include the affected Skill and version, release URL or commit, expected impact,
reproduction details, and any known SHA-256 digest. Do not include real secrets,
private data, or destructive proof-of-concept payloads.

Maintainers will acknowledge receipt, triage the report, coordinate remediation,
and publish an advisory when appropriate. Response and disclosure timing depends
on severity and contributor availability; no fixed service-level commitment is
made.

## Scope and guarantees

Validation rejects known unsafe repository structures and suspicious content,
and releases include integrity metadata. Review, scanning, registry inclusion,
and SHA-256 verification do not establish that a Skill is safe or trustworthy.

For urgent containment, maintainers can mark affected versions deprecated or
revoked and republish the registry. Historical tags, release records, and
metadata are retained where legally and operationally possible. Published assets
must not be silently replaced.

Please also report workflow permission escalation, action supply-chain issues,
release immutability failures, registry integrity failures, leaked credentials,
and licensing problems.
