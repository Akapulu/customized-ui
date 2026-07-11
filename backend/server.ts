// =============================================================================
// Backend API server
// =============================================================================
//
// Sits between the browser and the Akapulu API so your API key stays
// server-side. Four routes drive the conversation lifecycle and post-call
// review:
//
//   1. connect             — user clicks "Start Call". Spins up a conversation.
//   2. updates             — SDK polls while the avatar boots.
//   3. conversation-details — after the call, loads transcript + metadata.
//   4. recording           — streams the recorded video for playback.
//
// =============================================================================

import express from "express";
import { AkapuluApiError, createAkapuluServerClient } from "@akapulu/server";

const connectPayload = {
  scenario_id: "<your-scenario-id>", // CHANGE ME
  avatar_id: "1285bfe4-3512-4b34-93ad-196098597a1c",
  runtime_vars: {},
  record_conversation: true,
};

const app = express();
const port = 3001;
const frontendOrigin = "http://localhost:5173";

// Frontend runs on a different port, so the browser needs CORS headers.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", frontendOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// POST /api/connect
app.post("/api/connect", (_req, res) => {
  const client = createAkapuluServerClient();

  client
    .connectConversation(connectPayload)
    .then((payload) => res.json(payload))
    .catch((error: unknown) => {
      if (error instanceof AkapuluApiError) {
        res.status(error.status).json(error.details ?? { error: error.message });
        return;
      }
      res.status(500).json({ error: "Unexpected server error while connecting conversation." });
    });
});

// GET /api/updates?conversation_session_id=...
app.get("/api/updates", (req, res) => {
  const conversationSessionId = String(req.query.conversation_session_id ?? "");
  if (conversationSessionId === "") {
    res.status(400).json({ error: "conversation_session_id is required." });
    return;
  }

  const client = createAkapuluServerClient();

  client
    .pollConversationUpdates(conversationSessionId)
    .then((payload) => res.json(payload))
    .catch((error: unknown) => {
      if (error instanceof AkapuluApiError) {
        res.status(error.status).json(error.details ?? { error: error.message });
        return;
      }
      res.status(500).json({ error: "Unexpected server error while fetching conversation updates." });
    });
});

// GET /api/conversation-details?conversation_id=...
app.get("/api/conversation-details", (req, res) => {
  const conversationId = String(req.query.conversation_id ?? "");
  if (conversationId === "") {
    res.status(400).json({ error: "conversation_id is required." });
    return;
  }

  const client = createAkapuluServerClient();

  client
    .getConversationDetail(conversationId)
    .then((payload) => {
      // Some tool rows carry structured content — stringify so the UI can render it.
      if (Array.isArray(payload.transcript_rows)) {
        payload.transcript_rows = payload.transcript_rows.map((row) => {
          const nextRow = { ...row };
          if (nextRow.content !== undefined && nextRow.content !== null && typeof nextRow.content !== "string") {
            nextRow.content = JSON.stringify(nextRow.content, null, 2);
          }
          return nextRow;
        });
      }
      res.json(payload);
    })
    .catch((error: unknown) => {
      if (error instanceof AkapuluApiError) {
        res.status(error.status).json(error.details ?? { error: error.message });
        return;
      }
      res.status(500).json({ error: "Unexpected server error while loading conversation details." });
    });
});

// GET /api/recording?conversation_id=...
app.get("/api/recording", (req, res) => {
  const conversationId = String(req.query.conversation_id ?? "");
  if (conversationId === "") {
    res.status(400).json({ error: "conversation_id is required." });
    return;
  }

  const client = createAkapuluServerClient();

  client
    .getConversationRecording(conversationId)
    .then((recording) => {
      if (recording.kind === "redirect") {
        res.redirect(recording.status, recording.location);
        return;
      }
      if (recording.kind === "json") {
        res.status(recording.status).json(recording.payload);
        return;
      }
      res.status(recording.status);
      res.setHeader("Content-Type", recording.contentType);
      res.setHeader("Content-Disposition", recording.contentDisposition);
      res.send(Buffer.from(recording.body));
    })
    .catch((error: unknown) => {
      if (error instanceof AkapuluApiError) {
        res.status(error.status).json(error.details ?? { error: error.message });
        return;
      }
      res.status(500).json({ error: "Unexpected server error while loading recording." });
    });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
