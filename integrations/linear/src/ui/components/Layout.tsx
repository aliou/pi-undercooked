import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #222",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 600 }}>Pi Linear Bridge</h1>
        <HealthIndicator />
      </header>
      <main>{children}</main>
    </div>
  );
}

function HealthIndicator() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "13px",
        color: "#888",
      }}
    >
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "#22c55e",
        }}
      />
      Running
    </div>
  );
}
