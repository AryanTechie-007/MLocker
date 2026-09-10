"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Film,
  Search,
  FolderHeart,
  BarChart3,
  Tv,
  Gamepad2,
  BookOpen,
  Sparkles,
  Layers,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "My Library", href: "/library", icon: Layers },
    { name: "Search & Add", href: "/search", icon: Search },
    { name: "Collections", href: "/collections", icon: FolderHeart },
    { name: "Analytics & Stats", href: "/stats", icon: BarChart3 },
  ];

  const quickCategories = [
    { name: "Movies & TV", href: "/library?type=movie", icon: Film },
    { name: "Anime & Manga", href: "/library?type=anime", icon: Sparkles },
    { name: "Games", href: "/library?type=game", icon: Gamepad2 },
    { name: "Novels & Books", href: "/library?type=novel", icon: BookOpen },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "260px",
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px",
          zIndex: 40,
        }}
        className="desktop-sidebar"
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            textDecoration: "none",
            marginBottom: "36px",
            padding: "0 8px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "var(--accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)",
            }}
          >
            <Layers size={22} color="#fff" />
          </div>
          <div>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#fff",
                lineHeight: 1.1,
              }}
            >
              Media<span className="gradient-text">Locker</span>
            </h2>
            <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Universal Tracker
            </p>
          </div>
        </Link>

        {/* Main Navigation */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "28px" }}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-dim)",
              padding: "0 12px 6px 12px",
            }}
          >
            Navigation
          </span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.92rem",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#fff" : "var(--text-muted)",
                  background: isActive
                    ? "linear-gradient(90deg, rgba(139, 92, 246, 0.2) 0%, rgba(6, 182, 212, 0.1) 100%)"
                    : "transparent",
                  border: isActive ? "1px solid rgba(139, 92, 246, 0.4)" : "1px solid transparent",
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
              >
                <Icon
                  size={18}
                  color={isActive ? "var(--accent-cyan)" : "currentColor"}
                />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Quick Categories */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "auto" }}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-dim)",
              padding: "0 12px 6px 12px",
            }}
          >
            Vault Categories
          </span>
          {quickCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.name}
                href={cat.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "8px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.86rem",
                  color: "var(--text-muted)",
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-main)";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon size={16} color="var(--text-dim)" />
                {cat.name}
              </Link>
            );
          })}
        </div>

        {/* User Card / Login Footer */}
        <div
          className="glass-panel"
          style={{
            padding: "12px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserIcon size={18} color="var(--accent-cyan)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              My Locker
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Offline Sync
            </p>
          </div>
          <Link
            href="/login"
            title="Sign In / Accounts"
            style={{
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
            }}
          >
            <LogOut size={16} />
          </Link>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header
        style={{
          display: "none",
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(13, 15, 24, 0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "12px 16px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        className="mobile-header"
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "var(--accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Layers size={18} color="#fff" />
          </div>
          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#fff" }}>
            Media<span className="gradient-text">Locker</span>
          </span>
        </Link>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/search" className="btn-icon">
            <Search size={18} />
          </Link>
          <Link href="/library" className="btn-icon">
            <Layers size={18} />
          </Link>
          <Link href="/stats" className="btn-icon">
            <BarChart3 size={18} />
          </Link>
        </div>
      </header>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-header {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
}
