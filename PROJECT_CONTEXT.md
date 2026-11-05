# DIWALI FUN PLAY — PROJECT CONTEXT & ARCHITECTURE GUIDE

## 1. Project Purpose & High-Level Architecture
**Diwali Fun Play** is a full-stack, dual-interface festive motion game prototype designed for large 65-inch kiosk displays and mobile browser interaction.
- **Kiosk Display (`/`)**: A single-player, gesture-driven motion game. Using a camera feed and MediaPipe hand tracking, players calibrate their hands and burst festive firecrackers (chakris, rockets, sparklers, anaars) within a 35-second timed round. At the end, a webcam snapshot is captured and a commemorative souvenir greeting card is generated.
- **Mobile Registration (`/register`)**: Players scan a QR code on the kiosk to register their name and 10-digit mobile number, generating a unique 4-digit code to unlock a game round on the kiosk.
- **Admin Management Console (`/admin`)**: A password-protected operations portal to view live telemetry, manage player records, inspect game sessions, customize branding/wallpapers, and manage media assets.

### Technology Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Motion (Framer Motion), Lucide React, HTML5 Canvas 2D, Web Audio API (native synthetic sound synthesis).
- **Computer Vision**: `@mediapipe/tasks-vision` (HandLandmarker) running client-side via WebAssembly/CDN.
- **Backend / Server**: Node.js, Express 4, `cookie-parser`, `multer` (in-memory buffer parsing for media validation), Vite integrated as development middleware.
- **Persistence**: Pluggable storage architecture supporting a local atomic JSON file adapter (`data/db.json`) for dev and MongoDB Atlas for production. Binary assets support local filesystem storage (`data/uploads/`) or Google Cloud Storage (GCS).

---

## 2. Key Source File Paths & Responsibilities

### Server & Storage
- `server.ts`: Server entry point. Initializes storage adapter, runs admin bootstrap check, mounts Express middleware (cookies, CORS, 10MB body limit), mounts `/api` routes, and configures Vite middleware (dev) or dist static serving (prod).
- `server/storage/index.ts`: Storage abstraction entry point. Selects either `MongoStorageAdapter` or `JsonFileStorageAdapter` depending on whether `MONGODB_URI` is configured.
- `server/storage/types.ts`: TypeScript contracts for `StorageAdapter` methods and data structures.
- `server/storage/jsonAdapter.ts`: Atomic JSON file storage implementation (`data/db.json`), writes via temp file renaming.
- `server/storage/mongoAdapter.ts`: MongoDB persistent adapter with collection indexes and upsert operations.
- `server/storage/migration.ts`: Idempotent data migrator from `data/db.json` into MongoDB using `$setOnInsert`.
- `server/storage/assets/`: Binary asset storage layer (local filesystem provider in `localProvider.ts`, GCS provider in `gcsProvider.ts`, and magic-byte security validation in `validation.ts`).

### Authentication & API Routes
- `server/auth/password.ts`: Cryptographic password hashing using native Node `crypto.scrypt` (`scrypt:salt:keyHex`), verification with `timingSafeEqual`, username normalization, and password complexity enforcement (min 10 chars, digits/special characters).
- `server/auth/middleware.ts`: Admin session verification via HTTP-only cookie (`diwali_admin_session`) or Bearer token; RBAC (`requireRole`), and in-memory brute-force rate limiter (5 failed attempts locks for 15 minutes).
- `server/auth/bootstrap.ts`: Startup check to auto-create superadmin from environment variables if zero admins exist.
- `server/routes/api.ts`: Core API router mounting health checks, public settings, user registration, kiosk code verification, game session lifecycle, and analytics queries.
- `server/routes/adminAuth.ts`: Admin setup, login, logout, profile (`/me`), admin user creation, and audit logs.
- `server/routes/assets.ts`: Protected admin asset upload/list/update/delete and public streaming delivery (`/api/assets/:id/content`).

