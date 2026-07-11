// Post-call review screen: recording video + transcript (grouped by node).
// Rendered by `App` once the call ends. Takes the conversation id as a prop and
// polls the backend until the recording is ready.

import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./ConversationReview.module.css";

type TranscriptRow = {
  role: string;
  content?: string;
  node_id?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

type ConversationDetailPayload = {
  id: string;
  created_at: string;
  created_at_text: string;
  duration_text: string;
  avatar: {
    id: string;
    href: string;
    profile_image_url: string;
  };
  scenario_id: string;
  recording: {
    has_recording: boolean;
    status_text: string;
    is_ready: boolean;
  };
  transcript_rows: TranscriptRow[];
  error?: string;
};

export function ConversationReview({
  conversationId,
  apiBase,
  onBack,
}: {
  conversationId: string;
  apiBase: string;
  onBack: () => void;
}) {
  const [payload, setPayload] = useState<ConversationDetailPayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [mediaHeight, setMediaHeight] = useState(0);
  const mediaPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isActive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    setIsLoading(true);
    setError("");
    setPayload(null);

    const loadConversationDetails = () => {
      fetch(`${apiBase}/api/conversation-details?conversation_id=${encodeURIComponent(conversationId)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          const nextPayload = (await response.json()) as ConversationDetailPayload;
          if (!isActive) return;

          if (!response.ok) {
            setError(nextPayload.error ?? "Failed to load conversation details.");
            setIsLoading(false);
            return;
          }

          setPayload(nextPayload);
          setError("");
          setIsLoading(false);

          if (!nextPayload.recording.is_ready) {
            pollTimer = setTimeout(loadConversationDetails, 2000);
          }
        })
        .catch(() => {
          if (!isActive) return;
          setError("Failed to load conversation details.");
          setIsLoading(false);
        });
    };

    loadConversationDetails();

    return () => {
      isActive = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [conversationId, apiBase]);

  const recordingSrc = `${apiBase}/api/recording?conversation_id=${encodeURIComponent(conversationId)}`;
  const transcriptGroups = useMemo(() => {
    if (!payload) {
      return [];
    }

    const groups: Array<{ nodeId: string; rows: TranscriptRow[] }> = [];
    for (const row of payload.transcript_rows) {
      const nodeId = row.node_id || "no-node";
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.nodeId === nodeId) {
        lastGroup.rows.push(row);
        continue;
      }
      groups.push({ nodeId, rows: [row] });
    }
    return groups;
  }, [payload]);

  const formattedCreatedAt = useMemo(() => {
    if (!payload?.created_at) {
      return "";
    }

    const parsed = new Date(payload.created_at);
    if (Number.isNaN(parsed.getTime())) {
      return payload.created_at_text;
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }, [payload]);

  useEffect(() => {
    const element = mediaPaneRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      setMediaHeight(element.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [payload]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <button type="button" onClick={onBack} className={styles.backLink}>
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to demo
          </button>
          <h1 className={styles.title}>Conversation Details</h1>
        </header>

        {isLoading ? (
          <div className={`${styles.statusPanel} ${styles.loadingPanel}`}>
            <div className={styles.loadingContent}>
              <div className={styles.loadingSpinner} aria-hidden="true" />
              <div className={styles.loadingLabel}>Loading conversation details...</div>
            </div>
          </div>
        ) : null}

        {!isLoading && error !== "" ? (
          <div className={styles.errorPanel}>{error}</div>
        ) : null}

        {!isLoading && payload ? (
          <>
            <section className={styles.summarySection}>
              <section className={`${styles.panel} ${styles.summaryGrid}`}>
                <div className={styles.avatarCell}>
                  {payload.avatar.profile_image_url ? (
                    <img
                      src={payload.avatar.profile_image_url}
                      alt={`Avatar ${payload.avatar.id}`}
                      className={styles.avatarImage}
                    />
                  ) : (
                    <div className={styles.avatarFallback} />
                  )}

                  <div className={styles.metaStack}>
                    <div className={styles.metaLabel}>Avatar ID</div>
                    <MetadataId value={payload.avatar.id} />
                  </div>
                </div>

                <div className={styles.metaStack}>
                  <div className={styles.metaLabel}>Session ID</div>
                  <MetadataId value={payload.id} />
                </div>

                <div className={styles.metaStack}>
                  <div className={styles.metaLabel}>Scenario ID</div>
                  <MetadataId value={payload.scenario_id} />
                </div>

                <div className={styles.metaDateStack}>
                  <div className={styles.metaDate}>{formattedCreatedAt}</div>
                  <div className={styles.pillRow}>
                    <StatusPill label={payload.duration_text} variant="slate" />
                  </div>
                </div>
              </section>
            </section>

            <section className={`${styles.panel} ${styles.contentPanel}`}>
              <section ref={mediaPaneRef} className={styles.mediaPane}>
                {payload.recording.is_ready ? (
                  <video controls src={recordingSrc} className={styles.videoPlayer} />
                ) : payload.recording.has_recording ? (
                  <div className={styles.emptyRecording}>
                    <div className={styles.recordingLoadingContent}>
                      <div className={styles.recordingLoadingSpinner} aria-hidden="true" />
                      <div className={styles.recordingLoadingLabel}>{payload.recording.status_text}</div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.emptyRecording}>
                    <div className={styles.recordingLoadingLabel}>{payload.recording.status_text}</div>
                  </div>
                )}
              </section>

              <section
                className={styles.transcriptPane}
                style={mediaHeight > 0 ? { height: mediaHeight } : undefined}
              >
                <div className={styles.transcriptFrame}>
                  <div className={styles.transcriptScroller}>
                    {transcriptGroups.length === 0 ? (
                      <div className={styles.emptyTranscript}>Transcript not available.</div>
                    ) : (
                      transcriptGroups.map((group, groupIndex) => (
                        <section
                          key={`${group.nodeId}-${groupIndex}`}
                          className={`${styles.nodeCard} ${getNodeCardClass(groupIndex)}`}
                        >
                          <div className={`${styles.nodeHeader} ${getNodeHeaderClass(groupIndex)}`}>
                            Node: {group.nodeId}
                          </div>
                          <div className={styles.nodeBody}>
                            {group.rows.map((row, rowIndex) => (
                              <article
                                key={`${group.nodeId}-${row.role}-${rowIndex}`}
                                className={`${styles.transcriptRow} ${rowIndex === 0 ? "" : styles.transcriptRowSeparated}`}
                              >
                                <div className={styles.rowHeader}>
                                  <div className={`${styles.roleChip} ${getRoleChipClass(row.role)}`}>{row.role}</div>
                                  {row.tool_call_id ? (
                                    <div className={styles.toolCallId}>
                                      Tool Call ID: {row.tool_call_id}
                                    </div>
                                  ) : null}
                                </div>
                                {row.content ? <div className={styles.rowContent}>{row.content}</div> : null}
                                {row.tool_calls && row.tool_calls.length > 0 ? (
                                  <pre className={styles.codeBlock}>{JSON.stringify(row.tool_calls, null, 2)}</pre>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        </section>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

function StatusPill({
  label,
  variant,
}: {
  label: string;
  variant: "blue" | "green" | "slate";
}) {
  return (
    <div className={`${styles.statusPill} ${getStatusPillClass(variant)}`}>
      <span className={styles.statusPillDot} />
      {label}
    </div>
  );
}

function MetadataId({ value }: { value: string }) {
  return <div className={styles.metadataId}>{value}</div>;
}

function getNodeCardClass(groupIndex: number): string {
  if (groupIndex % 3 === 0) {
    return styles.nodeCardBlue;
  }
  if (groupIndex % 3 === 1) {
    return styles.nodeCardPurple;
  }
  return styles.nodeCardGreen;
}

function getNodeHeaderClass(groupIndex: number): string {
  if (groupIndex % 3 === 0) {
    return styles.nodeHeaderBlue;
  }
  if (groupIndex % 3 === 1) {
    return styles.nodeHeaderPurple;
  }
  return styles.nodeHeaderGreen;
}

function getRoleChipClass(role: string): string {
  if (role === "assistant") {
    return styles.roleChipAssistant;
  }
  if (role === "user") {
    return styles.roleChipUser;
  }
  return styles.roleChipTool;
}

function getStatusPillClass(variant: "blue" | "green" | "slate"): string {
  if (variant === "blue") {
    return styles.statusPillBlue;
  }
  if (variant === "green") {
    return styles.statusPillGreen;
  }
  return styles.statusPillSlate;
}
