# Primera Firebase backend

This service owns privileged account management and custom claims. It must run with Firebase Admin credentials, never in the browser.

## Initial admin and OBGYN accounts

1. Install dependencies: `npm install`
2. Authenticate with Google Application Default Credentials or set `GOOGLE_APPLICATION_CREDENTIALS` to a local service-account JSON path.
3. Set the passwords in the shell without committing them:

```powershell
$env:ADMIN_PASSWORD = "your-admin-password"
$env:DOCTOR_PASSWORD = "your-doctor-password"
```

For a downloaded service-account file, set the path without copying the file into this repository:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\YourName\Downloads\new-service-account.json"
```

Service-account JSON files contain private keys. Keep them outside the repository and revoke any key that has been shared publicly.

4. Bootstrap the accounts:

```powershell
npm run bootstrap
```

The default emails are `primera_admin@email.com` and `primera_doctor@email.com`. Override them with `ADMIN_EMAIL` and `DOCTOR_EMAIL` if needed.

## Assign a role to an existing user

If the user already exists in Firebase Authentication, assign the custom claim by email:

```powershell
npm run set-role -- primera_admin@email.com admin
npm run set-role -- primera_doctor@email.com doctor
```

This updates the Firebase Auth custom claim and the matching `users/{uid}` profile. Sign out and sign in again afterward so the browser receives the refreshed ID token.

## Deploy

From this directory, run `npm install`, then from the project root run:

```powershell
firebase login
firebase deploy --only functions,firestore
```

Callable functions include `createStaffAccount`, `setStaffAccountStatus`, `resetStaffPassword`, and `writeAuditLog`. Patient profiles created by the admin portal are marked `activationStatus: pending` until an administrator explicitly activates onboarding. Only an authenticated user with the `admin` custom claim can create, disable, or reset staff accounts.
