# Media Locker — Universal Media Tracker

A high-performance dark glassmorphism application to track Movies, TV Shows, Anime, Manga, Games, and Novels/Books in one unified space — available as a standalone Electron desktop app and a Next.js web application.

---

## Features

- **6 Supported Media Types**: Movies (iTunes Search), TV Shows (TVMaze), Anime (Jikan API), Manga (Jikan API), Novels/Books (Open Library), and Video Games (Steam API & manual).
- **Desktop Application (Electron)**: Dedicated Electron shell with single-instance lock and system menu integration.
- **Zero API Keys Required**: Seamlessly integrates with open, free public APIs without requiring third-party developer tokens.
- **Interactive In-Progress Shelf**: One-click quick steppers (`+1 Ep`, `+1 Ch`, `+1h`) on the command center dashboard with auto-completion recognition.
- **Analytics & Stats Intelligence**: Real-time media type distribution bars, score statistics, playtime summaries, and Hall of Fame showcase.
- **Custom Collections & Curations**: Group media into curated sets (e.g. "Studio Ghibli Masterpieces", "Top Sci-Fi Novels").
- **Universal Search & Fast Entry**: Live search across 5 APIs with instant additions directly to your library.
- **Shared Local SQLite Database**: Local SQLite database via Prisma ORM (`prisma/dev.db`).
- **Flexible Auth**: NextAuth v5 credentials with secure bcrypt hashing and guest mode fallback for immediate local testing.

---

## Tech Stack

- **Web Framework**: Next.js 16 (App Router + Webpack)
- **Desktop Shell**: Electron 45 + Electron Builder
- **Database**: SQLite via Prisma Client 6
- **Auth**: NextAuth v5 (Credentials with bcrypt + guest fallback)
- **Data Visualization**: Recharts
- **Styling**: Vanilla CSS + Glassmorphism Design Tokens

---

## Desktop Application (Electron)

Media Locker is fully packaged with Electron, featuring a single-instance lock, context isolation, and automatic SQLite database provisioning in the user's local application data directory.

### Running Desktop in Development

```bash
# Starts Next.js and launches the Electron desktop window with live reload
npm run electron:dev
```

### Packaging & Distribution

```bash
# Unpacked directory build for local testing (outputs to dist/win-unpacked)
npm run electron:pack

# Full standalone Windows installer (NSIS .exe installer in dist/)
npm run electron:dist
```

---

## Web Application Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Push database schema
npx prisma db push

# 3. Seed sample data (optional)
node --env-file=.env seed.mjs

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Architecture & Persistence

- **Development Mode**: Connects directly to `prisma/dev.db` in the repository root.
- **Packaged Desktop Mode**: Automatically provisions `dev.db` into `app.getPath("userData")` (e.g. `%APPDATA%\Media Locker\dev.db` on Windows), ensuring user data and progress persist across application restarts and updates.
- **Security**: Preload script runs with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`, exposing only safe APIs via `window.electronAPI`.
