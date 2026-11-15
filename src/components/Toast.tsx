"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, type }]);

      setTimeout(() => {
        removeToast(id);
      }, 3500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Floating Container */}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          maxWidth: "380px",
          width: "calc(100% - 48px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => {
          const bg = "rgba(18, 21, 33, 0.95)";
          let borderColor = "var(--border-subtle)";
          let iconColor = "var(--accent-cyan)";
          let Icon = Info;

          if (toast.type === "success") {
            borderColor = "rgba(52, 211, 153, 0.4)";
            iconColor = "var(--status-completed)";
            Icon = CheckCircle2;
          } else if (toast.type === "error") {
            borderColor = "rgba(248, 113, 113, 0.4)";
            iconColor = "var(--status-dropped)";
            Icon = AlertCircle;
          }

          return (
            <div
              key={toast.id}
              className="glass-panel"
              style={{
                pointerEvents: "auto",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                borderRadius: "var(--radius-md)",
                backgroundColor: bg,
                border: `1px solid ${borderColor}`,
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
                animation: "slideIn 0.25s ease-out forwards",
              }}
            >
              <Icon size={18} color={iconColor} style={{ flexShrink: 0 }} />
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  color: "#fff",
                  fontWeight: 500,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {toast.message}
              </p>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4px",
                  borderRadius: "4px",
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
