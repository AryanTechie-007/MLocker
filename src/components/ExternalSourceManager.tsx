"use client";

import React, { useState } from "react";
import {
  ExternalLink,
  Plus,
  Trash2,
  Edit2,
  Globe,
  Tv,
  BookOpen,
  Gamepad2,
  ShoppingBag,
  Loader2,
  X,
} from "lucide-react";
import { MediaSourceItem } from "@/lib/api/types";
import {
  SOURCE_TYPES,
  type SourceType,
  extractNormalizedDomain,
  detectSourceType,
} from "@/lib/domain/source-domain";
import { launchExternalUrl } from "@/lib/launch-url";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { apiFetch, getErrorMessage } from "@/lib/api-client";

interface Props {
  mediaId: string;
  mediaTitle: string;
  initialSources?: MediaSourceItem[];
}

export default function ExternalSourceManager({
  mediaId,
  mediaTitle,
  initialSources = [],
}: Props) {
  const { showToast } = useToast();
  const [sources, setSources] = useState<MediaSourceItem[]>(initialSources);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<MediaSourceItem | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<MediaSourceItem | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("web");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Open modal for new source
  const handleOpenAdd = () => {
    setEditingSource(null);
    setName("");
    setUrl("");
    setSourceType("web");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal to edit existing source
  const handleOpenEdit = (src: MediaSourceItem) => {
    setEditingSource(src);
    setName(src.name);
    setUrl(src.url);
    setSourceType((src.sourceType as SourceType) || "web");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Auto-detect source type when URL changes if user hasn't explicitly customized
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setFormError(null);
    if (!editingSource) {
      const domain = extractNormalizedDomain(newUrl);
      if (domain) {
        const detected = detectSourceType(domain);
        setSourceType(detected as SourceType);
      }
    }
  };

  // Save (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();

    if (!trimmedName) {
      setFormError("Source name is required.");
      return;
    }
    if (!trimmedUrl) {
      setFormError("Destination URL is required.");
      return;
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setFormError("Only http:// and https:// URLs are permitted.");
        return;
      }
    } catch {
      setFormError("Please enter a valid, well-formed URL.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingSource) {
        // PATCH
        const data = await apiFetch<{ source: MediaSourceItem }>(`/api/sources/${editingSource.id}`, {
          method: "PATCH",
          body: {
            name: trimmedName,
            url: trimmedUrl,
            sourceType,
          },
        });

        setSources((prev) =>
          prev.map((s) => (s.id === editingSource.id ? data.source : s))
        );
        showToast("Source updated successfully", "success");
      } else {
        // POST
        const data = await apiFetch<{ source: MediaSourceItem }>(`/api/media/${mediaId}/sources`, {
          method: "POST",
          body: {
            name: trimmedName,
            url: trimmedUrl,
            sourceType,
          },
        });

        setSources((prev) => [...prev, data.source]);
        showToast("Source added successfully", "success");
      }

      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error("Source save error:", err);
      setFormError(getErrorMessage(err, "An unexpected error occurred"));
    } finally {
      setSubmitting(false);
    }
  };

  // Delete
  const confirmDelete = async () => {
    if (!sourceToDelete) return;
    try {
      await apiFetch(`/api/sources/${sourceToDelete.id}`, {
        method: "DELETE",
      });
      setSources((prev) => prev.filter((s) => s.id !== sourceToDelete.id));
      showToast("Source removed", "success");
    } catch (err: unknown) {
      console.error("Delete source error:", err);
      showToast(getErrorMessage(err, "Failed to delete source"), "error");
    } finally {
      setSourceToDelete(null);
    }
  };

  // Icon mapping
  const renderTypeIcon = (type: string) => {
    switch (type) {
      case "stream":
        return <Tv size={14} style={{ color: "var(--accent-cyan)" }} />;
      case "reader":
        return <BookOpen size={14} style={{ color: "var(--status-completed)" }} />;
      case "game":
        return <Gamepad2 size={14} style={{ color: "var(--accent-purple)" }} />;
      case "store":
        return <ShoppingBag size={14} style={{ color: "var(--accent-amber)" }} />;
      default:
        return <Globe size={14} style={{ color: "var(--text-muted)" }} />;
    }
  };

  const previewDomain = extractNormalizedDomain(url);

  return (
    <div
      className="glass-panel"
      style={{
        padding: "24px",
        borderRadius: "var(--radius-lg)",
        marginBottom: "32px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1.2rem",
              fontWeight: 700,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Globe size={20} style={{ color: "var(--accent-purple)" }} />
            External Sources & Links
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "2px" }}>
            Register your preferred watch, read, play, or store destinations.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="btn-primary"
          style={{ padding: "8px 16px", fontSize: "0.85rem" }}
        >
          <Plus size={16} /> Add Source
        </button>
      </div>

      {sources.length === 0 ? (
        <div
          style={{
            padding: "36px 20px",
            textAlign: "center",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            background: "rgba(255, 255, 255, 0.015)",
          }}
        >
          <Globe
            size={36}
            style={{ color: "var(--text-dim)", margin: "0 auto 10px", opacity: 0.5 }}
          />
          <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 500 }}>
            No external sources configured for this item yet.
          </p>
          <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "4px" }}>
            Click &ldquo;Add Source&rdquo; to attach your personalized streaming, reading, or storefront links.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "14px",
          }}
        >
          {sources.map((src) => (
            <div
              key={src.id}
              className="glass-panel"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                gap: "12px",
                transition: "all 0.2s ease",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      color: "var(--text-main)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {renderTypeIcon(src.sourceType)}
                    {src.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      textTransform: "uppercase",
                      fontFamily: "var(--font-mono)",
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      backgroundColor: "rgba(139, 92, 246, 0.15)",
                      color: "var(--accent-purple)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      fontWeight: 700,
                    }}
                  >
                    {src.sourceType}
                  </span>
                </div>
                <p
                  title={src.url}
                  style={{
                    fontSize: "0.78rem",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-dim)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {src.normalizedDomain || src.url}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: "12px",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  onClick={() => launchExternalUrl(src.url)}
                  className="btn-secondary"
                  style={{
                    padding: "5px 12px",
                    fontSize: "0.8rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "var(--accent-cyan)",
                    borderColor: "rgba(6, 182, 212, 0.3)",
                  }}
                  title={`Launch ${src.name}`}
                >
                  <ExternalLink size={14} />
                  Launch
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(src)}
                    className="btn-icon"
                    style={{ width: "32px", height: "32px" }}
                    title="Edit source"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceToDelete(src)}
                    className="btn-icon"
                    style={{ width: "32px", height: "32px", color: "var(--status-dropped)" }}
                    title="Delete source"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Source Modal */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: "100%",
              maxWidth: "480px",
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-highlight)",
              borderRadius: "var(--radius-lg)",
              padding: "28px",
              boxShadow: "var(--shadow-pop)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>
                {editingSource ? "Edit External Source" : "Add External Source"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn-icon"
                style={{ width: "32px", height: "32px" }}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "20px" }}>
              Configuring destination for{" "}
              <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{mediaTitle}</span>
            </p>

            {formError && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "rgba(248, 113, 113, 0.15)",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                  color: "var(--status-dropped)",
                  fontSize: "0.85rem",
                }}
              >
                {formError}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div>
                <label
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Source Display Name <span style={{ color: "var(--status-dropped)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Netflix, Crunchyroll, Steam, Open Library"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="input-control"
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Destination URL <span style={{ color: "var(--status-dropped)" }}>*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  maxLength={2000}
                  className="input-control"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
                />
                {previewDomain && (
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginTop: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span style={{ color: "var(--text-dim)" }}>Domain:</span> {previewDomain}
                  </p>
                )}
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Category / Type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as SourceType)}
                  className="select-control"
                  style={{ textTransform: "capitalize" }}
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t} style={{ textTransform: "capitalize" }}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "10px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="btn-secondary"
                  style={{ padding: "8px 18px", fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                  style={{ padding: "8px 20px", fontSize: "0.85rem" }}
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingSource ? "Save Changes" : "Add Source"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(sourceToDelete)}
        title="Remove External Source"
        message={`Are you sure you want to remove "${sourceToDelete?.name}"? You can re-add it at any time.`}
        confirmText="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setSourceToDelete(null)}
      />
    </div>
  );
}
