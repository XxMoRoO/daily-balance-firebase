# Firebase setup status

- Firebase project: `daily-balance-4165e` (Spark / free)
- Web app: registered and configuration checked into `public/firebase-config.js` (these are public client IDs, not service account keys)
- Google Sign-In: enabled
- Firestore database: Standard, production mode, region `europe-west1`
- Owner-only Firestore rules: published
- Hosting: publish with `firebase deploy --project daily-balance-4165e --only firestore,hosting` from an authenticated Firebase CLI environment, or configure a GitHub Action with a correctly scoped credential.
- Food nutrition dataset: provisional estimates and not fully validated against product labels.
- Do not assume a Hosting deployment is live until the release URL is verified.
