import { useEffect, useState } from "react";

type SessionEvent = {
  id: number;
  event_type: string;
  level: string;
  message: string;
  created_at: number;
};

type SessionInfo = {
  linear_session_id: string;
  organization_id: string;
  issue_identifier: string | null;
  issue_title: string | null;
  state: string;
  stop_requested: number;
  terminal_emitted: number;
  pi_session_path: string | null;
  created_at: number;
  updated_at: number;
};

type DetailResponse = {
  session: SessionInfo;
  events: SessionEvent[];
  pendingOutbound: number;
  piActive: boolean;
};

type Props = {
  sessionId: string;
};

export function SessionDetail({ sessionId }: Props) {
  const [data, setData] = useState<DetailResponse | null>(null);

  useEffect(() => {
    let active = true;

    const fetchDetail = () => {
      fetch(`/api/sessions/${sessionId}`)
        .then((r) => r.json())
        .then((d: DetailResponse) => {
          if (active) setData(d);
        })
        .catch(console.error);
    };

    fetchDetail();
    const interval = setInterval(fetchDetail, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  if (!data) {
    return <div style={{ padding: "24px", color: "#666" }}>Loading...</div>;
  }

  const { session, events, pendingOutbound, piActive } = data;

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
          {session.issue_identifier ?? "Session"}{" "}
          {session.issue_title ? `- ${session.issue_title}` : ""}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "12px",
            fontSize: "13px",
          }}
        >
          <InfoCard label="State" value={session.state} />
          <InfoCard label="Pi Active" value={piActive ? "Yes" : "No"} />
          <InfoCard label="Pending Outbound" value={String(pendingOutbound)} />
          <InfoCard
            label="Stop Requested"
            value={session.stop_requested ? "Yes" : "No"}
          />
          <InfoCard
            label="Terminal Emitted"
            value={session.terminal_emitted ? "Yes" : "No"}
          />
          <InfoCard
            label="Created"
            value={new Date(session.created_at).toLocaleString()}
          />
        </div>
      </div>

      <h3
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Activity Log
      </h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          maxHeight: "500px",
          overflowY: "auto",
        }}
      >
        {events.map((event) => (
          <div
            key={event.id}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "#111",
              border: "1px solid #222",
              fontSize: "13px",
              display: "flex",
              gap: "12px",
              alignItems: "flex-start",
            }}
          >
            <span style={{ color: "#555", fontSize: "11px", flexShrink: 0 }}>
              {new Date(event.created_at).toLocaleTimeString()}
            </span>
            <LevelBadge level={event.level} />
            <span style={{ color: "#aaa", flexShrink: 0, fontWeight: 500 }}>
              {event.event_type}
            </span>
            <span style={{ color: "#777" }}>{event.message}</span>
          </div>
        ))}
        {events.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "#555" }}>
            No activity events yet
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "6px",
        background: "#111",
        border: "1px solid #222",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          color: "#666",
          marginBottom: "4px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  const color =
    level === "error" ? "#ef4444" : level === "warn" ? "#f59e0b" : "#555";
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 600,
        color,
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {level}
    </span>
  );
}
