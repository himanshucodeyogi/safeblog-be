# Safe Blog - Stealth Dual-Interface Mobile & Backend

Safe Blog is a 100% incognito messaging application cloaked as a premium, minimalist journaling and blogging app. A dual-PIN gatekeeper routes users to either:
1. **Decoy Safe Blog:** Calming, aesthetic journaling app with warm gold/orange accents, Serif typography, daily prompts, and mood tracking (Screenshots 1–10).
2. **Private Chat:** Utilitarian, end-to-end encrypted Telegram-style messaging interface with real-time SSE stream, read receipts, reactions, and disguised ghost notifications (Screenshots 11–14).

---

## Architecture & Tech Stack

### Frontend (Flutter)
- **Framework:** Flutter 3.47+ / Dart 3.13+
- **State Management:** Riverpod 3.5 (`Notifier`, `NotifierProvider`)
- **Typography:** `google_fonts` (Playfair Display for editorial Serif titles, Inter for body text)
- **Local Storage:** `flutter_secure_storage` for PINs, JWT token, and session caching; `shared_preferences` for theme settings
- **Real-Time Streaming:** Custom Server-Sent Events (SSE) Client over streaming HTTP (zero third-party dependencies)
- **Dual Themes:** Dynamic switching between Decoy Blog (Light/Dark warm amber) and Secret Chat (Telegram Cerulean Blue / Slate)

### Backend (Node.js on Vercel)
- **Runtime:** Node.js (v20+)
- **Server:** Express.js optimized for Vercel Serverless Functions
- **Database:** MongoDB via Mongoose with connection pooling and serverless reuse
- **Authentication:** Custom JWT with Dual-PIN gatekeeper + Google OAuth 2.0 (`google-auth-library`)
- **Real-Time Engine:** Server-Sent Events (SSE) via `/api/chat/stream`
- **Ghost Notifications:** Background polling endpoint `/api/chat/poll` designed for Flutter `workmanager`

---

## Project Structure

```
blog app/
├── api/
│   └── index.js              # Express app & Vercel serverless entry point
├── config/
│   └── db.js                 # Cached MongoDB Mongoose connection for Vercel
├── controllers/
│   ├── authController.js     # Dual-PIN Gatekeeper, Google OAuth & registration
│   ├── blogController.js     # Decoy Blog logic (Today, Explore, Editor, Calendar, Profile)
│   └── chatController.js     # Secret Telegram-style chat logic (Conversations, SSE, Messages)
├── middleware/
│   └── auth.js               # JWT verification & Gatekeeper mode isolation middleware
├── models/
│   ├── User.js               # Users schema (Dual PINs: blogPinHash & safePinHash)
│   ├── DecoyBlog.js          # Decoy journal entries, prompts, moods, and stories
│   ├── PrivateChat.js        # Telegram-style chats, participants, folders, unread counts
│   ├── Message.js            # Messages, read receipts, reactions, reply quotes
│   └── index.js              # Unified exports & aliases
├── routes/
│   ├── authRoutes.js         # Authentication & Dual-PIN routes
│   ├── blogRoutes.js         # Decoy Blog routes
│   └── chatRoutes.js         # Private Chat routes (Enforces SECRET mode)
├── services/
│   └── sseService.js         # In-memory SSE client hub, heartbeats, and event broadcast
├── test/
│   └── backend_test.js       # Comprehensive Phase 2 test suite
│
├── mobile/                   # Phase 3 Flutter Frontend
│   ├── lib/
│   │   ├── config/
│   │   │   ├── api_config.dart       # Network & server endpoints
│   │   │   └── app_theme.dart        # Decoy & Telegram themes (Light & Dark)
│   │   ├── models/
│   │   │   ├── user_model.dart       # User profile model
│   │   │   ├── blog_model.dart       # Decoy blog & story model
│   │   │   ├── chat_model.dart       # Telegram chat list model
│   │   │   └── message_model.dart    # Telegram chat message model
│   │   ├── services/
│   │   │   ├── api_service.dart      # HTTP API Client
│   │   │   ├── sse_service.dart      # Real-time SSE streaming client
│   │   │   └── storage_service.dart  # Secure token & PIN storage
│   │   ├── providers/
│   │   │   ├── auth_provider.dart    # Riverpod Dual-PIN gatekeeper state
│   │   │   ├── blog_provider.dart    # Riverpod Decoy blog state
│   │   │   ├── chat_provider.dart    # Riverpod Telegram chat state & SSE events
│   │   │   └── theme_provider.dart   # Riverpod Dark/Light theme state
│   │   ├── screens/
│   │   │   ├── lock_screen.dart      # Universal Dual-PIN Gatekeeper PIN pad
│   │   │   ├── sync_animation_screen.dart # 1.5s Fake "Syncing Entries" screen
│   │   │   ├── decoy/
│   │   │   │   ├── decoy_main_screen.dart # Decoy Scaffold with bottom nav & FAB
│   │   │   │   ├── today_tab.dart         # Screenshots 1 & 5
│   │   │   │   ├── explore_tab.dart       # Screenshots 2 & 6
│   │   │   │   ├── editor_screen.dart     # Screenshots 3 & 7
│   │   │   │   ├── calendar_tab.dart      # Screenshots 3 & 8
│   │   │   │   └── profile_tab.dart       # Screenshots 4 & 9
│   │   │   └── secret/
│   │   │       ├── chat_home_screen.dart         # Screenshots 11 & 13
│   │   │       ├── chat_conversation_screen.dart # Screenshots 12 & 14
│   │   │       └── user_search_screen.dart       # User discovery screen
│   │   └── main.dart                 # App Entry & Gatekeeper Router
│   ├── test/
│   │   └── widget_test.dart          # Flutter smoke & gatekeeper tests
│   └── pubspec.yaml
│
├── package.json              # Backend scripts & dependencies
├── vercel.json               # Vercel deployment & URL rewrites configuration
└── safeblog.prd              # Product Requirements Document
```

