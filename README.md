# ⚠️ TEST VERSION DO NOT CONTINUE TILL REFINED ⚠️

# Media Locker — Universal Media Tracker

A dark glassmorphism web application to track Movies, TV Shows, Anime, Manga, Games, and Novels/Books in one unified space.

---

> [!CAUTION]
> **TEST VERSION DO NOT CONTINUE TILL REFINED**

---

## Features

- **6 Supported Media Types**: Movies (iTunes Search), TV Shows (TVMaze), Anime (Kitsu API), Manga (Kitsu API), Novels/Books (Open Library), and Video Games (Manual tracker).
- **Zero API Keys Required**: Uses open, free APIs without requiring developer account tokens.
- **Analytics & Stats Dashboard**: Recharts-powered distribution donuts, rating curve histogram, category status breakdown, and Hall of Fame.
- **In-Progress Shelf**: Quick `+1 Ep`, `+1 Ch`, and `+1h` progress increment steppers on the dashboard.
- **Custom Collections**: Group media into curated collections (e.g. "All-Time Masterpieces").
- **Local SQLite Database**: Prisma ORM with offline local storage in `dev.db`.

## Tech Stack

- **Framework**: Next.js 16 (App Router + Turbopack)
- **Database**: SQLite via Prisma Client 6
- **Auth**: NextAuth v5 (Credentials with bcrypt + guest mode fallback)
- **Data Visualization**: Recharts
- **Icons**: Lucide React
- **Styling**: Vanilla CSS + Glassmorphism Design System

## Getting Started

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
