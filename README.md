# Study Planner

A study planner for school students on CBSE, ICSE and state boards. Students pick their board, class and subjects (adding any the syllabus lacks), mark what has been taught, copy in their school datesheet, add homework, and the planner lays out study blocks around school, tuition and meals, within a daily limit they choose.

- **`backend/`**: REST API for sign-in and the syllabus catalogue. Node.js 22, TypeScript, Express 5, MongoDB (replica set), optional Redis.
- **`frontend/`**: mobile and web app. Expo SDK 58, React Native, React Navigation, Zustand. The planner runs on the device.
- **`adminwebsite/`**: admin portal for boards, classes, subjects and chapters. Vite, React 19, React Router.

**Where data lives.** The server's database holds only logins (name, email, password hash, Google id, role), sign-in sessions, a security audit log, and the shared syllabus catalogue that admins edit. Everything a student enters (profile, subjects, chapters, tests, homework, tasks, focus sessions, streaks, check-ins and settings) is saved only on their phone, in one file per account in the app's documents folder (`frontend/src/data/`). Two students who share a phone each get their own file. At setup the app downloads the board's syllabus once and keeps the student's copy on the phone.

There is no AI or machine learning in the app. Scheduling is deterministic and runs on the phone (see `frontend/src/data/core/engine.js`).

## The app: three pages

The app has three tabs. Plan and Progress each hold two sections behind a segmented control; the avatar in the header opens Profile.

| Page | Sections | What it is for |
| --- | --- | --- |
| **Today** | | Do it: the next test, today's timed plan, suggestions waiting for review, quick add for homework and syllabus, progress rings and streak |
| **Plan** | Plan · Homework | Schedule it: the 14-day strip and each day's timeline, the datesheet, scheduling chapters from the syllabus, homework and the school-bag checklist |
| **Progress** | Progress · Focus & habits | Look back and keep going: coverage, study hours, test readiness and marks, weekly review; focus timer, streak, rest days, check-in, routines and revision nudges |
| Profile | (from the avatar) | Stats, school and tuition timings, daily study slots, appearance, parent summary, sharing the streak, backup and restore, account |

Navigation lives in `frontend/src/navigation/` (`MainTabs.js` for the tabs, `SectionPage.js` for the segmented sections, `RootNavigator.js` for sign-in, setup and modal screens). Other screens open a section with `navigation.navigate('Plan', { section: 'homework' })`.

## Features

| Area | What a student can do |
| --- | --- |
| Account | Sign in (and sign up) with Google only, on Android, iOS and web; stay signed in (rotating refresh tokens), open the plan offline, sign out (the plan stays on the phone), delete the account (the login on the server and the plan on the phone). Email and password sign-in is only for admins, in the admin portal |
| Setup | Write your name (filled in from Google, changeable later in Profile), pick board and class, turn subjects off or add your own (name and chapters), mark chapters already taught, copy in the school datesheet, set school hours, add each tuition with its own days and times (all changeable later in Profile), or load a demo student |
| Datesheet | Add unit tests, periodic tests, the half-yearly or final, or any other exam as one group of papers, each with its own date and syllabus. Unit tests get two weeks of preparation per paper; half-yearly and final exams get one mixed timetable across subjects starting weeks earlier. Edit or remove a paper or a whole exam, see readiness, add marks after a test |
| Plan | 14-day strip, a day laid out around school, tuition and dinner, heavy-day warnings with a suggested move, move tasks |
| Syllabus | Schedule a chapter's study steps on chosen days, update chapter status, add a subject after setup (name and chapters) |
| Homework | Add homework (a task is planned the day before), mark done, delete, school-bag checklist |
| Focus & habits | Focus timer logged to a subject, streak calendar, rest days (2 a week), wellbeing check-in, routines, spaced-revision nudges |
| Progress | Syllabus coverage, study hours against the weekly goal, test readiness, test results with marks, weekly review of slipped tasks |
| Profile | School hours; add, edit or remove tuitions (up to 6, each with a name, days and times); daily Homework and study slots (homework length 30 to 90 min); dark mode; a weekly parent summary sent from the phone (WhatsApp, SMS, email); share the streak with friends; save a backup file and restore it (to move to a new phone); start over |

