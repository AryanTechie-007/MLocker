import React from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = "20px",
  borderRadius = "var(--radius-sm)",
  style,
  className = "",
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function MediaCardSkeleton() {
  return (
    <div
      className="glass-panel"
      style={{
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "360px",
      }}
    >
      <Skeleton height="240px" borderRadius="0" />
      <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        <Skeleton height="18px" width="85%" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
          <Skeleton height="20px" width="70px" borderRadius="9999px" />
          <Skeleton height="16px" width="40px" />
        </div>
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="glass-panel" style={{ padding: "20px" }}>
      <Skeleton height="14px" width="100px" style={{ marginBottom: "12px" }} />
      <Skeleton height="36px" width="60px" style={{ marginBottom: "8px" }} />
      <Skeleton height="12px" width="120px" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <td style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Skeleton width="36px" height="48px" borderRadius="4px" />
          <div style={{ flex: 1 }}>
            <Skeleton height="16px" width="160px" style={{ marginBottom: "6px" }} />
            <Skeleton height="12px" width="80px" />
          </div>
        </div>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <Skeleton height="20px" width="60px" borderRadius="9999px" />
      </td>
      <td style={{ padding: "14px 16px" }}>
        <Skeleton height="16px" width="40px" />
      </td>
      <td style={{ padding: "14px 16px" }}>
        <Skeleton height="16px" width="70px" />
      </td>
      <td style={{ padding: "14px 20px", textAlign: "right" }}>
        <Skeleton height="28px" width="28px" borderRadius="6px" style={{ marginLeft: "auto" }} />
      </td>
    </tr>
  );
}
