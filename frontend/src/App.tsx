// Customized UI demo: a fully custom call surface built from `@akapulu/react`
// hooks + Daily primitives (no `@akapulu/react-ui`). When the call ends it swaps
// to a post-call review screen (recording + transcript).
//
// There's no router: `reviewId` state decides which screen to show.

import { useState } from "react";

import { AkapuluProvider } from "@akapulu/react";

import { CustomConversation } from "./CustomConversation";
import { ConversationReview } from "./ConversationReview";

const API_BASE = "http://localhost:3001"; // replace with your own backend URL

export function App() {
  const [reviewId, setReviewId] = useState<string | null>(null);

  if (reviewId) {
    return <ConversationReview conversationId={reviewId} apiBase={API_BASE} onBack={() => setReviewId(null)} />;
  }

  return (
    <AkapuluProvider
      config={{
        endpoints: {
          connectPath: `${API_BASE}/api/connect`, // create and connect to conversation
          updatesPath: `${API_BASE}/api/updates`, // for loading progress bar
        },
        connectBody: {
          runtime_vars: {},
        },
        // Optional headers: object or function called at request time.
      }}
    >
      <CustomConversation onEnded={setReviewId} />
    </AkapuluProvider>
  );
}
