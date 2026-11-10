# Primera Admin Portal

The Primera web app is an administrator-only portal on the Firebase Spark plan. The deployed app uses only Firebase Authentication (email/password), Cloud Firestore, and Firebase Hosting. It does not use Cloud Functions, the Admin SDK, App Check enforcement, Cloud Scheduler, or paid APIs.

## Web scope

Administrators can list, prefix-search, view, and edit only `accountSummaries/{uid}`. The summary contains `name`, `username`, `email`, `status`, `createdAt`, `lastActive`, `nameLower`, and `emailLower`. The portal never reads `users` or clinical collections. Patient registration and health data remain Android-owned.

Status changes update only the summary. Android must enforce `status` at login and app start; the web portal cannot disable Firebase Authentication users. Password reset uses the client SDK to send recovery instructions to the stored email and never displays a password.

## Provision the first administrator

1. In Firebase Console, open **Authentication > Users**, choose **Add user**, and create the administrator's email/password account.
2. Copy the user's Auth UID.
3. Open **Firestore Database > Data**, create the `admins` collection, and create a document whose ID is exactly that UID.
4. Set the document field `active` to the boolean `true` (not the string `"true"`).
5. Do not grant the web app access to `users`; administrators are authorized only by the active `admins/{uid}` document.

Admin documents are provisioned manually. Clients cannot create, update, or delete them.

## Development and emulator checks

Copy `.env.local.example` to `.env.local`, add the Firebase web configuration, and enable Email/Password sign-in. For local checks, set `VITE_USE_EMULATORS=true`; the app uses the `demo-primera` Auth and Firestore emulators.

```powershell
npm install
npm run build
npm run lint
npm run test:unit
firebase emulators:exec --only firestore --project demo-primera "npm run test:rules"
```

Failed logins by unauthenticated users are not written to `auditLogs`: Firestore rules cannot safely authenticate and attribute such writes without a backend, and unauthenticated audit writes remain closed.

## Account-summary backfill

The local-only operator script uses a service-account JSON supplied through the environment and copies only the allowed summary fields. It is never bundled into Hosting and must not be committed.

```powershell
$env:FIREBASE_PROJECT_ID = "your-approved-project-id"
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content .\service-account.json -Raw
npm run backfill:account-summaries -- --dry-run
npm run backfill:account-summaries
```

For emulator testing only, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_PROJECT_ID=demo-primera`. The script refuses mismatched emulator variables. Do not run this script as part of the build or deployment.

## Smoke test

- Sign in with the provisioned admin and confirm the overview counts and latest audit entries.
- Open the account table, search by a name and email prefix, and move to the next page.
- Edit name/username; confirm email remains read-only.
- Disable and re-enable an account; confirm the status audit entries.
- Request a password reset; confirm only a recovery-email confirmation is shown.
- Open the audit log, filter it, and export CSV; confirm the export records only filter and row count.
- Attempt login with a non-admin Auth user and confirm portal access is rejected and the user is signed out.
