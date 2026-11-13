# Daily Balance — Firebase Edition

Arabic RTL mobile-first nutrition and home-activity planner. **This repository is deploy-ready but is NOT connected to a Firebase project until the owner adds Firebase configuration and deploys.**

## Features (MVP)
- Daily deterministic varied plans from 16 Egyptian meals (4 breakfast, 5 lunch, 3 snack, 4 dinner)
- Ingredient grams and household estimates, accurate calculations *relative to estimated per-100g values*
- Macro comparison, planned vs actually consumed, 25/50/75/100% logging, manual add, meal swap and rebalancing
- Walk/exercise/habit/sleep tracking; progress/waist/weight logging
- Mobile-first Arabic RTL PWA, demo local mode (localStorage), Google Auth + Cloud Firestore when configured
- Health data is user-owned under `users/{uid}/...` in Firestore, with per-user security rules

## Critical nutrition limitation
**Food numbers are provisional estimates; none of the local-food/macronutrient values have been verified against specific Egyptian brand labels.** UI labels reflect this. Verify food database before using it for medical/precision advice; do not represent it as certified nutrition data. Household measures are approximate. No fish or tomatoes in the seeded meals.

## Local demo (without Firebase)
```bash
cd daily-balance-firebase
python3 -m http.server 8080 --directory public
# open http://localhost:8080
```
Demo uses browser localStorage; **do not use on shared devices**. This is not cloud sync.

## Connect Firebase
1. Create Firebase project at https://console.firebase.google.com/ (free Spark plan is enough for MVP).
2. Project Settings > General > Your apps > Add Web app. Copy app configuration into `public/firebase-config.js`.
3. Authentication > Sign-in method > enable **Google** sign-in. Authorize your Firebase hosting domains under Authentication > Settings > Authorized domains.
4. Firestore Database > Create database (choose a nearby supported region), secure access with `firestore.rules`.
5. Install the Firebase CLI and sign in to the **correct** Google account:
```bash
npm install -g firebase-tools
firebase login
firebase projects:list
firebase deploy --project YOUR_FIREBASE_PROJECT_ID --only firestore,hosting
```
6. Open `https://YOUR_FIREBASE_PROJECT_ID.web.app`. Sign in with Google to activate cloud saving.

### Deployment verification
- Google sign-in redirects/popup works from the deployed domain.
- With a signed-in user, food logs persist across refresh and another device.
- Firestore rules deny any cross-user read/write in tests.
- Browser devtools have no service account keys or admin secrets.

## Tests
```bash
node --test tests/planner.test.mjs
```

## Limitations for later phases
- There is no scheduled background push service: a Firebase Cloud Messaging or job scheduler extension would be required.
- No barcode scan, verified external food API, recipe photo OCR, automatic Apple Health sync, or server-generated analytical insights.
- In demo mode data only lives in that browser. It does not silently migrate to cloud on sign-in.
- A production implementation should add Firestore rule tests with emulators, App Check, delete-account flow, pagination/archiving for large histories, conflict handling for multi-device edits, and automated e2e testing.
- The activity plan is educational. Medical decisions are not provided.