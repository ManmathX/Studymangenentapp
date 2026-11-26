> **3-page variant.** Three tabs: **Today**, **Plan** (Plan · Homework) and **Progress** (Progress · Focus & habits), switched with a segmented control. The avatar opens Profile.
> This copy is not tracked by git and keeps the original keys (`backend/.env`). Run only one backend at a time, or change `PORT` in `backend/.env`.

# Study Planner

A study planner for school students on CBSE, ICSE and state boards. Students pick their board, class and subjects (adding any the syllabus lacks), mark what has been taught, add tests and homework, and the planner lays out study blocks around school, tuition and meals, within a daily limit they choose.

- **`backend/`**: REST API. Node.js 22, TypeScript, Express 5, MongoDB (replica set), optional Redis.
- **`frontend/`**: mobile and web app. Expo SDK 58, React Native, React Navigation, Zustand.
- **`adminwebsite/`**: admin portal for boards, classes, subjects and chapters. Vite, React 19, React Router.

There is no AI or machine learning in the app. Scheduling is deterministic (see `backend/src/modules/planner/planner.engine.ts`).

## Features

| Area | What a student can do |
| --- | --- |
| Account | Sign in with Google (Android and iOS) or email, stay signed in (rotating refresh tokens), change password, sign out, delete the account and all its data |
| Setup | Pick board and class, turn subjects off or add your own (name and chapters), mark chapters already taught, add and edit upcoming tests, set school timings, or load a demo student |
| Today | Next test countdown, today's timed plan, progress rings, streak, suggestions waiting for review, heavy-day warning |
| Plan | 14-day strip, a day laid out around school, tuition and dinner, move tasks |
| Syllabus | Schedule a chapter's study steps on chosen days, update chapter status |
| Tests | Add tests with weight and chapters, edit them, see readiness, remove tests |
| Homework | Add homework (a task is planned the day before), mark done, delete, school-bag checklist |
| Habits | Focus timer logged to a subject, streak calendar, rest days (2 a week), wellbeing check-in, routines, spaced-revision nudges |
| Progress | Syllabus coverage, study hours against the weekly goal, test readiness, weekly review of slipped tasks |
| Settings | Light, dark or system appearance, age mode, exam-season mode, parent-summary preview, study-group preference, start over |

Admins use the **admin portal** to add boards (state boards included), and to add, rename, reorder, copy and delete each class's subjects and edit their chapters and difficulty. Students get a board's class once it has a subject with chapters. Students who already set up keep their own copy, so catalogue edits only affect new students. A fresh database starts with CBSE Class 9 and 10 (NCERT) and an empty ICSE board.

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
4. Google sign-in uses native code, so it works in EAS or `expo run` builds, not Expo Go. The button is hidden in Expo Go and on the web build.

A Google sign-in with the same verified email as an existing account signs in to that account. New Google accounts have no password; they delete their account without one.

## Quality checks

| | Backend (`backend/`) | Frontend (`frontend/`) |
| --- | --- | --- |
| Lint | `npm run lint` | `npx expo lint` |
| Format | `npm run format:check` | |
| Types | `npm run typecheck` | |
| Tests | `npm test`: unit and integration tests on a real in-memory MongoDB replica set | `npm test`: Jest and React Native Testing Library |
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

- **Database.** Use a managed MongoDB replica set (for example Atlas) with backups. Indexes are created at start-up.
- **HTTPS.** Run the API behind a load balancer or reverse proxy that terminates TLS. Set `TRUST_PROXY` to the number of proxy hops so rate limits and audit logs see real client IPs.
- **Secrets.** `JWT_ACCESS_SECRET` needs at least 32 random characters and must stay out of git. Staging and production refuse to start with the example value.
- **More than one instance.** Set `REDIS_URL` so rate limits are shared across instances.
- **CORS.** `CORS_ORIGINS` lists the web origins allowed to call the API. Native apps send no Origin header and are always allowed.
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

- Passwords are hashed with argon2id at OWASP settings. Sign-in failures take the same time whether or not the email exists.
- Access tokens are short-lived (15 min) HS256 JWTs. Refresh tokens rotate on every use and are stored only as hashes. Replaying an old refresh token revokes that whole login.
- On the device, refresh tokens live in the iOS Keychain or Android Keystore. Access tokens are kept in memory only.
- Every request body, query and parameter is validated with strict Zod schemas, so unknown fields and NoSQL operators are rejected. Every query is scoped to the signed-in student.
- Rate limits apply to sign-in, registration, refresh, password change and account deletion. Security events go to an audit log that is kept for 180 days.
- Helmet sets the security headers. Request bodies are capped at 100 kB.

## Known limits

- Parent weekly summaries are a preview only. Nothing is sent yet, because that needs an email or push provider.
- Study groups are a saved preference; the groups themselves are not built yet.
- There is no "forgot password" email yet. A student who is signed in can change their password.
- After a password change, an account deletion or an admin role change, an access token that was already issued keeps working until it expires, at most 15 minutes.
- Only CBSE Class 9 and 10 ship with a syllabus. Admins load other boards and classes from the admin portal.
- Students choose their subjects at setup only; adding a subject later means starting over.
- Editing a test keeps the study blocks already planned.