### Frontend Architecture
- `src/main.tsx`: React root mounter.
- `src/RootRouter.tsx`: Lightweight path router matching `/admin*` (AdminApp), `/register*` (MobileRegistrationPage), and default `/` (Kiosk App).
- `src/App.tsx`: Main kiosk application state coordinator: camera lifecycle, calibration, countdown sequence, 35s timer loop, snapshot capture, and game-over modal.
- `src/hooks/useHandTracking.ts`: Core vision hook managing webcam stream, MediaPipe `HandLandmarker` loop, landmark extrapolation, hand velocity, gesture recognition, and audio triggering.
- `src/components/KioskStartupScreen.tsx`: Initial kiosk idle state displaying QR code, on-screen numeric keypad, and 4-digit code verification. Camera remains off until code is verified.
- `src/components/MobileRegistrationPage.tsx`: Mobile registration view with name/phone validation and 4-digit code display.
- `src/components/GameOverModal.tsx`: The single game-over screen: photo, achievement, wish and souvenir card download on the left; score, embedded spin wheel, one-tap feedback and Play Again on the right.
- `src/components/SpinWheel.tsx`: The spin wheel itself (drawing, animation, sounds, spin API call), used by the game-over screen and the admin preview (`SpinWheelModal.tsx`).
- `src/services/api.ts`: Frontend HTTP client for gameplay (`gameApi`) and admin operations (`adminApi`).
- `src/admin/AdminApp.tsx`: Admin console root handling session check, section navigation, and telemetry data loading.
- `src/admin/AdminLogin.tsx`: Admin login and initial setup form with feedback messages.
- `src/admin/sections/`: Modular dashboard views (`OverviewSection`, `PlayersSection`, `SessionsSection`, `BrandingSection`, `WallpapersSection`, `SoundStudioSection`, `CrackerStudioSection`, `GameSettingsSection`, `ReportsSection`, `WishesSection`).

---

## 3. Important User Flows & API Routes

### 1. Player Registration & Game Code Flow
1. Player opens `/register` on mobile device (or scans QR from Kiosk).
2. Submits name and 10-digit mobile number (`POST /api/register`).
3. Backend validates player name and Indian mobile format. If user already played (`hasPlayed: true`), request is blocked. If user has active unused code, returns existing code; otherwise generates a new 4-digit code (`1000`-`9999`).
4. Player types 4-digit code on Kiosk numeric keypad (`POST /api/kiosk/verify-code`).
5. Backend verifies code is active, marks code as `USED`, sets `hasPlayed: true`, creates an initial game session, and returns user profile.
6. Kiosk unlocks, enables webcam, and enters alignment phase.

### 2. Gameplay Lifecycle
1. **Calibration (`IDLE`)**: Player aligns both hands in marked left and right target boxes for 1.0 second continuously.
2. **Countdown (`COUNTDOWN`)**: 3 -> 2 -> 1 -> GO! sequence with audio cues. Calls `POST /api/session/start`.
3. **Playing (`PLAYING`)**: 35-second timer runs using `performance.now()`. Fast hand motions trigger cracker bursts, combos, and sound effects.
4. **Game Over (`GAME_OVER`)**: At 0s, camera snapshot is captured (`captureWebcamSnapshot()`), fanfare audio plays, and `POST /api/session/complete` transmits final stats (score, cracker count, max speed, combos, photo).
5. **Souvenir Card**: Player views celebratory card with achievement tier, personalized festive wish, and can download the PNG.
6. **Reset**: Clicking "Play Again" completely shuts down camera stream, wipes all session memory, and resets kiosk to Startup Screen.

### 2b. Special Trial Code (8536)
- **Code**: `8536` (`TRIAL_CODE` constant).
- **Purpose**: Direct offline/demo/testing play directly from the kiosk without mobile registration.
- **Zero-Persistence Guarantee**: Bypasses all MongoDB/JSON database operations. Does NOT create or save any player entry, code, game session, score, photo, or audit log.
- **Reusability**: Can be entered repeatedly without expiration or one-time play lock.
- **Isolation**: Normal code generator skips `8536` so no mobile registration can collide with it. Normal code verification and session lifecycles remain completely untouched.

