"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Layers, Lock, Mail, User as UserIcon, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        // Register API call
        const regRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        const data = await regRes.json();
        if (!regRes.ok) {
          setError(data.error || "Failed to register account");
          setLoading(false);
          return;
        }

        // Automatic sign in after successful registration
        const res = await signIn("credentials", {
          redirect: false,
          email,
          password,
        });

        if (res?.error) {
          setError("Account created, but could not auto-sign-in. Please log in.");
        } else {
          router.push("/");
          router.refresh();
        }
      } else {
        // Sign in
        const res = await signIn("credentials", {
          redirect: false,
          email,
          password,
        });

        if (res?.error) {
          setError("Invalid email or password");
        } else {
          router.push("/");
          router.refresh();
        }
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected network error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "80vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "36px",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-highlight)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        {/* Logo and Brand */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "var(--accent-gradient)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px",
              boxShadow: "0 0 25px rgba(139, 92, 246, 0.4)",
            }}
          >
            <Layers size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fff" }}>
            {isRegister ? "Create Your Vault" : "Welcome Back"}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "6px" }}>
            {isRegister
              ? "Start tracking all your entertainment in one unified locker"
              : "Sign in to access your media tracking collections"}
          </p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.15)",
              border: "1px solid rgba(248, 113, 113, 0.4)",
              color: "#fca5a5",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              marginBottom: "20px",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {isRegister && (
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                Name / Alias
              </label>
              <div style={{ position: "relative" }}>
                <UserIcon size={16} color="var(--text-dim)" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
                <input
                  type="text"
                  placeholder="e.g. Neo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-control"
                  style={{ paddingLeft: "40px" }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <Mail size={16} color="var(--text-dim)" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="email"
                required
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-control"
                style={{ paddingLeft: "40px" }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={16} color="var(--text-dim)" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-control"
                style={{ paddingLeft: "40px" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "12px", marginTop: "10px" }}
          >
            {loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In to Vault"}
            <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px", borderTop: "1px solid var(--border-subtle)", paddingTop: "20px" }}>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-cyan)",
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isRegister
              ? "Already have an account? Sign in here"
              : "Don't have an account? Create one now"}
          </button>
        </div>

        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link
            href="/"
            style={{ color: "var(--text-dim)", fontSize: "0.78rem", textDecoration: "none" }}
          >
            Continue as Guest without login →
          </Link>
        </div>
      </div>
    </div>
  );
}
