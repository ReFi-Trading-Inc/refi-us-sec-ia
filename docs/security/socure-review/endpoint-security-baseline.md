# Endpoint security baseline

Status: POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING

Owner: Zeshan. Adopted: 2026-09-10.

**Organizational control NOT YET VERIFIED.** No device has a completed row in
`endpoint-checklist-template.md`. Questionnaire answer: "baseline adopted;
verification pending" — becomes YES only when every in-scope device has a
verified row.

Scope: every device used to access the repository with write access, any
cloud console (GCP, Vercel), the Stytch dashboard, or (future) the Socure
dashboard, or to hold `.env.local` values.

## 1. Supported operating system

- A vendor-supported OS release: current or previous major macOS; Windows 11
  with current updates; a supported Linux LTS. End-of-life releases are not
  permitted.

## 2. Automatic security updates

- OS automatic updates on (macOS: Software Update → automatic security
  responses and system files). Updates applied within 14 days of release;
  critical updates within 72 hours.

## 3. Disk encryption

- Full-disk encryption on: FileVault (macOS), BitLocker (Windows), LUKS
  (Linux). Recovery key escrowed in the person's password manager, not on the
  device.

## 4. Screen lock and device authentication

- Screen lock after at most 5 minutes idle; password, Touch ID/Face ID, or
  equivalent required to unlock.
- Strong device login: a unique password of 12+ characters or a passkey /
  biometric backed by a strong password; no shared or guessable device
  passwords.

## 5. Anti-malware

- macOS: built-in XProtect and Gatekeeper, enabled and current, are
  acceptable **if verified** on the device (System Integrity Protection on,
  Gatekeeper "App Store and identified developers" or stricter).
- Windows: Microsoft Defender or equivalent, real-time protection on.
- Linux: no specific product required; package-manager-only software
  installation and no unsigned third-party repositories.

## 6. Browser

- Current stable release of the browser used for console/dashboard access,
  auto-update on. Browser extensions kept to a reviewed minimum on the profile
  used for admin work.

## 7. Accounts

- One user account per person; no shared accounts on any device or service.
- Administrative privileges on the device only when needed; everyday work
  under a standard account where the OS makes that practical.

## 8. Protection must stay on

- Nobody disables disk encryption, the firewall, Gatekeeper/SIP, Defender,
  automatic updates, or screen lock. Temporary exceptions require the owner's
  written approval with an end date and are recorded in the checklist.

## 9. Lost or stolen device

- Report to the owner immediately (`docs/incident-response-runbook.md` §4);
  treat as SEV2, or SEV1 if the device held any RESTRICTED value.
- Remote-wipe if available (Find My / MDM); rotate every credential the device
  could reach (GitHub token, gcloud auth, Vercel, Stytch, password-manager
  master password); revoke device-bound sessions.

## 10. Verification

- Each device is verified against `endpoint-checklist-template.md` on
  enrollment and at least annually, by the device holder with the owner's
  review. Screenshots of settings may be kept privately as supporting
  evidence but are not committed to the repository.
- No MDM is in use; verification is manual and self-attested. State this
  plainly on questionnaires.
