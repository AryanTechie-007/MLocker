"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  BarChart3,
  CheckCircle2,
  Film,
  Gamepad2,
  Star,
  Award,
} from "lucide-react";
import { Skeleton, StatCardSkeleton } from "@/components/Skeleton";
import { StatsResponse, UserMediaItem } from "@/lib/types";

const COLORS = ["#8b5cf6", "#06b6d4", "#ec4899", "#10b981", "#f59e0b", "#3b82f6"];

const emptySubscribe = () => () => {};

export default function StatsPage() {
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          setStats(data.stats);
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

  if (loading || !isClient || !stats) {
    return (
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div style={{ marginBottom: "36px" }}>
          <Skeleton width="180px" height="24px" style={{ marginBottom: "12px" }} />
          <Skeleton width="340px" height="40px" style={{ marginBottom: "12px" }} />
          <Skeleton width="480px" height="18px" />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "18px",
            marginBottom: "36px",
          }}
        >
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "24px" }}>
          <div className="glass-panel" style={{ padding: "28px", height: "380px" }}>
            <Skeleton width="200px" height="24px" style={{ marginBottom: "20px" }} />
            <Skeleton width="100%" height="280px" />
          </div>
          <div className="glass-panel" style={{ padding: "28px", height: "380px" }}>
            <Skeleton width="200px" height="24px" style={{ marginBottom: "20px" }} />
            <Skeleton width="100%" height="280px" />
          </div>
        </div>
      </div>
    );
  }

  // Pre-process status stacked bar chart data
  const statusStackedData = [
    {
      category: "Movies",
      Completed: stats?.statusByType?.movie?.completed || 0,
      "In Progress": stats?.statusByType?.movie?.in_progress || 0,
      Planned: stats?.statusByType?.movie?.plan_to_consume || 0,
    },
    {
      category: "TV Shows",
      Completed: stats?.statusByType?.tv?.completed || 0,
      "In Progress": stats?.statusByType?.tv?.in_progress || 0,
      Planned: stats?.statusByType?.tv?.plan_to_consume || 0,
    },
    {
      category: "Anime",
      Completed: stats?.statusByType?.anime?.completed || 0,
      "In Progress": stats?.statusByType?.anime?.in_progress || 0,
      Planned: stats?.statusByType?.anime?.plan_to_consume || 0,
    },
    {
      category: "Manga",
      Completed: stats?.statusByType?.manga?.completed || 0,
      "In Progress": stats?.statusByType?.manga?.in_progress || 0,
      Planned: stats?.statusByType?.manga?.plan_to_consume || 0,
    },
    {
      category: "Games",
      Completed: stats?.statusByType?.game?.completed || 0,
      "In Progress": stats?.statusByType?.game?.in_progress || 0,
      Planned: stats?.statusByType?.game?.plan_to_consume || 0,
    },
    {
      category: "Novels",
      Completed: stats?.statusByType?.novel?.completed || 0,
      "In Progress": stats?.statusByType?.novel?.in_progress || 0,
      Planned: stats?.statusByType?.novel?.plan_to_consume || 0,
    },
  ];

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "36px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span className="badge badge-progress" style={{ fontSize: "0.8rem" }}>
            <BarChart3 size={13} /> Deep Analytics Engine
          </span>
        </div>
        <h1 style={{ fontSize: "2.4rem", fontWeight: 800, color: "#fff", lineHeight: 1.15 }}>
          Media <span className="gradient-text">Analytics & Intelligence</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "1rem", marginTop: "6px" }}>
          Visualize your consumption velocity, completion percentages, scores, and media affinities.
        </p>
      </div>

      {/* KPI Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "18px",
          marginBottom: "36px",
        }}
      >
        <div className="glass-panel" style={{ padding: "24px", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
              Vault Population
            </span>
            <Film size={20} color="var(--accent-purple)" />
          </div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#fff", marginTop: "12px", fontFamily: "var(--font-mono)" }}>
            {stats?.totalTracked || 0}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Across all 6 media formats
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
              Completion Ratio
            </span>
            <CheckCircle2 size={20} color="var(--status-completed)" />
          </div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--status-completed)", marginTop: "12px", fontFamily: "var(--font-mono)" }}>
            {stats?.totalTracked
              ? Math.round(((stats?.statusCounts?.completed || 0) / stats.totalTracked) * 100)
              : 0}
            %
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
            {stats?.statusCounts?.completed || 0} finished entries
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
              Mean Score Given
            </span>
            <Star size={20} color="#facc15" />
          </div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#facc15", marginTop: "12px", fontFamily: "var(--font-mono)" }}>
            {stats?.averageRating}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Out of 10.0 scale
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
              Gaming Log
            </span>
            <Gamepad2 size={20} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--accent-cyan)", marginTop: "12px", fontFamily: "var(--font-mono)" }}>
            {stats?.totalHoursPlayed}h
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Total interactive playtime
          </div>
        </div>
      </div>

      {/* Row 1 Charts: Media Type Distribution Pie & Rating Histogram */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "24px",
          marginBottom: "36px",
        }}
      >
        {/* Media Distribution Pie */}
        <div className="glass-panel" style={{ padding: "28px", borderRadius: "var(--radius-md)" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            Media Distribution
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "20px" }}>
            Proportion of entries across film, series, games, and literature
          </p>

          <div style={{ height: "280px", width: "100%" }}>
            {stats?.mediaTypeChartData?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.mediaTypeChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="name"
                  >
                    {stats.mediaTypeChartData.map((_, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(18, 21, 33, 0.95)",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
                Add media to populate distribution chart
              </div>
            )}
          </div>
        </div>

        {/* Rating Histogram */}
        <div className="glass-panel" style={{ padding: "28px", borderRadius: "var(--radius-md)" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            Rating Distribution (Histogram)
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "20px" }}>
            How you grade media on the 1 to 10 scale
          </p>

          <div style={{ height: "280px", width: "100%" }}>
            {stats?.ratingChartData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.ratingChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="score" stroke="var(--text-dim)" fontSize={12} />
                  <YAxis stroke="var(--text-dim)" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(18, 21, 33, 0.95)",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="count" fill="url(#purpleGradient)" radius={[4, 4, 0, 0]} />
                  <defs>
                    <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
                Rate media to visualize your scoring curve
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Status Breakdown by Category & Top Genres */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "24px",
          marginBottom: "36px",
        }}
      >
        {/* Status Breakdown Stacked Bar */}
        <div className="glass-panel" style={{ padding: "28px", borderRadius: "var(--radius-md)" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            Status Breakdown by Category
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "20px" }}>
            Comparison of completed, in progress, and planned items
          </p>

          <div style={{ height: "280px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusStackedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="category" stroke="var(--text-dim)" fontSize={12} />
                <YAxis stroke="var(--text-dim)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(18, 21, 33, 0.95)",
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Legend />
                <Bar dataKey="Completed" stackId="a" fill="#34d399" />
                <Bar dataKey="In Progress" stackId="a" fill="#38bdf8" />
                <Bar dataKey="Planned" stackId="a" fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Genres Horizontal Bar Chart */}
        <div className="glass-panel" style={{ padding: "28px", borderRadius: "var(--radius-md)" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            Top Affinity Genres
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "20px" }}>
            Most prevalent genres and themes in your library
          </p>

          <div style={{ height: "280px", width: "100%" }}>
            {stats?.topGenres?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={stats.topGenres.slice(0, 7)}
                  margin={{ top: 5, right: 20, left: 40, bottom: 5 }}
                >
                  <XAxis type="number" stroke="var(--text-dim)" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="var(--text-dim)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(18, 21, 33, 0.95)",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="count" fill="#ec4899" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
                Add more titles to analyze your favorite genres
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hall of Fame: Highest Rated Titles */}
      {stats?.topRated && stats.topRated.length > 0 && (
        <section style={{ marginBottom: "36px" }}>
          <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Award size={20} color="#facc15" /> Hall of Fame (Your Highest Rated)
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            {stats.topRated.map((item: UserMediaItem) => (
              <Link
                key={item.id}
                href={`/media/${item.id}`}
                className="glass-panel"
                style={{
                  padding: "16px",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "10px",
                    background: "rgba(250, 204, 21, 0.15)",
                    border: "1px solid rgba(250, 204, 21, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: "#facc15",
                    fontFamily: "var(--font-mono)",
                    flexShrink: 0,
                  }}
                >
                  ★ {item.rating}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.title}
                  </h4>
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", textTransform: "capitalize" }}>
                    {item.mediaType}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
