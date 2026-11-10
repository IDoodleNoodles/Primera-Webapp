# Primera Firebase backend

This service owns privileged administrator account operations, custom claims, projections, and immutable audit events. It must run with Firebase Admin credentials and never be called with browser credentials outside the callable interface.

## Provision an administrator

Authenticate with Google Application Default Credentials or set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON path kept outside the repository. Supply the administrator password out-of-band:

```powershell
$env:ADMIN_PASSWORD = "provided-out-of-band"
npm run bootstrap
```

The script prompts for `ADMIN_EMAIL` if it is not set. It creates or updates one administrator account and assigns only the `admin` custom claim. It never writes a password to Firestore or source control.

## Callable security

Admin callables require the `admin` custom claim, an enabled Firebase Auth account, an enabled profile status, and valid App Check. Account data is returned through a six-field projection only. Audit records are written by the server, are immutable from clients, and include successful, failed, unauthorized, login, logout, view, edit, status, password-reset, and export events.

## Shared resources

Android-owned collections and callable functions are preserved. The web portal does not read clinical collections or expose maternal health fields. Do not deploy from this refactor branch.
