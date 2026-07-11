# Akapulu Labs customized UI example

A **fully custom** conversation UI built from `@akapulu/react` hooks + Daily
primitives. You build the call surface yourself: video
tiles, mic/cam/end controls, transcript, loading + error states, and tool toasts.
Ends with a post-call review screen (recording + transcript).

Two folders:

- **`backend/`** — Express server that holds your API key and calls Akapulu
- **`frontend/`** — React app (Vite) with the custom call surface + post-call review

## Prerequisites

- **Node.js 20+** and npm
- An **Akapulu API key** — <https://akapulu.com/api-keys>
- A **scenario** — <https://akapulu.com/scenarios> ([guide](https://docs.akapulu.com/guides/scenarios/overview))

---

## Setup

### 1) Clone and enter the repo

```bash
git clone https://github.com/Akapulu/customized-ui.git && cd customized-ui
```

### 2) Backend

```bash
# From customized-ui/
cd backend && npm install
```

#### Set your api key

```bash
# From customized-ui/backend/
cp .env.example .env.local
```

Open `backend/.env.local` and add your API key:

```env
AKAPULU_API_KEY=your_real_api_key_here
```

#### Set your scenario id

Open `backend/server.ts` and replace `<your-scenario-id>`:

```ts
const connectPayload = {
  scenario_id: "<your-scenario-id>", // <--- replace with your scenario id
  avatar_id: "1285bfe4-3512-4b34-93ad-196098597a1c",
  runtime_vars: {},
  record_conversation: true,
};
```

`record_conversation: true` is required for the post-call review to have a recording to show.

You can leave `avatar_id` as-is (public catalog avatar) or pick another from the [avatar catalog](https://docs.akapulu.com/guides/avatars/avatar-catalog).

Start the backend (`localhost:3001`). Leave this terminal open.

```bash
# From customized-ui/backend/
npm run dev
```

### 3) Frontend

Open a **second** terminal.

```bash
# From customized-ui/
cd frontend && npm install
```

```bash
# From customized-ui/frontend/
npm run dev
```

Open <http://localhost:5173> and click **Start call**. When the call ends, you land on the review screen.

---

## How it works

The frontend (`localhost:5173`) calls your backend (`localhost:3001`).
Your backend calls Akapulu with your API key.

### Backend (`backend/server.ts`)

```ts
// POST /api/connect              →  starts a conversation (record_conversation: true)
// GET  /api/updates              →  polled while the avatar boots
// GET  /api/conversation-details →  transcript + metadata for the review screen
// GET  /api/recording            →  streams the recorded video
```

### Frontend

- **`src/App.tsx`** — `AkapuluProvider` (points at the backend) plus a single `reviewId` state that decides which screen shows (live call UI or conversation review).
- **`src/CustomConversation.tsx`** — the custom call surface: `useAkapuluSession` for lifecycle,
  Daily hooks (`useDaily`, `useVideoTrack`, `DailyVideo`) for video, `useAkapuluMediaControls` for
  mic/cam, `useAkapuluEvents` for tool toasts, and `AkapuluBotAudio` for audio.
- **`src/ConversationReview.tsx`** — post-call screen; fetches details and polls until the
  recording is ready.
- **`src/styles.css`** — the call surface styling.

---

## File tree

```text
customized-ui/
├── README.md, LICENSE, .gitignore
|
├── backend/
│   ├── package.json      # @akapulu/server
│   ├── tsconfig.json
│   ├── .env.example
│   └── server.ts         # connect + updates + conversation-details + recording
|
└── frontend/
    ├── package.json      # @akapulu/react
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                     # provider + call <-> review switch
        ├── CustomConversation.tsx      # custom call surface (video, controls, transcript, toasts)
        ├── styles.css
        ├── ConversationReview.tsx      # post-call recording + transcript
        └── ConversationReview.module.css
```

---

## Related examples

- [prebuilt-ui](https://github.com/Akapulu/prebuilt-ui) — minimal `AkapuluConversation` demo
- [prebuilt-ui-styled](https://github.com/Akapulu/prebuilt-ui-styled) — styled prebuilt UI + post-call review

