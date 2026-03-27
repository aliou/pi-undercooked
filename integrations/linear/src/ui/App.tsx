import { useState } from "react";
import { Layout } from "./components/Layout";
import { SessionDetail } from "./components/SessionDetail";
import { SessionList } from "./components/SessionList";

export function App() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );

  return (
    <Layout>
      <div style={{ display: "flex", gap: "24px", padding: "24px" }}>
        <div style={{ flex: "0 0 400px" }}>
          <SessionList
            selectedId={selectedSessionId}
            onSelect={setSelectedSessionId}
          />
        </div>
        <div style={{ flex: 1 }}>
          {selectedSessionId ? (
            <SessionDetail sessionId={selectedSessionId} />
          ) : (
            <div
              style={{
                padding: "48px",
                textAlign: "center",
                color: "#666",
              }}
            >
              Select a session to view details
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
