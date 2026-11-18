---
name: secure-development
description: Security guidelines, authentication enforcement, tenant isolation, input validation, and credential hygiene across MLocker web, desktop, and extension components.
---

# MLocker Secure Development Skill

## 1. Zero Trust & Tenant Isolation Principles

Every request and data mutation in MLocker must adhere to strict tenant isolation and authentication standards.

### 1.1 Ban Shared Guest Identity Fallbacks
- **Previous Finding:** Insecure fallback to a hardcoded or global `"guest"` user identifier allowed unauthorized writes and shared data pools.
- **Strict Rule:** Any unauthenticated write or mutation request must immediately return `401 Unauthorized`.
- **Guest Mode:** If an offline or guest desktop experience is supported, it must be stored strictly within the local SQLite instance and never written or synced to the cloud PostgreSQL database without authenticated account onboarding.

### 1.2 IDOR Prevention & Relational Ownership Checks
When modifying resources (e.g., adding an item to a collection, deleting a session, updating metadata):
1. Verify the parent resource belongs to `session.userId`.
2. Verify the child resource also belongs to `session.userId`.
3. Never trust IDs passed in request bodies without validating relational ownership in Prisma:

```typescript
// SECURE: Enforcing user ownership across both relations
const collection = await prisma.collection.findFirst({
  where: { id: collectionId, userId: session.userId }
});
if (!collection) throw new ForbiddenError("Collection not found or access denied");

const mediaItem = await prisma.mediaItem.findFirst({
  where: { id: mediaItemId, userId: session.userId }
});
if (!mediaItem) throw new ForbiddenError("Media item not found or access denied");
```

---

## 2. Server-Side Input Validation (Zod)

Every incoming API payload and IPC message must be strictly validated at the runtime boundary using Zod schemas.

### 2.1 Validation Rules
- **Enums:** Validate media category (`MOVIE`, `TV_SHOW`, `ANIME`, `MANGA`, `GAME`, `BOOK`), status (`PLAN_TO_WATCH`, `IN_PROGRESS`, `COMPLETED`, `DROPPED`, `ON_HOLD`).
- **Numeric Limits:** Non-negative integers for ratings (e.g., 0 to 10 or 0 to 100), progress counts, durations, and release years.
- **Strings:** Strip control characters, enforce max lengths on titles, notes, and tags to prevent denial-of-service.
- **URLs:** Validate external source links against permitted protocols (`http:`, `https:`) and reject `javascript:` or `data:` URLs.

```typescript
export const MediaItemCreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  category: z.enum(['MOVIE', 'TV_SHOW', 'ANIME', 'MANGA', 'GAME', 'BOOK']),
  status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'PAUSED', 'DROPPED']),
  rating: z.number().int().min(0).max(100).nullable().optional(),
  progress: z.number().int().min(0).default(0),
  totalUnits: z.number().int().min(0).nullable().optional(),
  externalUrl: z.string().url().max(2048).nullable().optional(),
});
```

---

## 3. Credential & Secret Hygiene

1. **Zero Hardcoded Secrets:** Never commit API keys, signing secrets, database credentials, or auth tokens to Git.
2. **Environment Variable Separation:**
   - Server-only secrets (`DATABASE_URL`, `NEXTAUTH_SECRET`, `METADATA_API_KEY`) must never be prefixed with `NEXT_PUBLIC_`.
   - Desktop application secrets must not be baked into the unpacked distribution bundle.
3. **Safe Fallbacks:** Never provide default production keys or weak placeholder secrets in source code. Throw a clear startup configuration error if required environment variables are absent.

---

## 4. Electron Desktop Hardening

Electron runs with native operating system privileges. The renderer process must be completely isolated from Node.js APIs.

### 4.1 Window Configuration Checklist
```javascript
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,       // MUST be true
    nodeIntegration: false,        // MUST be false
    nodeIntegrationInWorker: false,
    sandbox: true,                 // MUST be true
    webSecurity: true,             // MUST be true
    allowRunningInsecureContent: false,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### 4.2 Safe IPC Communication
- Whitelist all IPC channels in `preload.js`.
- Never expose `ipcRenderer.send` or `ipcRenderer.on` directly to the `window` object.
- Never pass raw SQL strings, shell commands, or arbitrary file system paths over IPC.
- Validate all incoming IPC parameters inside the Main process using Zod before invoking underlying file or database operations.

### 4.3 External URL Handling
When launching external media links:
```javascript
// SECURE: Validate URL protocol before launching via default OS browser
ipcMain.handle('launch-external-url', async (event, rawUrl) => {
  const parsed = new URL(rawUrl);
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    await shell.openExternal(parsed.href);
  } else {
    throw new Error('Invalid URL protocol');
  }
});
```

---

## 5. Extension Security & Privacy

1. **Least-Privilege Permissions:** Request only required WebExtension permissions. Avoid broad `"<all_urls>"` host permissions when active tab or user-approved origins suffice.
2. **No Data Snooping:** Never inspect passwords, session cookies, auth tokens, input forms, or page DOM content.
3. **Loopback Bridge Authentication:** When the extension communicates with the Electron desktop app over local loopback (`http://127.0.0.1:<port>`), all messages must carry a pre-shared cryptographic handshake token generated during user pairing.
