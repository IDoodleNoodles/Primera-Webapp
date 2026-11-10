# Android account summary contract

The Android app owns patient registration and must create or maintain exactly these fields in `accountSummaries/{uid}`:

- `name`
- `username`
- `email`
- `status` (`active` or `disabled`)
- `createdAt`
- `lastActive`
- `nameLower`
- `emailLower`

`nameLower` and `emailLower` must be lowercase copies used for the administrator's prefix search. The web portal never reads `users` documents and cannot disable a Firebase Authentication user.

Android must check `status` at login and at every app start/session refresh. A `disabled` summary must prevent access even though the Firebase Authentication account remains enabled.
