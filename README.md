# Primera

Primera is an AI-assisted pregnancy support platform designed to improve maternal health monitoring, engagement, and clinical oversight through smartwatch data, voice input, and personalized goals.

## Project focus

The system combines a patient-facing mobile experience with a clinical web portal that supports the care team:

- patient app: pregnancy tracking, symptom reporting, smartwatch health data, and personalized daily goals
- web admin portal: system oversight, assignment management, and operational monitoring
- doctor / OB-GYN portal: assigned patient review, risk monitoring, and clinical workflow support

## Why it matters

Pregnancy care often depends on fragmented data from check-ins, wearable devices, and patient-reported symptoms. Primera brings these signals together into a more proactive and supportive workflow for both patients and clinicians.

## Key features

- smartwatch-based health trend monitoring
- voice and conversational input for symptom and check-in updates
- AI-assisted personalization of pregnancy support goals
- risk-based tracking and alert workflows
- role-based access for admins, doctors, and patients
- clinical dashboards for assigned patient review and oversight

## Architecture

This repository contains the web-side clinical layer for the Primera platform.

- Android app: completed patient-facing experience
- Web app: admin and doctor/OB-GYN portal
- Backend: Firebase Authentication, Firestore, and Cloud Functions for shared auth, data access, and role enforcement

## Current status

This web app uses Firebase email/password authentication and resolves admin or OBGYN access from `users/{uid}`. Copy `.env.example` to `.env.local`, add the Firebase web configuration, and enable Email/Password sign-in in Firebase Authentication.

Roles are issued as Firebase Authentication custom claims by the backend. The `functions/` service includes admin-only callable functions for creating staff accounts, changing account status, resetting passwords, and writing audit logs. The production admin and OBGYN dashboards use the role and assignment-aware Firestore rules in `firestore.rules`.

### Backend setup

Install and build the Functions service:

```powershell
cd functions
npm install
npm run build
```

For the one-time initial accounts, authenticate the Firebase Admin SDK with Google Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`, then set passwords in the shell and run the bootstrap script:

```powershell
$env:ADMIN_PASSWORD = "your-admin-password"
$env:DOCTOR_PASSWORD = "your-doctor-password"
npm run bootstrap
```

The default bootstrap emails are `primera_admin@email.com` and `primera_doctor@email.com`. The script sets the `admin` and `doctor` custom claims and creates their profile documents. Never commit service-account JSON files or passwords.

Deploy from the project root with `firebase deploy --only functions,firestore`.

The current dashboard records remain prototype fallback data only when Firebase web config is missing. Live dashboards no longer substitute sample patients after a Firestore error.

## Summary

Primera is a maternal health platform that helps pregnant users stay supported and informed while giving clinicians and administrators the tools to monitor patients safely and efficiently.