Admins use the **admin portal** to add boards (state boards included), and to add, rename, reorder, copy and delete each class's subjects and edit their chapters and difficulty. Students get a board's class once it has a subject with chapters. Students who already set up keep their own copy on their phone, so catalogue edits only affect new students. A fresh database starts with the standard CBSE and ICSE syllabus for classes 6 to 12, with book names.

## Run it locally

**Requirements:** Node.js 22, a MongoDB 7 replica set (needed for transactions), and optionally Redis.

```bash
# 1. MongoDB as a single-node replica set (once)
mkdir -p backend/.data/db
mongod --dbpath backend/.data/db --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --fork --logpath backend/.data/mongod.log
mongosh --eval "rs.initiate()"

# 2. API on http://localhost:4000 (Swagger UI at /docs)
cd backend
cp .env.example .env          # then set JWT_ACCESS_SECRET
npm ci
npm run dev

# 3. App
cd ../frontend
npm ci
npm run web                   # or: npm run ios / npm run android
```

On a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN address. See `frontend/.env.example`.

To create an admin account, run `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin` in `backend/`.

```bash
# 4. Admin portal on http://localhost:5173 (sign in with the admin account)
cd adminwebsite
cp .env.example .env.local    # VITE_API_URL, defaults to http://localhost:4000
npm ci
npm run dev
```

`http://localhost:5173` must be in the API's `CORS_ORIGINS` (it is in `backend/.env.example`).

### Google sign-in

1. In Google Cloud console → APIs & Services → Credentials, create OAuth clients:
   - **Web application**: its client ID is the token audience.
   - **Android**: package `com.studyplanner.app` and the SHA-1 of the signing key (`npx eas-cli@latest credentials`). Add the Play App Signing SHA-1 too if you publish to Play.
   - **iOS** (only for iOS builds): bundle id `com.studyplanner.app`.