### 3. Admin Authentication & Management Routes
- `POST /api/admin/auth/setup`: One-time setup endpoint. Only succeeds when 0 admins exist in storage.
- `POST /api/admin/auth/login`: Authenticates username/password; sets HTTP-only cookie and returns Bearer token.
- `POST /api/admin/auth/logout`: Invalidates session and clears cookie.
- `GET /api/admin/auth/me`: Validates active session and returns admin role.
- `POST /api/admin/auth/users`: Superadmin-only creation of secondary admin/operator accounts.
- `GET /api/admin/overview`: Aggregated telemetry stats (users, sessions, averages, leaderboard).
- `GET /api/admin/users`: List registered players.
- `GET /api/admin/sessions`: List all game sessions with scores and photos.
- `GET /api/settings` & `POST /api/settings`: Read and update system settings (brand name, duration, logo URL).
- `GET /api/admin/assets` & `POST /api/admin/assets/upload`: List and upload media assets with magic-byte verification.

---

## 4. Storage & Database Behavior
- **Adapter Detection (`server/storage/index.ts`)**:
  - If `MONGODB_URI` environment variable is defined: Initializes `MongoStorageAdapter`.
  - Database name resolution: The adapter connects without an explicit `dbName` parameter, delegating to the database name specified in the connection string path (defaults to `'test'` if path omitted).
  - On connection, `migrateJsonToMongo()` automatically creates a timestamped backup in `data/db.backup.<timestamp>.json` and performs an idempotent upsert (`$setOnInsert`) of users, codes, sessions, settings, admin users, and audit logs from `data/db.json`.
  - If `MONGODB_URI` is absent: Operates using `JsonFileStorageAdapter` storing data in `data/db.json`.
- **Write Mechanism**: `JsonFileStorageAdapter` serializes the in-memory database object and writes atomically using a temporary file (`db.json.tmp.<timestamp>`) followed by `fs.renameSync` to prevent corruption.
- **Asset Storage**: Managed by `server/storage/assets/`. If `GCS_BUCKET_NAME` is configured, uploads go to Google Cloud Storage. In local dev, uploads are stored on disk in `data/uploads/`.

---

## 5. Admin Authentication Design & Current Login Issue Investigation

### Current Login Issue Root Cause Analysis
During this audit, the admin login issue was investigated without changing files or resetting passwords. Code tracing revealed three compounding factors:

1. **`.env` is NOT Loaded by the Server**:
   - `server.ts` does not call `dotenv.config()` or import `dotenv/config`.
   - Node and `tsx` execution (`npm run dev` / `npm start`) do not load variables from `.env` by default.
   - Consequently, `process.env.INITIAL_ADMIN_USERNAME` and `process.env.INITIAL_ADMIN_PASSWORD` are `undefined` at runtime unless injected by the shell environment.
2. **Bootstrap Bails Out When Any Admin Exists**:
   - In `server/auth/bootstrap.ts`, line 21:
     ```ts
     const existingAdmins = await db.getAllAdminUsers();
     if (existingAdmins.length > 0) return;
     ```
   - If an admin account already exists in the database, `bootstrapAdmin()` exits immediately. It does not update existing accounts or overwrite credentials from `.env`.
3. **Existing Accounts from Automated Test Runs**:
   - Inspection of `data/db.json` showed that admin accounts already exist (`superadmin` and `event_operator_1`), created during previous execution of test scripts (`scripts/test-phase2-http.ts`).
   - When attempting "First-time setup" on `/admin`, the API correctly returns HTTP 403 `ALREADY_INITIALIZED` because admin users exist.
   - When attempting login with credentials specified in `.env`, the login is rejected because the password in `.env` does not match the test password hashed in `data/db.json`.
   - After 5 failed login attempts on the same IP/username, the in-memory rate limiter locks login for 15 minutes (`HTTP 429 TOO_MANY_ATTEMPTS`).

### Password Reset / Recovery Status
- **No Password Reset Mechanism Exists**: The codebase has no reset API route, no token flow, and no CLI reset utility.
- **Safest Recovery Procedure (For Next Task)**:
  - Do NOT wipe `data/db.json`, as it contains player registration records, game codes, and session scores.
  - Implement a dedicated non-destructive recovery utility (or migration script) that safely updates only the `adminUsers` record's `passwordHash` using `hashPassword()` while preserving all existing player records and settings.
  - Ensure `dotenv/config` is properly integrated in `server.ts` so environment variables are reliably loaded.

---

