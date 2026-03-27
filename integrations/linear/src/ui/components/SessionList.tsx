import { useEffect, useState } from "react";

type SessionSummary = {
  linear_session_id: string;
  issue_identifier: string | null;
  issue_title: string | null;
  state: string;
  updated_at: number;
};

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function SessionList({ selectedId, onSelect }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    const fetchSessions = () => {
      fetch("/api/sessions")
        .then((r) => r.json())
        .then((data: { sessions: SessionSummary[] }) => {
          setSessions(data.sessions);
        })
        .catch(console.error);
    };

    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Sessions ({sessions.length})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {sessions.map((session) => (
          <button
            type="button"
            key={session.linear_session_id}
            onClick={() => onSelect(session.linear_session_id)}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor:
                selectedId === session.linear_session_id ? "#3b82f6" : "#222",
              background:
                selectedId === session.linear_session_id ? "#1e293b" : "#111",
              cursor: "pointer",
              textAlign: "left",
              color: "#e5e5e5",
              fontSize: "13px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {session.issue_identifier ?? "No issue"}
              </span>
              <StatusBadge state={session.state} />
            </div>
            <div
              style={{
                color: "#888",
                fontSize: "12px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session.issue_title ?? session.linear_session_id}
            </div>
            <div style={{ color: "#555", fontSize: "11px", marginTop: "4px" }}>
              {new Date(session.updated_at).toLocaleString()}
            </div>
          </button>
        ))}
        {sessions.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "#555" }}>
            No sessions yet
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    running: { bg: "#14532d", text: "#22c55e" },
    completed: { bg: "#1e3a5f", text: "#3b82f6" },
    failed: { bg: "#450a0a", text: "#ef4444" },
    aborting: { bg: "#451a03", text: "#f59e0b" },
    awaitingInput: { bg: "#3b0764", text: "#a855f7" },
    idle: { bg: "#1c1917", text: "#78716c" },
  };

  const color = colors[state] ?? { bg: "#1c1917", text: "#78716c" };

  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 500,
        background: color.bg,
        color: color.text,
      }}
    >
      {state}
    </span>
  );
}
