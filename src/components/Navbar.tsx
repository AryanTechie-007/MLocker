"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  FolderHeart,
  BarChart3,
  Layers,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "My Library", href: "/library", icon: Layers },
    { name: "Search & Add", href: "/search", icon: Search },
    { name: "Collections", href: "/collections", icon: FolderHeart },
    { name: "Analytics & Stats", href: "/stats", icon: BarChart3 },
  ];

  const handleLogout = async () => {
    try {
      await signOut({ callbackUrl: "/login" });
    } catch {
      router.push("/login");
    }
  };

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
            <p
              style={{
                fontSize: "0.7rem",
                color: "var(--text-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Universal Tracker
            </p>
          </div>
        </Link>

        {/* Main Navigation */}
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
          <Link
            href="/login"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flex: 1,
              minWidth: 0,
              textDecoration: "none",
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
                flexShrink: 0,
              }}
            >
              <UserIcon size={18} color="var(--accent-cyan)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                My Locker
              </p>
              <p style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                Local Vault
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            title="Log Out"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--status-dropped)";
              e.currentTarget.style.background = "rgba(248, 113, 113, 0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <LogOut size={16} />
          </button>
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
