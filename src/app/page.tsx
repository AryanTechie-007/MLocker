"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Film,
  Tv,
  Sparkles,
  Gamepad2,
  BookOpen,
  Plus,
  Play,
  ArrowRight,
  BookMarked,
} from "lucide-react";
import MediaCard from "@/components/MediaCard";
import AddMediaModal from "@/components/AddMediaModal";
import EditMediaModal from "@/components/EditMediaModal";
import { useToast } from "@/components/Toast";
import { StatCardSkeleton, MediaCardSkeleton } from "@/components/Skeleton";
import { UserMediaItem, StatsResponse } from "@/lib/types";

export default function Dashboard() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [inProgressItems, setInProgressItems] = useState<UserMediaItem[]>([]);
  const [recentItems, setRecentItems] = useState<UserMediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal controls
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEditItem, setSelectedEditItem] = useState<UserMediaItem | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, inProgressRes, recentRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/media?status=in_progress"),
        fetch("/api/media?limit=6&sortBy=updatedAt"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      if (inProgressRes.ok) {
        const inProgressData = await inProgressRes.json();
        setInProgressItems(inProgressData.items || []);
      }

      if (recentRes.ok) {
        const recentData = await recentRes.json();
        setRecentItems(recentData.items || []);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      showToast("Failed to refresh dashboard data", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetch("/api/stats"),
      fetch("/api/media?status=in_progress"),
      fetch("/api/media?limit=6&sortBy=updatedAt"),
    ])
      .then(async ([statsRes, inProgressRes, recentRes]) => {
        if (ignore) return;
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.stats);
        }
        if (inProgressRes.ok) {
          const inProgressData = await inProgressRes.json();
          setInProgressItems(inProgressData.items || []);
        }
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          setRecentItems(recentData.items || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Dashboard fetch error:", err);
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleIncrementProgress = async (item: UserMediaItem) => {
    const update: Partial<UserMediaItem> = {};
    let message = "";

    if (item.mediaType === "anime" || item.mediaType === "tv") {
      const nextEp = (item.watchedEpisodes || 0) + 1;
      update.watchedEpisodes = nextEp;
      if (item.totalEpisodes && nextEp >= item.totalEpisodes) {
        update.status = "completed";
        message = `Completed ${item.title}! 🎉`;
      } else {
        message = `Ep ${nextEp}${item.totalEpisodes ? ` / ${item.totalEpisodes}` : ""} logged for ${item.title}`;
      }
    } else if (item.mediaType === "manga" || item.mediaType === "novel") {
      const nextCh = (item.readChapters || 0) + 1;
      update.readChapters = nextCh;
      if (item.totalChapters && nextCh >= item.totalChapters) {
        update.status = "completed";
        message = `Completed ${item.title}! 🎉`;
      } else {
        message = `Ch ${nextCh}${item.totalChapters ? ` / ${item.totalChapters}` : ""} logged for ${item.title}`;
      }
    } else if (item.mediaType === "game") {
      const nextHours = Math.round(((item.hoursPlayed || 0) + 1) * 10) / 10;
      update.hoursPlayed = nextHours;
      message = `Logged +1h for ${item.title} (${nextHours} hrs total)`;
    }

    try {
      const res = await fetch(`/api/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (res.ok) {
        showToast(message, "success");
        fetchData();
      } else {
        showToast("Failed to update progress", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error while updating progress", "error");
    }
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Banner & Quick Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "20px",
          marginBottom: "36px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 800, color: "#fff", lineHeight: 1.15 }}>
            Welcome to your <span className="gradient-text">Media Locker</span>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "1.02rem", marginTop: "6px" }}>
            Unified tracking for movies, TV shows, anime, and games.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary"
            style={{
              fontSize: "clamp(0.8rem, 0.72rem + 0.35vw, 0.95rem)",
              padding: "clamp(8px, 0.6vw + 4px, 12px) clamp(14px, 1.2vw + 6px, 22px)",
            }}
          >
            <Plus size={18} />
            Track New Media
          </button>
          <Link
            href="/search"
            className="btn-secondary"
            style={{
              fontSize: "clamp(0.8rem, 0.72rem + 0.35vw, 0.95rem)",
              padding: "clamp(8px, 0.6vw + 4px, 12px) clamp(12px, 1vw + 5px, 20px)",
            }}
          >
            Explore & Search
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "18px",
          marginBottom: "40px",
        }}
      >
        {loading && !stats ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <div className="glass-panel" style={{ padding: "20px" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
                Total Vault Items
              </span>
              <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "#fff", marginTop: "8px", fontFamily: "var(--font-mono)" }}>
                {stats?.totalTracked ?? 0}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", marginTop: "6px" }}>
                {stats?.favoriteCount ?? 0} marked as favorites
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "20px" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
                Currently In Progress
              </span>
              <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--status-progress)", marginTop: "8px", fontFamily: "var(--font-mono)" }}>
                {inProgressItems.length}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "6px" }}>
                Active games, series & reads
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "20px" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
                Completed
              </span>
              <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--status-completed)", marginTop: "8px", fontFamily: "var(--font-mono)" }}>
                {stats?.statusCounts?.completed ?? 0}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "6px" }}>
                Conquered stories & titles
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "20px" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
                Gaming Hours Logged
              </span>
              <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "#facc15", marginTop: "8px", fontFamily: "var(--font-mono)" }}>
                {stats?.totalHoursPlayed ?? 0}h
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "6px" }}>
                Total playtime tracked
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "20px" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
                Episodes Finished
              </span>
              <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--accent-purple)", marginTop: "8px", fontFamily: "var(--font-mono)" }}>
                {stats?.totalEpisodesWatched ?? 0}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "6px" }}>
                Anime & TV episodes
              </div>
            </div>
          </>
        )}
      </div>

      {/* Currently In Progress (Shelf) */}
      <section style={{ marginBottom: "48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fff" }}>
              Continue Consuming
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Pick up right where you left off
            </p>
          </div>
          <Link
            href="/library?status=in_progress"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--accent-cyan)",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            View All <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "20px",
            }}
          >
            <MediaCardSkeleton />
            <MediaCardSkeleton />
            <MediaCardSkeleton />
          </div>
        ) : inProgressItems.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "20px",
            }}
          >
            {inProgressItems.map((item) => (
              <div key={item.id} style={{ position: "relative" }}>
                <MediaCard
                  item={item}
                  onEdit={(it) => setSelectedEditItem(it)}
                />
                {/* Quick bump button */}
                <button
                  onClick={() => handleIncrementProgress(item)}
                  className="btn-primary"
                  style={{
                    position: "absolute",
                    top: "14px",
                    right: "50px",
                    padding: "4px 8px",
                    fontSize: "0.72rem",
                    borderRadius: "6px",
                    zIndex: 10,
                  }}
                  title={
                    item.mediaType === "game"
                      ? "+1 Hour"
                      : item.mediaType === "manga" || item.mediaType === "novel"
                      ? "+1 Chapter"
                      : "+1 Episode"
                  }
                >
                  {item.mediaType === "game"
                    ? "+1h"
                    : item.mediaType === "manga" || item.mediaType === "novel"
                    ? "+1 Ch"
                    : "+1 Ep"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="glass-panel"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(139, 92, 246, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
                color: "var(--accent-purple)",
              }}
            >
              <Play size={24} />
            </div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
              Nothing in progress right now
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "420px", marginBottom: "20px" }}>
              Start tracking a movie, television series, anime, manga, novel or game to see your active progress here!
            </p>
            <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
              <Plus size={16} /> Track New Item
            </button>
          </div>
        )}
      </section>

      {/* Category Vaults Quick Access */}
      <section style={{ marginBottom: "48px" }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fff", marginBottom: "20px" }}>
          Media Vaults
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
          }}
        >
          {[
            { type: "movie", name: "Movies", icon: Film, color: "#8b5cf6", count: stats?.mediaTypeCounts?.movie || 0 },
            { type: "tv", name: "TV Series", icon: Tv, color: "#38bdf8", count: stats?.mediaTypeCounts?.tv || 0 },
            { type: "anime", name: "Anime", icon: Sparkles, color: "#ec4899", count: stats?.mediaTypeCounts?.anime || 0 },
            { type: "manga", name: "Manga", icon: BookMarked, color: "#d946ef", count: stats?.mediaTypeCounts?.manga || 0 },
            { type: "game", name: "Games", icon: Gamepad2, color: "#10b981", count: stats?.mediaTypeCounts?.game || 0 },
            { type: "novel", name: "Novels & Books", icon: BookOpen, color: "#f59e0b", count: stats?.mediaTypeCounts?.novel || 0 },
          ].map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.type}
                href={`/library?type=${cat.type}`}
                className="glass-panel"
                style={{
                  padding: "20px",
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: "130px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: `${cat.color}20`,
                      color: cat.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px solid ${cat.color}40`,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", fontFamily: "var(--font-mono)" }}>
                    {cat.count}
                  </span>
                </div>
                <div>
                  <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{cat.name}</h4>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Explore vault →</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Activity Section */}
      <section style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fff" }}>
              Recently Added & Updated
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Latest entries in your locker
            </p>
          </div>
          <Link
            href="/library"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--accent-cyan)",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            All Items <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: "20px",
            }}
          >
            <MediaCardSkeleton />
            <MediaCardSkeleton />
            <MediaCardSkeleton />
            <MediaCardSkeleton />
          </div>
        ) : recentItems.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: "20px",
            }}
          >
            {recentItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onEdit={(it) => setSelectedEditItem(it)}
              />
            ))}
          </div>
        ) : (
          <div
            className="glass-panel"
            style={{
              padding: "36px",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            Your locker is empty. Start adding some media!
          </div>
        )}
      </section>

      {/* Modals */}
      <AddMediaModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => fetchData()}
      />

      <EditMediaModal
        item={selectedEditItem}
        isOpen={Boolean(selectedEditItem)}
        onClose={() => setSelectedEditItem(null)}
        onUpdated={() => fetchData()}
        onDeleted={() => fetchData()}
      />
    </div>
  );
}
