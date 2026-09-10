/**
 * Fully custom conversation surface using `@akapulu/react` (provider, hooks, Daily primitives).
 * No `@akapulu/react-ui` — you build video tiles, controls, transcript, loading/error states,
 * and tool toasts yourself.
 *
 * Flow:
 * 1. `useAkapuluSession` drives lifecycle: idle → connecting (poll progress) → connected → ended/error.
 * 2. While connected, Daily hooks (`useDaily`, `useAkapuluParticipantRoles`, `useVideoTrack`) + `DailyVideo`
 *    render the assistant video, local PiP, and self-view fallback; `useAkapuluMediaControls` toggles mic/cam.
 * 3. Transcripts, node updates, and bot speaking state come from the session store; tool events use `useAkapuluEvents`.
 * 4. `AkapuluBotAudio` plays assistant audio (hidden element).
 * 5. `useConnectChime()` plays a short chime when status goes connecting → connected.
 * 6. When the call ends, `onEnded(conversationId)` hands control back to `App` for the review screen.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AkapuluBotAudio,
  useAkapuluEvents,
  useAkapuluMediaControls,
  useAkapuluParticipantRoles,
  useAkapuluSession,
  useConnectChime,
} from "@akapulu/react";
import type { NormalizedToolEvent } from "@akapulu/react";
import { DailyVideo, useDaily, useVideoTrack } from "@daily-co/daily-react";
import { Camera, CameraOff, Database, Eye, Globe, Mic, MicOff, PhoneOff } from "lucide-react";

// =============================================================================
// UI theming: flow node chip colors + tool-event toast chrome
// =============================================================================

const NODE_COLOR_POOL = ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#f472b6"];

const TOOL_THEME: Record<string, { border: string; title: string }> = {
  vision: { border: "1px solid rgba(34, 211, 238, 0.45)", title: "#67e8f9" },
  RAG: { border: "1px solid rgba(167, 139, 250, 0.45)", title: "#c4b5fd" },
  http: { border: "1px solid rgba(52, 211, 153, 0.45)", title: "#6ee7b7" },
};

const TOOL_ICON = {
  vision: <Eye size={14} />,
  RAG: <Database size={14} />,
  http: <Globe size={14} />,
};

function getCycledNodeColor(index: number): string {
  return NODE_COLOR_POOL[index % NODE_COLOR_POOL.length] || "#818cf8";
}

// =============================================================================
// VideoTile — one Daily participant (main view or PiP)
// =============================================================================

type VideoTileProps = {
  /** Daily `session_id` for this participant */
  id: string;
  /** Local self-view uses `automirror` on `DailyVideo` */
  isLocal: boolean;
};