## 6. Commands to Run, Build, and Test
- **Start Development Server**: `npm run dev` (`tsx server.ts` — serves both API and Vite frontend on port 3001).
- **Type Checking / Linting**: `npm run lint` (`tsc --noEmit`). Verified: zero TypeScript errors.
- **Production Build**: `npm run build` (`vite build` — outputs static bundle to `dist/`).
- **Production Run**: `npm run start` (`node server.ts` — serves API and static dist assets).
- **Clean Build Artifacts**: `npm run clean` (`rm -rf dist server.js`).
- **Test Scripts in `scripts/`**:
  - `scripts/test-phase1-storage.ts`: Unit test for storage adapters and session fixes.
  - `scripts/test-phase2-auth.ts`: Password hashing and storage auth unit test (*Warning: mutates `data/db.json`*).
  - `scripts/test-phase2-http.ts`: Integration test for auth endpoints (*Note: expects server running on port 3000*).
  - `scripts/test-phase3-admin-ui.ts`: Admin UI delivery test (*Note: expects server running on port 3000*).
  - `scripts/test-phase4a-assets.ts`: Asset upload security and magic-byte tests (*Note: expects server on port 3000*).

---

## 7. Known Limitations, Warnings & Migration Status
1. **Environment Configuration**: `server.ts` now loads `import 'dotenv/config'` on line 1 with DNS server fallback (`8.8.8.8`, `1.1.1.1`) for reliable Atlas SRV resolution on Windows.
2. **MongoDB Atlas Migration Completed**: Cleaned local data was successfully migrated into `diwali_fun_play` database on MongoDB Atlas `Cluster0` via `scripts/migrate-to-mongodb.ts`. Document counts across all eight collections were verified:
   - `users`: 15
   - `game_codes`: 15
   - `game_sessions`: 13
   - `system_settings`: 1
   - `admin_users`: 2
   - `admin_sessions`: 8
   - `assets`: 4
   - `audit_logs`: 62
3. **Storage Adapter Selection**: `server/storage/index.ts` automatically switches to `MongoStorageAdapter('diwali_fun_play')` when `MONGODB_URI` is present in `.env`.
4. **Hardcoded Port Differences**: `server.ts` defaults to port `3001` (`process.env.PORT || 3001`), whereas test scripts in `scripts/` hardcode `http://localhost:3000`.
5. **In-Memory Brute Force Map**: `loginAttempts` in `middleware.ts` is in-memory. In multi-container environments, rate limiting is per-container and resets on process restart.
6. **WishesSection Incomplete / Placeholder**: `src/admin/sections/WishesSection.tsx` displays static achievement tiers and template tags, noting that custom template visual editing is scheduled for Phase 4.
7. **Test Script Isolation**: `test-phase2-auth.ts` instantiates `JsonFileStorageAdapter` directly without an isolated file path, writing test accounts directly into the main `data/db.json`.
8. **CDN Dependency for MediaPipe**: Hand tracking requires internet access to download `@mediapipe/tasks-vision` wasm assets from `cdn.jsdelivr.net`.
9. **Cloud Run Ephemeral Storage Notice**: When running on Cloud Run without `GCS_BUCKET_NAME`, file uploads write to container filesystem `data/uploads/` which does not persist across container scale-down or deployment.

---

## 8. Important Safety Constraints for Future Changes
- **Preserve Existing Records**: Never delete or overwrite `data/db.json` completely. Any administrative reset or schema update must be surgical and preserve existing users, game codes, sessions, and audit logs.
- **Never Log Secrets**: Passwords, derived scrypt hashes, and raw session tokens must never be logged or exposed in API responses.
- **Preserve Real-Time Performance**: The vision loop in `useHandTracking.ts` runs at 30-60 FPS; avoid heavy re-renders or allocations inside `requestAnimationFrame`.
- **Maintain Single-Chance Integrity**: Mobile registration must strictly enforce `hasPlayed` to maintain fairness during live kiosk deployment.

---

## NEXT SESSION INSTRUCTIONS
1. **Read this file (`PROJECT_CONTEXT.md`) first** before executing any commands or making code modifications.
2. **Inspect only files directly relevant to the specific user request**; avoid broad scanning of vendor or generated files.
3. **Verify current code state** before making assertions or assumptions.
4. **Avoid broad, unsolicited refactors**; keep changes targeted, minimal, and backward-compatible.

