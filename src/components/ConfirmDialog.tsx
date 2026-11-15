"use client";

import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "20px",
      }}
      onClick={onCancel}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "28px",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "rgba(18, 21, 33, 0.95)",
          border: "1px solid var(--border-highlight)",
          boxShadow: "var(--shadow-pop)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: confirmVariant === "danger" ? "rgba(248, 113, 113, 0.15)" : "rgba(139, 92, 246, 0.15)",
              color: confirmVariant === "danger" ? "var(--status-dropped)" : "var(--accent-purple)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
              {title}
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary"
            style={{ padding: "8px 16px", fontSize: "0.88rem" }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "8px 18px",
              fontSize: "0.88rem",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background:
                confirmVariant === "danger"
                  ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                  : "var(--accent-gradient)",
            }}
          >
            {loading && <Loader2 size={14} className="spinner" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
