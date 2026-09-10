"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FolderHeart, Plus, Trash2, Layers, Film, X } from "lucide-react";
import MediaCard from "@/components/MediaCard";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Collection Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/collections");
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections || []);
        if (data.collections?.length > 0 && !selectedCollection) {
          setSelectedCollection(data.collections[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
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
        setNewColName("");
        setNewColDesc("");
        setIsCreateOpen(false);
        fetchCollections();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCollection = async (id: string, name: string) => {
    if (!confirm(`Delete collection "${name}"?`)) return;
    try {
      await fetch(`/api/collections/${id}`, { method: "DELETE" });
      setSelectedCollection(null);
      fetchCollections();
    } catch (err) {
      console.error(err);
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

      {loading ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
          Loading your collections...
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
                      handleDeleteCollection(col.id, col.name);
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

              {selectedCollection.items?.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "20px",
                  }}
                >
                  {selectedCollection.items.map((ci: any) => (
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
                  {creating ? "Creating..." : "Create Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