function VideoTile(props: VideoTileProps) {
  const { id, isLocal } = props;
  const videoTrack = useVideoTrack(id);
  const isVideoOff = videoTrack.isOff;

  if (isVideoOff) {
    return (
      <div className="headlessVideoOff" style={{ color: "#fff" }}>
        <div style={{ display: "grid", justifyItems: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "999px",
              background: "rgba(255, 255, 255, 0.08)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <CameraOff size={20} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DailyVideo
        automirror={isLocal}
        sessionId={id}
        type="video"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

// =============================================================================
// CustomConversation — full custom layout (no @akapulu/react-ui)
// =============================================================================

export function CustomConversation({ onEnded }: { onEnded: (conversationId: string) => void }) {
  // ---------------------------------------------------------------------------
  // Akapulu session: status, polling text, transcripts, start/end
  // ---------------------------------------------------------------------------
  const {
    status,
    conversationSessionId,
    completionPercent,
    latestUpdateText,
    transcripts,
    botSpeakingState,
    currentNode,
    error,
    start,
    end,
  } = useAkapuluSession();

  // ---------------------------------------------------------------------------
  // Daily: participant lists (provider is inside AkapuluProvider)
  // ---------------------------------------------------------------------------
  const daily = useDaily();
  const { akapuluBotParticipantId } = useAkapuluParticipantRoles();
  const localParticipantId = daily?.participants()?.local?.session_id || "";
  const localParticipant = daily?.participants().local;

  // ---------------------------------------------------------------------------
  // In-call media: same Daily call the SDK connected
  // ---------------------------------------------------------------------------
  const { isMicMuted, isCamOff, toggleMic, toggleCam } = useAkapuluMediaControls();
  useConnectChime();

  // ---------------------------------------------------------------------------
  // Local UI state
  // ---------------------------------------------------------------------------
  const [latestToolEvent, setLatestToolEvent] = useState<NormalizedToolEvent | null>(null);
  const [localStartError, setLocalStartError] = useState<string | null>(null);
  const [dismissedErrorKey, setDismissedErrorKey] = useState<string | null>(null);
  const [currentNodeColor, setCurrentNodeColor] = useState("#818cf8");

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const nodeColorIndexRef = useRef(0);
  const toolToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConversationIdRef = useRef<string | null>(null);
  const endedConversationIdRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Akapulu hooks (side effects)
  // ---------------------------------------------------------------------------
  useAkapuluEvents((event) => {
    if (event.type !== "tool_event") return;
    setLatestToolEvent(event.tool);
  });

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Rotate node chip color whenever the scenario node key changes
  useEffect(() => {
    if (!currentNode?.key) return;
    setCurrentNodeColor(getCycledNodeColor(nodeColorIndexRef.current));
    nodeColorIndexRef.current += 1;
  }, [currentNode?.key]);

  // Auto-hide tool toast after a few seconds
  useEffect(() => {
    if (!latestToolEvent) return;
    if (toolToastTimeoutRef.current) clearTimeout(toolToastTimeoutRef.current);
    toolToastTimeoutRef.current = setTimeout(() => {
      setLatestToolEvent(null);
      toolToastTimeoutRef.current = null;
    }, 4000);
  }, [latestToolEvent]);

  useEffect(() => {
    return () => {
      if (toolToastTimeoutRef.current) clearTimeout(toolToastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!conversationSessionId) return;
    lastConversationIdRef.current = conversationSessionId;
  }, [conversationSessionId]);

  // Call ended → hand the conversation id up so App can show the review screen
  useEffect(() => {
    if (status !== "ended") return;
    if (!lastConversationIdRef.current) return;
    if (endedConversationIdRef.current === lastConversationIdRef.current) return;

    endedConversationIdRef.current = lastConversationIdRef.current;
    onEnded(lastConversationIdRef.current);
  }, [status, onEnded]);

  // Keep transcript scrolled to the latest line
  useEffect(() => {
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcripts]);

  // ---------------------------------------------------------------------------
  // Derived: unified error surface (SDK error vs failed `start()`)
  // ---------------------------------------------------------------------------
  const activeError = useMemo(() => {
    if (error) {
      return { title: "Connection failed", code: error.code ?? "UNKNOWN_ERROR", message: error.message };
    }
    if (localStartError) {
      return { title: "Start failed", code: "START_FAILED", message: localStartError };
    }
    return null;
  }, [error, localStartError]);

  const activeErrorKey = activeError ? `${activeError.code}:${activeError.message}` : null;
  const showErrorModal = activeError !== null && activeErrorKey !== dismissedErrorKey;

  const monoFont =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section className="headlessPage">
      {/* Floating diagnostic when RAG / HTTP / vision tools run */}
      {latestToolEvent ? (
        <div
          className="headlessToolToast"
          style={{
            border: TOOL_THEME[latestToolEvent.messageType]?.border || "1px solid rgba(56,189,248,0.35)",
          }}
        >
          <div
            className="headlessToolToastHeader"
            style={{
              borderBottom: latestToolEvent.messageType === "vision" ? "none" : "1px solid rgba(51,65,85,0.9)",
              color: TOOL_THEME[latestToolEvent.messageType]?.title || "#7dd3fc",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {TOOL_ICON[latestToolEvent.messageType as keyof typeof TOOL_ICON] || null}
              {latestToolEvent.summary}
            </div>
            {latestToolEvent.messageType !== "vision" ? (
              <span className="headlessToolToastFn" style={{ fontFamily: monoFont }}>
                {latestToolEvent.functionName}
              </span>
            ) : null}
          </div>

          {latestToolEvent.messageType !== "vision" ? (
            <div style={{ padding: 12, display: "grid", gap: 8 }}>
              {latestToolEvent.messageType === "RAG" && latestToolEvent.query ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "96px minmax(0, 1fr)",
                    gap: 8,
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      lineHeight: 1.45,
                    }}
                  >
                    QUERY
                  </span>
                  <span
                    style={{
                      color: "#e2e8f0",
                      fontSize: 12,
                      lineHeight: 1.45,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {latestToolEvent.query}
                  </span>
                </div>
              ) : null}

              {latestToolEvent.messageType === "http" && latestToolEvent.argsJson ? (
                <>
                  <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
                    ARGUMENTS
                  </div>
                  <pre
                    className="headlessToolToastBody"
                    style={{
                      margin: 0,
                      border: "1px solid rgba(100,116,139,0.22)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      background: "rgba(2,6,23,0.45)",
                      color: "#cbd5e1",
                      fontSize: 12,
                      lineHeight: 1.45,
                      overflowX: "auto",
                      maxHeight: 220,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      fontFamily: monoFont,
                    }}
                  >
                    {latestToolEvent.argsJson}
                  </pre>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <h1 className="headlessTitle">Akapulu customized UI</h1>

      {/* Not in an active call: offer start (includes recoverable error state) */}
      {status === "idle" || status === "error" ? (
        <div className="headlessStartWrap">
          <button
            className="headlessStartButton"
            onClick={() =>
              void start().then(
                () => undefined,
                (reason: unknown) => {
                  const message =
                    reason instanceof Error
                      ? reason.message
                      : typeof reason === "string"
                        ? reason
                        : "Unknown start error";
                  setLocalStartError(message);
                }
              )
            }
          >
            Start call
          </button>
        </div>
      ) : null}

      {/* Room exists but bot/pipeline not ready yet — progress from updates poll */}
      {status === "connecting" ? (
        <div className="headlessLoadingWrap">
          <div className="headlessLoadingTop">
            <div className="headlessSpinner" />
            <div className="headlessLoadingLabel">Connecting...</div>
          </div>
          <div className="headlessProgress">
            <div className="headlessProgressFill" style={{ width: `${completionPercent}%` }} />
          </div>
          <div className="headlessLoadingStatus">{latestUpdateText}</div>
        </div>
      ) : null}

      {showErrorModal && activeError ? (
        <div
          className="headlessErrorBackdrop"
          onClick={() => {
            if (!activeErrorKey) return;
            setDismissedErrorKey(activeErrorKey);
          }}
        >
          <div className="headlessErrorCard" onClick={(event) => event.stopPropagation()}>
            <h3>{activeError.title}</h3>
            <div className="headlessErrorCode">Code: {activeError.code}</div>
            <p>{activeError.message}</p>
            <button
              className="headlessStartButton"
              onClick={() => {
                if (!activeErrorKey) return;
                setDismissedErrorKey(activeErrorKey);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {/* Live call: video column + transcript column */}
      {status === "connected" ? (
        <div className="headlessConnectedGrid">
          <div className="headlessVideoPane">
            <div className="headlessBotState">{botSpeakingState}</div>

            {akapuluBotParticipantId !== "" ? (
              <VideoTile id={akapuluBotParticipantId} isLocal={false} />
            ) : localParticipantId !== "" ? (
              <VideoTile id={localParticipantId} isLocal />
            ) : (
              <div className="headlessVideoWaiting">Waiting for video...</div>
            )}

            {localParticipant ? (
              <div className="headlessPip">
                <VideoTile id={localParticipant.session_id} isLocal />
              </div>
            ) : null}

            <div className="headlessControls">
              <button
                className="headlessControlButton"
                data-active={isMicMuted ? "off" : "on"}
                onClick={toggleMic}
                aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                title={isMicMuted ? "Unmute" : "Mute"}
              >
                {isMicMuted ? <MicOff size={19} strokeWidth={2.2} /> : <Mic size={19} strokeWidth={2.2} />}
              </button>
              <button
                className="headlessControlButton"
                data-active={isCamOff ? "off" : "on"}
                onClick={toggleCam}
                aria-label={isCamOff ? "Turn camera on" : "Turn camera off"}
                title={isCamOff ? "Turn camera on" : "Turn camera off"}
              >
                {isCamOff ? <CameraOff size={19} strokeWidth={2.2} /> : <Camera size={19} strokeWidth={2.2} />}
              </button>
              <button
                className="headlessControlButton headlessControlEnd"
                onClick={() => void end()}
                aria-label="Leave call"
                title="Leave call"
              >
                <PhoneOff size={19} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div className="headlessTranscriptPane">
            <div className="headlessTranscriptContainer">
              <div className="headlessTranscriptHeader">
                <h3>Transcript</h3>
                {currentNode?.label ? (
                  <div
                    className="headlessNodeChip"
                    style={{ borderColor: currentNodeColor, color: currentNodeColor }}
                  >
                    <span className="headlessNodeDot" style={{ background: currentNodeColor }} />
                    {currentNode.label}
                  </div>
                ) : null}
              </div>

              <div className="headlessTranscriptList" ref={transcriptRef}>
                {transcripts.map((entry) => (
                  <div
                    key={entry.id}
                    className={entry.speaker === "user" ? "headlessTranscriptUser" : "headlessTranscriptBot"}
                  >
                    <span className="headlessSpeaker">{entry.speaker === "user" ? "You" : "Bot"}:</span>
                    <span>{entry.text}</span>
                    {!entry.isFinal && entry.speaker === "user" ? <span>...</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AkapuluBotAudio />
    </section>
  );
}
