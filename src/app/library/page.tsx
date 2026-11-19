"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Layers,
  Film,
  Tv,
  Sparkles,
  Gamepad2,
  BookMarked,
  BookOpen,
  LayoutGrid,
  List,
  Search,
  Filter,
  Heart,
  Plus,
  ArrowUpDown,
  Edit2,
} from "lucide-react";
import MediaCard from "@/components/MediaCard";
import StatusBadge from "@/components/StatusBadge";
import EditMediaModal from "@/components/EditMediaModal";
import AddMediaModal from "@/components/AddMediaModal";
import { MediaCardSkeleton, TableRowSkeleton } from "@/components/Skeleton";
import { UserMediaItem } from "@/lib/types";

function LibraryContent() {
  const searchParams = useSearchParams();
  const rawType = searchParams.get("type") || "all";
  const initialType = rawType === "book" ? "novel" : rawType;
  const initialStatus = searchParams.get("status") || "all";

  const [items, setItems] = useState<UserMediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Controls
  const [activeType, setActiveType] = useState<string>(initialType);
  const [activeStatus, setActiveStatus] = useState<string>(initialStatus);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modals
  const [selectedEditItem, setSelectedEditItem] = useState<UserMediaItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/media");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch("/api/media")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          setItems(data.items || []);
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

  // Filter & Sort Logic
  const filteredItems = items.filter((item) => {
    const itemType = (item.mediaType as string) === "book" ? "novel" : item.mediaType;
    const currentActiveType = activeType === "book" ? "novel" : activeType;
    if (currentActiveType !== "all" && itemType !== currentActiveType) return false;
    if (activeStatus !== "all" && item.status !== activeStatus) return false;
    if (filterFavorites && !item.isFavorite) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchGenre = item.genres?.toLowerCase().includes(q);
      if (!matchTitle && !matchGenre) return false;
    }
    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === "rating") {
      return (b.rating || 0) - (a.rating || 0);
    }
    if (sortBy === "year") {
      return (b.year || 0) - (a.year || 0);
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    // Default updatedAt
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const categoryTabs = [
    { type: "all", label: "All Vaults", icon: Layers },
    { type: "movie", label: "Movies", icon: Film },
    { type: "tv", label: "TV Shows", icon: Tv },
    { type: "anime", label: "Anime", icon: Sparkles },
    { type: "manga", label: "Manga", icon: BookMarked },
    { type: "game", label: "Games", icon: Gamepad2 },
    { type: "novel", label: "Novels & Books", icon: BookOpen },
  ];

  const statusPills = [
    { status: "all", label: "All Statuses" },
    { status: "in_progress", label: "In Progress" },
    { status: "completed", label: "Completed" },
    { status: "plan_to_consume", label: "Plan to Track" },
    { status: "on_hold", label: "On Hold" },
    { status: "dropped", label: "Dropped" },
  ];

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          marginBottom: "24px",
          width: "100%",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "clamp(1.6rem, 1.4rem + 1.2vw, 2.2rem)",
              fontWeight: 800,
              color: "#fff",
              marginBottom: "4px",
              lineHeight: 1.15,
            }}
          >
            Personal <span className="gradient-text">Library</span>
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "clamp(0.85rem, 0.78rem + 0.25vw, 0.95rem)",
            }}
          >
            {sortedItems.length} {sortedItems.length === 1 ? "entry" : "entries"} filtered
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn-primary"
          style={{
            fontSize: "clamp(0.8rem, 0.72rem + 0.35vw, 0.95rem)",
            padding: "clamp(8px, 0.6vw + 4px, 11px) clamp(14px, 1.2vw + 6px, 22px)",
          }}
        >
          <Plus size={16} /> Track New Item
        </button>
      </div>

      {/* Category Tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          maxWidth: "100%",
          paddingBottom: "8px",
          marginBottom: "20px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {categoryTabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeType === tab.type;
          const count = items.filter((i) => {
            const iType = (i.mediaType as string) === "book" ? "novel" : i.mediaType;
            return tab.type === "all" || iType === tab.type;
          }).length;
          return (
            <button
              key={tab.type}
              onClick={() => setActiveType(tab.type)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                background: isSelected ? "var(--accent-gradient)" : "transparent",
                color: isSelected ? "#fff" : "var(--text-muted)",
                border: "none",
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={16} />
              {tab.label}
              <span
                style={{
                  fontSize: "0.74rem",
                  padding: "2px 6px",
                  borderRadius: "9999px",
                  background: isSelected ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.06)",
                  color: isSelected ? "#fff" : "var(--text-dim)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and View Toolbar */}
      <div
        className="glass-panel"
        style={{
          padding: "clamp(12px, 1.2vw, 18px)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "28px",
          maxWidth: "100%",
        }}
      >
        {/* Search input in library */}
        <div style={{ position: "relative", minWidth: "240px", flex: 1, maxWidth: "360px" }}>
          <Search size={16} color="var(--text-dim)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            placeholder="Filter library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-control"
            style={{ paddingLeft: "36px", height: "38px", fontSize: "0.85rem" }}
          />
        </div>

        {/* Status Pills */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {statusPills.map((pill) => (
            <button
              key={pill.status}
              onClick={() => setActiveStatus(pill.status)}
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: "9999px",
                cursor: "pointer",
                transition: "all 0.2s",
                background: activeStatus === pill.status ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.03)",
                color: activeStatus === pill.status ? "var(--accent-purple)" : "var(--text-muted)",
                border: activeStatus === pill.status ? "1px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
              }}
            >
              {pill.label}
            </button>
          ))}

          {/* Favorites filter */}
          <button
            onClick={() => setFilterFavorites(!filterFavorites)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "0.78rem",
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: "9999px",
              cursor: "pointer",
              transition: "all 0.2s",
              background: filterFavorites ? "rgba(236, 72, 153, 0.2)" : "rgba(255, 255, 255, 0.03)",
              color: filterFavorites ? "var(--accent-pink)" : "var(--text-muted)",
              border: filterFavorites ? "1px solid var(--accent-pink)" : "1px solid var(--border-subtle)",
            }}
          >
            <Heart size={12} fill={filterFavorites ? "currentColor" : "none"} />
            Favorites
          </button>
        </div>

        {/* Sort & Grid/List Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ArrowUpDown size={14} color="var(--text-dim)" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="select-control"
              style={{ height: "38px", padding: "6px 12px", fontSize: "0.82rem", width: "auto" }}
            >
              <option value="updatedAt">Recently Updated</option>
              <option value="rating">Highest Rated</option>
              <option value="year">Release Year</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.05)", padding: "3px", borderRadius: "6px" }}>
            <button
              onClick={() => setViewMode("grid")}
              className="btn-icon"
              style={{
                width: "32px",
                height: "32px",
                background: viewMode === "grid" ? "rgba(139, 92, 246, 0.3)" : "transparent",
                color: viewMode === "grid" ? "#fff" : "var(--text-dim)",
                border: "none",
              }}
              title="Poster Grid"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="btn-icon"
              style={{
                width: "32px",
                height: "32px",
                background: viewMode === "list" ? "rgba(139, 92, 246, 0.3)" : "transparent",
                color: viewMode === "list" ? "#fff" : "var(--text-dim)",
                border: "none",
              }}
              title="Compact Table"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Media Items Presentation */}
      {loading ? (
        viewMode === "grid" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "20px",
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="glass-panel" style={{ overflowX: "auto", borderRadius: "var(--radius-md)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : sortedItems.length === 0 ? (
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
              background: "rgba(255, 255, 255, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              marginBottom: "16px",
            }}
          >
            <Filter size={24} />
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            No media matches your filter
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "420px", marginBottom: "20px" }}>
            Try resetting filters or start tracking new titles in this category.
          </p>
          <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
            <Plus size={16} /> Track a New Title
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "20px",
          }}
        >
          {sortedItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onEdit={(it) => setSelectedEditItem(it)}
            />
          ))}
        </div>
      ) : (
        /* Compact List View */
        <div className="glass-panel" style={{ overflowX: "auto", borderRadius: "var(--radius-md)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-dim)", fontSize: "0.78rem", textTransform: "uppercase" }}>
                <th style={{ padding: "14px 20px" }}>Title</th>
                <th style={{ padding: "14px 16px" }}>Type</th>
                <th style={{ padding: "14px 16px" }}>Status</th>
                <th style={{ padding: "14px 16px" }}>Score</th>
                <th style={{ padding: "14px 16px" }}>Progress</th>
                <th style={{ padding: "14px 20px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "14px 20px", fontWeight: 600, color: "#fff" }}>
                    {item.title} {item.year ? `(${item.year})` : ""}
                  </td>
                  <td style={{ padding: "14px 16px", textTransform: "capitalize", color: "var(--accent-cyan)", fontSize: "0.82rem" }}>
                    {item.mediaType}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={{ padding: "14px 16px", color: "#facc15", fontWeight: 700 }}>
                    {item.rating ? `★ ${item.rating}` : "—"}
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {item.mediaType === "game"
                      ? `${item.hoursPlayed || 0} hrs`
                      : item.mediaType === "manga" || item.mediaType === "novel" || (item.mediaType as string) === "book"
                      ? `${item.readChapters || 0} / ${item.totalChapters || "?"} ch`
                      : `${item.watchedEpisodes || 0} / ${item.totalEpisodes || "?"} ep`}
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    <button
                      onClick={() => setSelectedEditItem(item)}
                      className="btn-icon"
                      style={{ width: "32px", height: "32px" }}
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit & Add Modals with explicit keys to guarantee zero stale-state retention */}
      <EditMediaModal
        key={selectedEditItem ? `edit-${selectedEditItem.id}` : "edit-closed"}
        item={selectedEditItem}
        isOpen={Boolean(selectedEditItem)}
        onClose={() => setSelectedEditItem(null)}
        onUpdated={() => fetchItems()}
        onDeleted={() => fetchItems()}
      />

      <AddMediaModal
        key={isAddModalOpen ? `add-open-${activeType}` : "add-closed"}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultType={activeType === "all" ? "game" : activeType}
        onSuccess={() => fetchItems()}
      />
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>Loading library...</div>}>
      <LibraryContent />
    </Suspense>
  );
}
