# MLocker Implementation Plan

**Project:** [AryanTechie-007/MLocker](https://github.com/AryanTechie-007/MLocker)  
**Status:** Proposed implementation plan  
**Product decisions:** Web + desktop; automatic activity tracking; local-first storage with optional cloud synchronisation.

---

## 1. Product direction

MLocker should evolve into a cross-platform personal media library that helps users organise media, launch their own chosen external sources, automatically record supported activity sessions, and view their consumption history.

### Confirmed decisions

| Decision | Direction |
|---|---|
| **Platforms** | Both web and desktop |
| **Tracking** | Automatic, for supported sources |
| **Storage** | Local-first with optional cloud sync |
| **External content** | User-configured links; MLocker does not host or distribute media |

### Product principles

1. Preserve and improve the existing application. Do not rewrite it without a demonstrated technical reason.
2. Keep the six intended media categories coherent: Movies, TV Shows, Anime, Manga, Games, and Books/Novels.
3. Make the tracking engine independent of any one tracking integration.
4. Treat session time as observed active time, not proof that content was actually watched or read.
5. Keep user data private, scoped to the correct account, and exportable.
6. Build incrementally, with tests and working vertical slices at every milestone.

---

## 2. Current-codebase constraints and known audit findings

The repository has an existing Next.js/React web application, Electron desktop application, Prisma data layer, and SQLite setup. Retain these foundations unless implementation evidence shows they are unsuitable.

The prior source audit identified the following items to verify and address:

- Unauthenticated requests can fall back to a shared guest identity. This must not be used for multiple public users.
- Collection-item association needs to verify that both the collection and media item belong to the same user.
- Electron's database provisioning needs to work on a clean installation. The repository did not appear to contain Prisma migrations, while database files are ignored.
- API payloads need server-side validation for media types, statuses, progress, ratings, and numeric boundaries.
- Publicly embedded API credentials and predictable fallback secrets must be removed or rotated where applicable.
- Manga and Novel support appears incomplete across unified search, filters, manual entry, and library navigation.
- Add/Edit modal state can become stale when the selected item changes while a modal remains mounted.
- Search requests need cancellation or stale-response protection and sensible caching.
- Statistics should move toward database aggregation as data volume grows.
- Existing aggregate time fields should not be treated as the only source of truth once session tracking is introduced.

These are audit findings from source inspection, not claims that the application has been executed or tested. Reconfirm each against the current branch before changing code.

---

## 3. Target architecture

### 3.1 Clients

**Web client**
- Continue using Next.js and React.
- Read and write account data through authenticated backend APIs.
- Support library management, source registration, launching, session history, analytics, and sync status.
- Do not attempt to inspect unrelated browser tabs; normal web pages cannot do this.

**Desktop client**
- Continue using Electron.
- Use a local SQLite database as the primary working copy.
- Support offline library access and queued changes.
- Launch external URLs through the system browser.
- Provide a secure, narrow IPC surface between renderer and main process.
- Keep the database under Electron's application user-data directory, not in a fragile packaged-resource path.

**Browser extension**
- Build a Chromium-compatible extension first, using the WebExtension API where practical.
- Track only user-registered sources and only after explicit permission.
- Detect supported tab activation, focus and idle signals.
- Send minimal activity events to the desktop companion or authenticated backend.
- Do not collect unrelated browsing history, page contents, passwords, form inputs, or credentials.

### 3.2 Backend and persistence

| Layer | Technology |
|---|---|
| Web and API | Existing Next.js application |
| ORM | Existing Prisma |
| Desktop persistence | SQLite |
| Cloud persistence | PostgreSQL |
| Validation | Zod |
| Charts | Existing Recharts setup, if still appropriate |
| Browser activity | WebExtension API |
| Desktop bridge | Electron IPC plus authenticated loopback bridge, if required |

The desktop and cloud databases are separate stores. **Do not synchronise SQLite database files.** Synchronise versioned records and changes through authenticated APIs.

The cloud service should be optional for local-only use. The web application requires cloud access; the desktop application must remain useful offline.

### 3.3 Logical architecture

```text
Web client ───────────────┐
                          ├── Authenticated Next.js API ── PostgreSQL
Electron desktop ─────────┘             ▲
    │                                   │
    ├── Local SQLite                    │
    ├── External browser launcher       │
    └── Secure local bridge ◄── Browser extension
                                       │
                              Activity events
                                       │
                              Session engine
```

The session engine must accept events from multiple providers in the future. The browser extension is one event producer, not the owner of session logic.

---

## 4. Core data model

Adapt names and relations to the existing Prisma schema. Do not paste these sketches blindly; inspect current `UserMedia` and user relations first.

### 4.1 `MediaSource`
Represents a user-configured external destination attached to one media-library entry.

Suggested fields:
- `id`
- `userMediaId`
- `name`
- `url`
- `normalizedDomain`
- `sourceType`
- `createdAt`
- `updatedAt`
- optional URL matching configuration, designed conservatively

Requirements:
- A media item can have multiple sources.
- A source must belong to a media item owned by the same user.
- Only `http` and `https` URLs should be accepted; prefer HTTPS.
- Reject dangerous protocols such as `javascript:`, `data:`, and `file:`.
- Never treat a user-provided URL as trusted HTML or executable content.

### 4.2 `ConsumptionSession`
Represents a bounded period of detected activity.

Suggested fields:
- `id`
- `userMediaId`
- optional `sourceId`
- optional `deviceId`
- `startedAt`
- optional `endedAt`
- `durationSeconds`
- `trackingMethod`
- `status`
- `createdAt`
- `updatedAt`

Use UTC timestamps. Store duration as a derived or periodically updated value with clear rules. Prevent negative durations and overlapping duplicate sessions caused by retries.

### 4.3 `ActivityEvent`
Append-oriented event log for recoverability and diagnostics.

Suggested event types:
- `TAB_ACTIVATED`
- `TAB_DEACTIVATED`
- `WINDOW_FOCUSED`
- `WINDOW_BLURRED`
- `IDLE`
- `ACTIVE`
- `HEARTBEAT`
- `SOURCE_MATCHED`
- `EXTENSION_DISCONNECTED`

Store only the minimum event metadata needed to reconstruct a session. Apply retention limits so this does not become an unnecessary browsing-history database.

### 4.4 `Device`
Identifies a desktop installation or paired extension installation.

Suggested fields:
- `id`
- `userId`
- `deviceType`
- `displayName`
- `createdAt`
- `lastSeenAt`
- `revokedAt`

Use revocable, scoped device credentials. Do not give an extension the user's normal long-lived web session cookie or broad account credentials.

### 4.5 `SyncMetadata` / local outbox
Track pending local mutations and server revisions.

Suggested fields:
- record/entity type
- record ID
- operation type
- local revision
- server revision
- queued timestamp
- retry count
- last error
- idempotency key

Use deletion tombstones so a deleted record does not reappear after another device syncs stale data.

### 4.6 Legacy aggregate fields
Do not abruptly remove existing `hoursPlayed` or similar fields. During migration, preserve compatibility and gradually treat session records as the source of truth:

`totalActiveTime = sum(valid session durations)`

A cached aggregate may be maintained for performance, but it must be rebuildable from sessions.

---

## 5. Tracking behaviour and privacy

### 5.1 What automatic tracking can reliably claim
The first release can detect that a registered source was active in a supported browser context. It cannot generally prove that the user watched a video or read a page.

Use the label **Active session time** or **Tracked activity time**, not verified watch/read time.

### 5.2 Session rules
- A source becomes eligible only when it matches a source explicitly registered by the user.
- Accumulate time only while the relevant tab/window is active and the user is not idle, to the extent the platform exposes those signals.
- Pause when the tab loses focus or the user becomes idle.
- Use periodic heartbeats (initial target: 15–30 seconds).
- Treat missing heartbeats as interruption/disconnection, not proof that activity continued.
- Recover or close orphaned sessions after crashes/restarts.
- Make thresholds configurable and document platform limitations.
- Avoid duplicate sessions when the extension retries an event.
- Provide a visible tracking indicator and global pause/disable control.

### 5.3 Progress tracking
Do not infer episode, chapter, page, or video progress from elapsed time alone.

For the MVP:
- Automatically record active sessions.
- Allow manual progress updates.
- Add content-level progress integrations only for services where a reliable and permitted integration is available.
- Keep manual corrections possible and record progress history.

### 5.4 Privacy and security
- Explicitly request extension permissions and explain why each is needed.
- Track only registered sources.
- Do not collect page text, credentials, form data, unrelated URLs, or general browsing history.
- Minimise stored URL data; prefer domain and approved matching patterns where possible.
- Provide pause, disconnect, delete-session, and data-export controls.
- Validate every extension event on the receiving side.
- Authenticate local bridge requests and restrict them to loopback.
- Validate message origin and extension identity.
- Do not expose Node.js APIs to the Electron renderer.
- Never open arbitrary protocols through Electron's external launcher.

---

## 6. Local-first cloud synchronisation

### 6.1 Behaviour
1. Desktop writes to SQLite first.
2. A local outbox records mutations in the same transaction where possible.
3. When online, the client sends queued changes to the authenticated API.
4. The server validates ownership and applies changes to PostgreSQL.
5. The client records the returned server revision and clears acknowledged outbox entries.
6. Other clients fetch changes since their last known revision.
7. Web reads and writes cloud data through the API.

### 6.2 Conflict policy for the first release
- Merge independent record changes.
- Use explicit deletion tombstones.
- Use last-write-wins for simple scalar fields initially, based on server-accepted timestamps/revisions rather than untrusted client clocks alone.
- Keep sessions append-oriented and use idempotency keys.
- Do not silently discard conflicting progress changes; preserve enough history to resolve or inspect them.
- Make sync retries safe and idempotent.

### 6.3 Sync UX
Expose:
- Online/offline state
- Last successful sync time
- Pending changes count
- Sync error with retry action
- Device list and revoke controls
- Clear local-only versus cloud-synced status

Cloud sync must be optional for desktop users. Do not imply that web access is available without a cloud account.

---

## 7. Implementation milestones

Work in small pull requests. Each milestone must be reviewed and tested before the next one begins.

### Milestone 0 — Repository baseline
**Tasks**
- Inspect the current default branch and recent commits.
- Confirm package scripts, runtime versions, Prisma schema, API routes, Electron packaging and CI configuration.
- Run the existing lint, typecheck, build and test commands where available.
- Record existing failures before making changes.
- Confirm which audit findings still reproduce.

**Acceptance criteria**
- A baseline report exists.
- Existing commands and failures are documented.
- No unrelated refactor is bundled into the baseline.

### Milestone 1 — Security and application stability
**Tasks**
- Remove shared unauthenticated guest identity from public web request paths.
- Define separate, isolated local desktop profile behaviour if guest/local-only mode is retained.
- Enforce ownership on every media, collection, source, and session operation.
- Fix collection-to-media cross-user association.
- Add Zod validation to write APIs.
- Validate enum values, numeric bounds, progress ranges and required fields.
- Remove hardcoded API keys and predictable fallback secrets; rotate exposed credentials where necessary.
- Fix modal state resets and search request races.
- Add regression tests for authorization and validation.

**Acceptance criteria**
- Two test accounts cannot read or mutate each other's records.
- Unauthenticated web requests cannot fall into one shared library.
- Cross-user collection/media association is rejected.
- Invalid payloads return safe 4xx responses.
- No secret is required to be committed to the repository.

### Milestone 2 — Database and desktop reliability
**Tasks**
- Add Prisma migrations for all supported environments.
- Move desktop database storage to Electron's user-data directory.
- Implement first-launch database creation and migration.
- Handle migration failure with a safe, actionable error.
- Verify packaged application includes required Prisma engine/runtime assets.
- Test clean installation, upgrade, restart and backup/restore on a machine without a development database.

**Acceptance criteria**
- A clean desktop install creates a usable database.
- Existing user data survives an application upgrade.
- The application does not depend on a developer's local `prisma/dev.db`.
- Database migration and recovery steps are documented.

### Milestone 3 — Six media categories
**Tasks**
- Trace Manga and Novel support through schema, search integrations, unified search, manual entry, filters, library tabs and detail pages.
- Fix missing integrations and type fall-through.
- Add category-specific progress fields where needed without duplicating the entire media model.
- Add tests for search and CRUD across all six categories.

**Acceptance criteria**
- Users can add, search, edit, browse and track all six categories consistently.
- Unsupported external metadata is handled gracefully.

### Milestone 4 — External source manager
**Tasks**
- Add `MediaSource` and migration.
- Add source CRUD APIs with ownership validation.
- Build source registration and management UI on media detail pages.
- Implement safe URL validation.
- Add external launch action in Electron and web.
- Add source deletion/update behaviour and associated session handling.

**Acceptance criteria**
- A media item can have multiple user-defined sources.
- Only the owner can manage or launch their registered sources.
- Invalid protocols and malformed URLs are rejected.
- Electron opens approved URLs in the system browser.
- Web opens the source in a new tab with safe link attributes.

### Milestone 5 — Session engine and manual tracking foundation
**Tasks**
- Add `ConsumptionSession` and `ActivityEvent`.
- Implement a platform-independent session service.
- Implement idempotent event ingestion.
- Add pause/resume/close/recovery behaviour.
- Add session history to media detail pages.
- Add manual session correction/deletion.
- Add tests for duplicate heartbeats, disconnects, idle transitions, crash recovery and time calculations.

**Acceptance criteria**
- Sessions can be created and recovered without the browser extension.
- Duplicate events do not double-count time.
- Invalid or out-of-order timestamps cannot create negative durations.
- All session records are scoped to the correct user.

### Milestone 6 — Browser extension MVP
**Tasks**
- Create a separate extension package/workspace if appropriate.
- Start with Chromium support.
- Implement pairing and revocable scoped credentials.
- Match only registered source domains/URL patterns.
- Detect tab activation, focus and idle transitions within browser permission limits.
- Send heartbeats and activity events.
- Integrate with the desktop companion and/or authenticated cloud API.
- Add tracking indicator and pause/disable controls.
- Document supported browser versions and known limitations.

**Acceptance criteria**
- Only registered sources are tracked.
- Unrelated browsing activity is not collected.
- A source session pauses on tab deactivation/idle and resumes according to documented rules.
- Extension reconnects do not create duplicate sessions.
- Revoking a device/extension stops its access.

### Milestone 7 — Cloud sync
**Tasks**
- Add PostgreSQL deployment configuration and migrations.
- Implement device registration and revocation.
- Implement local outbox and sync cursor/revision tracking.
- Implement upload/download APIs.
- Add conflict handling, tombstones, retry/backoff and idempotency.
- Add sync status UI.
- Test offline edits and multi-device conflicts.

**Acceptance criteria**
- Desktop works without internet and syncs later.
- Web sees cloud-synced changes.
- Two desktop installations can sync the same account.
- Retried operations do not duplicate records or sessions.
- Deletes do not reappear from stale devices.
- Sync errors are visible and recoverable.

### Milestone 8 — Analytics and quality
**Tasks**
- Add daily/weekly/monthly tracked-time aggregates.
- Add a consumption calendar/heatmap.
- Add per-media session history and total tracked time.
- Add progress history.
- Add export/import and backup/restore.
- Move expensive statistics to database aggregation.
- Add performance, accessibility and end-to-end tests.

**Acceptance criteria**
- Analytics derive from valid sessions and explain what tracked time means.
- User can export and restore their data.
- Large libraries do not require loading every record into the client to calculate simple totals.
- Core web and desktop flows pass regression tests.

### Milestone 9 — Advanced integrations (deferred)
Potential future work:
- Content-level episode/chapter progress integrations where technically and contractually supported.
- Game process/platform integrations.
- Firefox and other browser support.
- More sophisticated recommendations.
- Additional device clients.

Do not block the MVP on these integrations.

---

## 8. Testing strategy

### Automated tests
- Unit tests for URL normalisation, source matching, session calculations, heartbeat handling, sync conflict rules and validation.
- API integration tests for authentication, ownership and cross-user access.
- Database migration tests from an empty database and a previous schema.
- Sync tests for retries, duplicate events, offline edits, tombstones and conflicts.
- Electron tests for IPC permissions, external URL handling and clean database setup.
- Extension tests for permissions, tab lifecycle and source matching.

### Manual release checklist
- Fresh web account registration and login.
- Fresh desktop install on a clean machine.
- Offline desktop use followed by successful sync.
- Same account on web and desktop.
- Two accounts with strict data isolation.
- Multiple sources on one media item.
- Source launch on web and desktop.
- Tracking pauses when the relevant tab is inactive or user is idle.
- Browser/desktop crash does not leave sessions counting indefinitely.
- Extension permission revocation stops tracking.
- Export and restore work.
- No credentials or private browsing data appear in logs.

### CI expectations
At minimum, run:
- Lint
- Typecheck
- Unit tests
- API/integration tests
- Production web build
- Electron packaging smoke test where CI supports it

Do not mark a task complete solely because code was written. Link it to a passing test, a reproducible manual check, or a clearly documented external dependency.

---

## 9. Suggested repository organisation

Adapt this to the current structure rather than forcing a large reorganisation.

```text
src/
  app/
  components/
  lib/
    auth/
    db/
    media/
    sources/
    sessions/
    sync/
    validation/
    tracking/
electron/
  main.js
  preload.js
  tracking/
extension/
  manifest.json
  src/
    background/
    content/
    pairing/
    tracking/
prisma/
  schema.prisma
  migrations/
```

Keep domain logic (source validation, session rules, sync merge rules) outside React components and Electron UI code so it can be tested independently.

---

## 10. Developer working agreement

1. Start by inspecting the current branch; do not assume this plan describes the exact current state.
2. Before implementation, report the relevant existing files, current behaviour, and any discrepancy with this plan.
3. Work milestone-by-milestone and use focused pull requests.
4. Do not perform broad rewrites or introduce microservices without a documented need.
5. Do not commit secrets, real user data, database files, build artefacts, or private browsing data.
6. Include migrations and tests with schema/API changes.
7. Preserve existing functionality unless a change is intentional and documented.
8. Update this plan's checkboxes and implementation notes as work is merged.
9. Report blockers and trade-offs explicitly.
10. Never claim automatic watch/read verification when only active-tab/session signals are available.

---

## 11. Progress tracker

| Milestone | Status | Evidence / PR |
|---|---|---|
| **0. Repository baseline** | In progress | Baseline audit documented; zero code changes made |
| **1. Security and stability** | Not started | |
| **2. Database and desktop reliability** | Not started | |
| **3. Six media categories** | Not started | |
| **4. External source manager** | Not started | |
| **5. Session engine** | Not started | |
| **6. Browser extension MVP** | Not started | |
| **7. Cloud sync** | Not started | |
| **8. Analytics and quality** | Not started | |
| **9. Advanced integrations** | Deferred | |

---

## 12. First developer deliverable

Before writing feature code, produce a short baseline report containing:
1. Current branch and latest commit.
2. Existing scripts and results for lint, typecheck, tests and build.
3. Confirmation of each known audit finding (reproduced, fixed already, or not applicable).
4. Proposed exact files/schema/API changes for Milestone 1.
5. Risks and questions that genuinely block implementation.

Then begin Milestone 1. Do not start the browser extension or cloud-sync implementation before the security and database foundations are stable.
