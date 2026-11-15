"use client";

import { useEffect, useState, useCallback } from "react";
import { FolderHeart, Plus, Trash2, X, Loader2 } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Skeleton, MediaCardSkeleton } from "@/components/Skeleton";
import { Collection } from "@/lib/types";

export default function CollectionsPage() {
  const { showToast } = useToast();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);

  // New Collection Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete Confirm Dialog
  const [collectionToDelete, setCollectionToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      if (res.ok) {
        const data = await res.json();
        const colls: Collection[] = data.collections || [];
        setCollections(colls);
        if (colls.length > 0) {
          // Keep current selection if still exists, otherwise pick first
          setSelectedCollection((prev) => {
            if (prev) {
              const matched = colls.find((c) => c.id === prev.id);
              if (matched) return matched;
            }
            return colls[0];
          });
        } else {
          setSelectedCollection(null);
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load collections", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let ignore = false;
    fetch("/api/collections")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          const colls: Collection[] = data.collections || [];
          setCollections(colls);
          if (colls.length > 0) {
            setSelectedCollection(colls[0]);
          } else {
            setSelectedCollection(null);
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error(err);
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newColName.trim(),
          description: newColDesc.trim() || null,
        }),
      });
      if (res.ok) {
        showToast(`Created collection "${newColName.trim()}"!`, "success");
        setNewColName("");
        setNewColDesc("");
        setIsCreateOpen(false);
        fetchCollections();
      } else {
        showToast("Failed to create collection", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error while creating collection", "error");
    } finally {
      setCreating(false);
    }
  };

  const executeDeleteCollection = async () => {
    if (!collectionToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/collections/${collectionToDelete.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast(`Deleted collection "${collectionToDelete.name}"`, "info");
        setCollectionToDelete(null);
        fetchCollections();
      } else {
        showToast("Failed to delete collection", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error while deleting collection", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>
            Custom <span className="gradient-text">Collections</span>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Curate personalized watchlists, reading stacks, and gaming franchises.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="btn-primary"
          style={{ padding: "10px 20px" }}
        >
          <Plus size={16} /> New Collection
        </button>
      </div>

      {loading && collections.length === 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "28px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Skeleton height="70px" />
            <Skeleton height="70px" />
            <Skeleton height="70px" />
          </div>
          <div className="glass-panel" style={{ padding: "32px", minHeight: "360px" }}>
            <Skeleton height="36px" width="40%" style={{ marginBottom: "16px" }} />
            <Skeleton height="18px" width="60%" style={{ marginBottom: "32px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px" }}>
              <MediaCardSkeleton />
              <MediaCardSkeleton />
              <MediaCardSkeleton />
            </div>
          </div>
        </div>
      ) : collections.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: "60px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-purple)",
              marginBottom: "16px",
            }}
          >
            <FolderHeart size={26} />
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            No Collections Created Yet
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "420px", marginBottom: "20px" }}>
            Group your favorite anime arcs, movie marathons, book trilogies, or best games into tailored sets!
          </p>
          <button onClick={() => setIsCreateOpen(true)} className="btn-primary">
            <Plus size={16} /> Create First Collection
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "28px", alignItems: "start" }}>
          {/* Collections List Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {collections.map((col) => {
              const isSelected = selectedCollection?.id === col.id;
              const itemCount = col.items?.length || 0;
              return (
                <div
                  key={col.id}
                  onClick={() => setSelectedCollection(col)}
                  className="glass-panel"
                  style={{
                    padding: "16px 20px",
                    cursor: "pointer",
                    borderRadius: "var(--radius-sm)",
                    background: isSelected
                      ? "linear-gradient(90deg, rgba(139, 92, 246, 0.2) 0%, rgba(6, 182, 212, 0.1) 100%)"
                      : "var(--bg-card)",
                    border: isSelected ? "1px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h4 style={{ fontSize: "0.98rem", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {col.name}
                    </h4>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "2px" }}>
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollectionToDelete({ id: col.id, name: col.name });
                    }}
                    className="btn-icon"
                    style={{ width: "30px", height: "30px", border: "none", color: "var(--text-dim)" }}
                    title="Delete Collection"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected Collection View */}
          {selectedCollection && (
            <div className="glass-panel" style={{ padding: "32px", borderRadius: "var(--radius-md)" }}>
              <div style={{ marginBottom: "28px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "20px" }}>
                <h2 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#fff" }}>
                  {selectedCollection.name}
                </h2>
                {selectedCollection.description && (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: "6px" }}>
                    {selectedCollection.description}
                  </p>
                )}
              </div>

              {selectedCollection.items && selectedCollection.items.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "20px",
                  }}
                >
                  {selectedCollection.items.map((ci) => (
                    <MediaCard key={ci.id} item={ci.userMedia} />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)" }}>
                  No items in this collection yet. Browse your Library or Search to add titles!
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: "100%",
              maxWidth: "480px",
              backgroundColor: "var(--bg-elevated)",
              padding: "28px",
              borderRadius: "var(--radius-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>Create Collection</h3>
              <button onClick={() => setIsCreateOpen(false)} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Collection Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Studio Ghibli Classics, Cozy RPGs"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="input-control"
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="What brings these titles together?"
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  className="input-control"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating && <Loader2 size={14} className="spinner" />}
                  {creating ? "Creating..." : "Create Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(collectionToDelete)}
        title="Delete Collection"
        message={`Are you sure you want to delete "${collectionToDelete?.name}"? The media entries inside this collection will remain safe in your vault.`}
        confirmText="Delete Collection"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={executeDeleteCollection}
        onCancel={() => setCollectionToDelete(null)}
      />
    </div>
  );
}
