# Primera Admin Portal

Primera's web app is an administrator-only portal for managing patient account basics and auditing administrative activity. Patient registration, authentication, maternal health records, wearable data, check-ins, notifications, and recommendations belong to the Android app and are not exposed here.

## Web scope

Administrators can list, search, view, and edit only these patient account fields:

- name
- username
- email (read-only)
- status
- registration date
- last active

Patient accounts cannot be created in this portal. Status changes update Firebase Authentication, revoke refresh tokens, and create an immutable server-side audit event. Password reset requests never return a password or reset link.

The browser has no direct Firestore read access to `users`. All account, dashboard, and audit data is returned by admin-protected callable functions as a basic-information projection. Clinical and Android-owned shared collections remain outside the web surface.

## Development

Copy `.env.example` to `.env.local`, add the Firebase web configuration, and enable Email/Password sign-in in Firebase Authentication.

```powershell
npm install
npm run build
npm run lint
npm run test:unit
npm run test:rules
```

Do not deploy from this branch during the refactor.

## Backend provisioning

The Functions service uses Firebase Admin credentials from Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`. Provision the administrator account with the operator script; it reads `ADMIN_PASSWORD` from the environment and prompts for `ADMIN_EMAIL` when needed. No credentials or default account identifiers are stored in the repository.

```powershell
cd functions
$env:ADMIN_PASSWORD = "provided-out-of-band"
npm run bootstrap
```

Use `npm run set-role -- <email> admin` only for an existing administrator account. After custom claims change, sign out and sign in again to refresh the ID token.

## Shared Android resources

The web refactor does not delete Android-owned collections, documents, fields, or callable functions. Patient-owner access remains in `firestore.rules`. Doctor/assignment resources and legacy clinical functions are preserved for a separate ownership decision and are not exposed by this portal.

Android must handle disabled accounts during login and session refresh.