---

## Core Stealth Mechanics & UI Verification

### 1. Dual-PIN Lock Screen (The Gatekeeper)
- Entering **Blog PIN** (e.g. `1234`) routes directly to the Decoy Safe Blog.
- Entering **Safe PIN** (e.g. `9999`) triggers the **1.5s Fake "Syncing Entries" animation**, then smoothly opens the Private Chat.
- Entering an incorrect PIN shakes the digits with an error.

### 2. Panic Switch (Quick Escape)
- Double-tapping the top App Bar anywhere inside the secret chat instantly terminates the secret session and flips the interface back to the Decoy Safe Blog in `0ms`.

### 3. Decoy Safe Blog (Screenshots 1–10)
- **Today Tab:** Daily prompt card, *"Share Publicly"* vs *"Just Me"*, streak dots (`M T W T F S S`), habit reminder.
- **Explore Tab:** Community stories, mood filters (`All`, `Happy`, `Reflective`, `Anxious`, `Sad`), tabs (`For You`, `Following`).
- **Editor:** Character counter (`0 / 30,000`), mood selector chips, *"Save Draft"* and *"Save Entry"* buttons.
- **Calendar Tab:** Month grid, month review statistics (day streak, days active, entries), daily entry logs.
- **Profile Tab:** Initials avatar (`KC`), handle, bio, follower counters, share link, and sub-tabs (`Posts`, `Saved`, `Drafts`).

### 4. Secret Private Chat (Screenshots 11–14)
- **Chat Home:** Telegram cerulean blue app bar, archived chats item, circular avatars, mute icons, snippet previews, read ticks, and unread badges.
- **Conversation Screen:** Real-time messages with SSE, reply quote boxes, heart emoji reactions (`❤️`), read receipt double ticks (green ticks for light, blue ticks for dark).
- **User Discovery:** Search users by exact username or email.

---

## Running the Project

### Running Backend Tests
```bash
npm test
```

### Running Flutter Analysis & Tests
```bash
cd mobile
flutter analyze
flutter test
```

### Running Flutter App
```bash
cd mobile
flutter run
```