2. API: set `GOOGLE_CLIENT_IDS` to the web client ID (plus the iOS client ID if used). Without it, `POST /auth/google` answers 503.
3. App: set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (and for iOS `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `GOOGLE_IOS_URL_SCHEME`) in `frontend/.env.local` and in `eas.json` for builds.
4. On Android and iOS, Google sign-in uses native code, so it works in EAS or `expo run` builds, not Expo Go (the button is hidden there).
5. On the web build, Google draws its own "Sign in with Google" button. Add every web address the app runs on (for local work `http://localhost` and `http://localhost:8081`) under **Authorized JavaScript origins** on the Web client, or Google shows nothing.

A Google sign-in with the same verified email as an existing account signs in to that account. New Google accounts have no password; they delete their account without one.

## Quality checks

| | Backend (`backend/`) | Frontend (`frontend/`) |
| --- | --- | --- |
| Lint | `npm run lint` | `npx expo lint` |
| Format | `npm run format:check` | |
| Types | `npm run typecheck` | |
| Tests | `npm test`: unit and integration tests on a real in-memory MongoDB replica set | `npm test`: Jest and React Native Testing Library, including the on-device planner (`src/data/__tests__`) |
| Build | `npm run build` | `npx expo export --platform web` |

The admin portal (`adminwebsite/`) has `npm run lint` (oxlint) and `npm run build`.
| End to end | `npm run smoke` against a running API (`API_URL=…`) | |

The first backend test run downloads a MongoDB binary. To reuse a local install instead, run `MONGOMS_SYSTEM_BINARY=$(which mongod) npm test`, or set `TEST_MONGODB_URI` to point at an existing replica set.

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above and builds the Docker image on every push and pull request. Dependabot keeps dependencies current.

## Deploying

### API

`backend/Dockerfile` builds a small, non-root production image with a health check. `docker-compose.yml` runs the whole stack (MongoDB replica set, Redis, API):

```bash
export JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
docker compose up -d --build
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-pass-1' docker compose run --rm admin
```

Production checklist:

- **Database.** Use a managed MongoDB replica set (for example Atlas) with backups. Indexes are created at start-up. It holds logins, sessions, pending password-reset codes, the audit log and the syllabus catalogue only.
- **Upgrading a database from before plans moved to phones.** Older versions stored students' plans on the server. That data is no longer read, and the app does not copy it to phones. `npm run drop-planner-data` lists what is left; `npm run drop-planner-data -- --yes` deletes it. Take a database backup first if any of it might still be wanted.
- **HTTPS.** Run the API behind a load balancer or reverse proxy that terminates TLS. Set `TRUST_PROXY` to the number of proxy hops so rate limits and audit logs see real client IPs.
- **Forgot-password email.** Set `SMTP_URL` (any SMTP provider, e.g. `smtps://user:pass@smtp.example.com:465`) and `MAIL_FROM`. Without them the app's "Forgot password?" answers that reset isn't set up. Codes have 6 digits, last `PASSWORD_RESET_CODE_TTL_MINUTES` (15), stop after 5 wrong tries, and are stored only as an HMAC.
- **Secrets.** `JWT_ACCESS_SECRET` needs at least 32 random characters and must stay out of git. Staging and production refuse to start with the example value.
- **More than one instance.** Set `REDIS_URL` so rate limits are shared across instances.
- **CORS.** `CORS_ORIGINS` lists the web origins allowed to call the API, or `*` for any origin (safe because auth uses Bearer tokens, not cookies). Native apps send no Origin header and are always allowed.
- **Health probes.** Use `GET /api/v1/health` for liveness and `GET /api/v1/health/ready` for readiness. Readiness returns 503 when MongoDB is down or the server is shutting down. Probes are never rate limited.
- **Logs.** The API writes JSON lines to stdout, each with a request id; tokens, passwords and cookies are redacted.
- **API docs.** Swagger UI is off in production unless `API_DOCS_ENABLED=true`. `npm run openapi:export` writes the spec to a file.

### Mobile and web app

1. Replace the placeholder URLs in `frontend/eas.json` with your real HTTPS API URLs.
2. Build with EAS: `npx eas-cli@latest build --profile production --platform all`.
3. Submit with `npx eas-cli@latest submit`.

For the web build, run `npx expo export --platform web` with `EXPO_PUBLIC_API_URL` set and serve `dist/` from any static host. Add that origin to `CORS_ORIGINS`.

### Admin portal

Run `npm run build` in `adminwebsite/` with `VITE_API_URL` set to the HTTPS API URL. Serve `dist/` from a static host that sends unknown paths to `index.html` (it uses client-side routes), and add its origin to `CORS_ORIGINS`.

## Security model

- Students' plans never leave the phone. The API has no endpoint that accepts or returns them, and no database model for them.
- Passwords are hashed with argon2id at OWASP settings. Sign-in failures take the same time whether or not the email exists.
- Access tokens are short-lived (15 min) HS256 JWTs. Refresh tokens rotate on every use and are stored only as hashes. Replaying an old refresh token revokes that whole login.
- On the device, refresh tokens live in the iOS Keychain or Android Keystore. Access tokens are kept in memory only.
- Every request body, query and parameter is validated with strict Zod schemas, so unknown fields and NoSQL operators are rejected. Every query is scoped to the signed-in student.
- Rate limits apply to sign-in, registration, refresh, password change and reset, and account deletion. Asking for a reset code answers the same whether or not the email has an account. Security events go to an audit log that is kept for 180 days.
- Helmet sets the security headers. Request bodies are capped at 100 kB.

## Known limits

- A plan lives on one phone and does not sync. To move it to a new phone, save a backup in Profile and restore it there. The plan file is included in the phone's own iCloud or Google backup, but uninstalling the app without any backup loses the plan.
- On the web build, the plan is kept in the browser's local storage for that site.
- The parent summary and streak are sent by the student from the phone's share sheet. Nothing is sent automatically, and there are no study groups, because those would need student data on the server.
- Forgot password needs an email server (`SMTP_URL`); without one, students can still change their password while signed in.
- After a password change, an account deletion or an admin role change, an access token that was already issued keeps working until it expires, at most 15 minutes.
- CBSE and ICSE ship with a standard syllabus for classes 6 to 12. Admins load state boards and edit any class from the admin portal.
- After setup, students can add their own subjects, but turning a board subject back on (or off) means starting over.
- Editing a paper keeps the study blocks already planned; schedule more from the syllabus if the date or chapters changed.
