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
        const res = await fetch(`/api/sources/${editingSource.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            url: trimmedUrl,
            sourceType,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update source");
        }

        const data = await res.json();
        setSources((prev) =>
          prev.map((s) => (s.id === editingSource.id ? data.source : s))
        );
        showToast("Source updated successfully", "success");
      } else {
        // POST
        const res = await fetch(`/api/media/${mediaId}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            url: trimmedUrl,
            sourceType,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to add source");
        }

        const data = await res.json();
        setSources((prev) => [...prev, data.source]);
        showToast("Source added successfully", "success");
      }

      setIsModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete
  const confirmDelete = async () => {
    if (!sourceToDelete) return;
    try {
      const res = await fetch(`/api/sources/${sourceToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete source");
      }
      setSources((prev) => prev.filter((s) => s.id !== sourceToDelete.id));
      showToast("Source removed", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete source";
      showToast(msg, "error");
    } finally {
      setSourceToDelete(null);
    }
  };

  // Icon mapping
  const renderTypeIcon = (type: string) => {
    switch (type) {
      case "stream":
        return <Tv className="w-3.5 h-3.5 text-blue-400" />;
      case "reader":
        return <BookOpen className="w-3.5 h-3.5 text-emerald-400" />;
      case "game":
        return <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />;
      case "store":
        return <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Globe className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const previewDomain = extractNormalizedDomain(url);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            External Sources & Links
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Register your preferred watch, read, play, or store destinations.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Source
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-800 rounded-lg">
          <p className="text-sm text-slate-400">
            No external sources configured for this item yet.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Click &ldquo;Add Source&rdquo; to attach your personalized streaming, reading, or storefront links.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sources.map((src) => (
            <div
              key={src.id}
              className="group relative flex flex-col justify-between p-3.5 bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-lg transition-all"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-medium text-sm text-slate-200 truncate flex items-center gap-1.5">
                    {renderTypeIcon(src.sourceType)}
                    {src.name}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                    {src.sourceType}
                  </span>
                </div>
                <p className="text-xs font-mono text-slate-400 truncate mb-3" title={src.url}>
                  {src.normalizedDomain || src.url}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-auto">
                <button
                  type="button"
                  onClick={() => launchExternalUrl(src.url)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-medium rounded transition-colors cursor-pointer"
                  title={`Launch ${src.name}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Launch
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(src)}
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                    title="Edit source"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceToDelete(src)}
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors cursor-pointer"
                    title="Delete source"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Source Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-semibold text-white mb-1">
              {editingSource ? "Edit External Source" : "Add External Source"}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Configuring destination for <span className="text-slate-200 font-medium">{mediaTitle}</span>
            </p>

            {formError && (
              <div className="mb-4 p-3 bg-rose-950/50 border border-rose-800/80 rounded-lg text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Source Display Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Netflix, Crunchyroll, Steam, Open Library"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Destination URL <span className="text-rose-400">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  maxLength={2000}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden font-mono text-xs"
                />
                {previewDomain && (
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
                    <span className="text-slate-500">Domain:</span> {previewDomain}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Category / Type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as SourceType)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg text-sm text-slate-100 focus:outline-hidden capitalize"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
