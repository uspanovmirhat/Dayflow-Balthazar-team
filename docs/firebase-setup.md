# Firebase Setup

## Local configuration

1. In Firebase Console, confirm Email/Password is enabled under Authentication sign-in providers.
2. In Project settings, register a Web App and copy its Firebase Web config values into a local `.env` file at the repository root.
3. Use `.env.example` as the variable-name template. Replace each placeholder with that project’s Web config value. Do not place Admin SDK or service-account credentials in this app.
4. Start the Vite app with `npm run dev`. The Firebase config is initialized on the first backend call.

The existing `.gitignore` excludes `.env` and `.env.*` while allowing `.env.example`. Firebase Web config identifies the client app; Firestore Security Rules, not secrecy of the API key, protect user data.

## Local emulators

Install JDK 21 or later for the current Firebase CLI Firestore emulator. If multiple Java installations exist on Windows, verify `java -version` reports JDK 21 and put that JDK's `bin` directory before older Java shims in the current terminal's `PATH`. Copy the example env file to `.env.local`, set `VITE_USE_FIREBASE_EMULATORS=true`, and keep the default emulator addresses unless they conflict locally. Do not use emulator mode against production data.

Run Rules tests with:

```sh
npm run test:rules
```

The Firebase CLI starts the Firestore emulator for this command and shuts it down afterward. Test contexts simulate authenticated users; the tests do not need a real Firebase project or credentials.

## Hosting

`firebase.json` serves the Vite `dist` output and rewrites client-side routes to `index.html`. Build first with `npm run build`, then deploy with `firebase deploy --only hosting --project YOUR_PROJECT_ID` after selecting the intended Firebase project.

## Production setup

Deploy Firestore rules and indexes from a trusted Firebase CLI session:

```sh
firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

Review the target project ID before deployment. This repository does not deploy automatically or contain production credentials. Hosting/PWA deployment remains a separate project setup step.
