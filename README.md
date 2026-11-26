# Safe Blog - Stealth Dual-Interface Backend

Safe Blog is a 100% incognito messaging application cloaked as a premium, minimalist journaling and blogging app. A dual-PIN gatekeeper routes users to either:
1. **Decoy Safe Blog:** Calming, aesthetic journaling app with warm gold/orange accents, Serif typography, daily prompts, and mood tracking (Screenshots 1–10).
2. **Private Chat:** Utilitarian, end-to-end encrypted Telegram-style messaging interface with real-time SSE stream, read receipts, reactions, and disguised ghost notifications (Screenshots 11–14).

---

## Architecture & Tech Stack

- **Runtime:** Node.js (v20+)
- **Server:** Express.js optimized for Vercel Serverless Functions
- **Database:** MongoDB via Mongoose with connection pooling and serverless reuse
- **Authentication:** Custom JWT with Dual-PIN gatekeeper + Google OAuth 2.0 (`google-auth-library`)
- **Strict Data Isolation:** JWT tokens encode interface `mode` (`'DECOY'` or `'SECRET'`). Gatekeeper middleware strictly forbids Decoy tokens from touching private chat records.
- **Real-Time Streaming:** Server-Sent Events (SSE) via `/api/chat/stream`
- **Ghost Notifications:** Background polling endpoint `/api/chat/poll` designed for Flutter `workmanager`
- **Zero Third-Party Real-Time Dependencies:** 100% custom SSE and polling (No Firebase, No Pusher)

---

## Folder Structure

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
├── .env.example              # Environment variables template
├── package.json              # Project scripts & dependencies
├── vercel.json               # Vercel deployment & URL rewrites configuration
└── safeblog.prd              # Product Requirements Document
```

---

## Dual-PIN Gatekeeper Flow

```
                     ┌──────────────────────────┐
                     │   Universal Lock Screen  │
                     │       (PIN Pad UI)       │
                     └────────────┬─────────────┘
                                  │
                       POST /api/auth/verify-pin
                                  │
               ┌──────────────────┴──────────────────┐
               ▼                                     ▼
        Matches Blog PIN                      Matches Safe PIN
         (e.g., "1234")                        (e.g., "9999")
               │                                     │
               ▼                                     ▼
    Mode: "DECOY"                         Mode: "SECRET"
    Route: /decoy/blog                    Wait 1.5s (Fake Sync)
    Scoped Decoy JWT                      Route: /secret/chat
    Access to Decoy Blog only             Scoped Secret JWT
                                          Access to Private Chat
```

---

## MongoDB Schemas & UI Mapping

| Schema | File | Corresponding UI Screens | Key Attributes |
|---|---|---|---|
| **Users** | `models/User.js` | Screenshots 4 & 9 (Profile)<br>Lock Screen | `googleId`, `email`, `username`, `displayName`, `avatarUrl`, `bio`, `blogPinHash` (Decoy PIN), `safePinHash` (Secret PIN), `streakCount`, `followers`, `following` |
| **DecoyBlogs** | `models/DecoyBlog.js` | Screenshots 1 & 5 (Today)<br>Screenshots 2 & 6 (Explore)<br>Screenshots 3 & 7 (Editor)<br>Screenshots 4 & 8 (Calendar) | `userId`, `title`, `content` (up to 30k chars), `mood` (Happy, Reflective, Anxious, Sad, Calm, Grateful), `isPublic`, `isDraft`, `dailyPrompt`, `readTimeMinutes`, `likes`, `likesCount`, `commentsCount` |
| **PrivateChats** | `models/PrivateChat.js` | Screenshots 11 & 13 (Chat Home - Dark & Light) | `participants`, `lastMessage`, `lastMessageAt`, `lastMessagePreview`, `unreadCounts`, `archivedBy`, `mutedBy`, `folder` |
| **Messages** | `models/Message.js` | Screenshots 12 & 14 (Chat View - Dark & Light) | `chatId`, `senderId`, `text`, `isRead` (single vs double ticks), `readAt`, `replyTo` (quote replies), `reactions` (heart emojis) |

---

## API Endpoints Reference

### 1. Authentication & Dual-PIN Gatekeeper (`/api/auth`)
- `POST /api/auth/register` - Create account with distinct `blogPin` and `safePin`.
- `POST /api/auth/verify-pin` - Universal lock screen router. Checks entered PIN and returns scoped JWT with either `DECOY` or `SECRET` mode.
- `POST /api/auth/google` - Google OAuth 2.0 verification via `google-auth-library`.
- `GET /api/auth/me` - Get profile and current active mode.
- `PUT /api/auth/pins` - Update PINs (requires SECRET mode and current Safe PIN).

### 2. Decoy Blog (`/api/blogs`)
- `GET /api/blogs/today` - Today tab data: daily prompt, writing streak metrics, 7-day progress dots.
- `GET /api/blogs/explore?mood=Happy&tab=for_you` - Community stories feed filterable by mood pills.
- `GET /api/blogs/calendar/review?month=11&year=2026` - Monthly review and entries for calendar screen.
- `GET /api/blogs/profile?userId=:id` - User profile stats (posts, saved, drafts, followers).
- `POST /api/blogs` - Create blog entry or draft (up to 30,000 chars, auto calculates read time).
- `GET /api/blogs/:id` - Read single entry (respects privacy toggle).
- `PUT /api/blogs/:id` - Update entry or draft.
- `DELETE /api/blogs/:id` - Delete entry.
- `POST /api/blogs/:id/like` - Toggle like on public story.
- `POST /api/blogs/:id/bookmark` - Toggle bookmark on public story.

### 3. Private Chat & Secret Messaging (`/api/chat`)
*Strictly protected by `authenticateToken` and `requireMode('SECRET')`.*
- `GET /api/chat/users/search?q=:query` - User discovery by exact username or email.
- `GET /api/chat/conversations` - Telegram-style chat list with avatars, snippet preview, and unread count.
- `POST /api/chat/conversations` - Start or fetch 1-on-1 private chat.
- `GET /api/chat/conversations/:chatId/messages` - Chat messages history (supports quoted replies and reactions).
- `POST /api/chat/messages` - Send message; updates chat and immediately broadcasts via SSE.
- `PATCH /api/chat/messages/read` - Mark messages read and trigger double checkmarks via SSE.
- `POST /api/chat/messages/:messageId/react` - Add emoji reaction (e.g. `❤️`).
- `GET /api/chat/stream?token=:jwt` - **Real-Time SSE Stream**. Delivers `connected`, `ping`, `new_message`, `message_read`, and `message_reaction` events.
- `GET /api/chat/poll` - **Ghost Notification Polling**. Returns unread message count disguised with a daily writing prompt string for local phone notifications.

---

## Running Verification Tests

```bash
npm test
```
All unit and integration tests run end-to-end against the database and HTTP server.
