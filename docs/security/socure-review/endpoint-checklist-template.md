# Endpoint verification checklist

Status: NOT IMPLEMENTED

No device row is completed. The endpoint control in `endpoint-security-baseline.md`
is NOT YET VERIFIED until every in-scope device has a row with all columns
marked and a verification date.

Fill one row per device. Use Y / N / N-A; add the exception reference from
baseline §8 where a control is N. Do not record serial numbers, hostnames
that reveal personal information, or any credential.

| Device (label) | Holder / role | OS + version | Auto-updates (§2) | Disk encryption (§3) | Screen lock ≤5 min (§4) | Strong device auth (§4) | Anti-malware verified (§5) | Browser current (§6) | No shared account (§7) | Protections enabled (§8) | Verified on | Verified by | Next due |
| -------------- | ------------- | ------------ | ----------------- | -------------------- | ----------------------- | ----------------------- | -------------------------- | -------------------- | ---------------------- | ------------------------ | ----------- | ----------- | -------- |
|                |               |              |                   |                      |                         |                         |                            |                      |                        |                          |             |             |          |
|                |               |              |                   |                      |                         |                         |                            |                      |                        |                          |             |             |          |

Verification steps (macOS reference; adapt for other OSes):

1. Apple menu → About This Mac: confirm the OS version is current or previous major.
2. System Settings → General → Software Update → Automatic Updates: all on.
3. System Settings → Privacy & Security → FileVault: On.
4. System Settings → Lock Screen: require password immediately after screen saver; start after ≤5 minutes.
5. System Settings → Privacy & Security → Security: "App Store and identified developers" (or stricter); `csrutil status` reports enabled.
6. Browser → About: up to date.
7. System Settings → Users & Groups: one account per person; no "Guest" for admin work.

Update this file by pull request so the verification date is evidenced by the commit.
