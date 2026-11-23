import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// 1. Obtain GitHub access token from git credential manager
const p = spawnSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf-8",
});
const m = p.stdout.match(/password=(.+)/);
if (!m) {
  console.error("Failed to retrieve git credentials");
  process.exit(1);
}
const token = m[1].trim();
const repo = "AryanTechie-007/MLocker";
const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf-8"));
const version = pkg.version;
const tagName = `v${version}`;

async function main() {
  console.log(`Checking if release ${tagName} already exists...`);
  const checkRes = await fetch(
    `https://api.github.com/repos/${repo}/releases/tags/${tagName}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "MLocker-Release-Bot",
      },
    }
  );

  let release;
  if (checkRes.ok) {
    release = await checkRes.json();
    console.log(`Release ${tagName} already exists (ID: ${release.id}).`);
  } else {
    console.log(`Creating new GitHub release for ${tagName}...`);
    const createRes = await fetch(
      `https://api.github.com/repos/${repo}/releases`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "MLocker-Release-Bot",
        },
        body: JSON.stringify({
          tag_name: tagName,
          target_commitish: "main",
          name: `Media Locker ${tagName} (Windows Setup)`,
          body: [
            `## Media Locker ${tagName} — Windows Hotfix Release`,
            "",
            "### Fixes & Improvements:",
            "- **Resolve Release Blank Screen:** Packaged generated `.prisma` runtime engine client into production distributions via `extraResources`, resolving silent module missing errors in Next.js middleware and API routes.",
            "- **Decoupled Route Proxy:** Separated lightweight Edge-compatible `authConfig` from database-dependent server auth handlers so middleware never pulls in `@prisma/client`.",
            "- **Deterministic Secret Initialization:** Ensured `AUTH_SECRET` and desktop configuration are initialized before Next.js production server preparation.",
            "- **Resilient Client Fetching:** Centralized client data fetching with `apiFetch`, correctly distinguishing true network drops, gateway HTML error pages (502/504), and structured API error responses.",
            "- **Third-Party Provider Timeouts:** Added 8-second timeouts to TMDb, Steam, iTunes, and TVmaze search integrations.",
            "",
            "### Assets Included:",
            `- \`Media.Locker.Setup.${version}.exe\` — Windows 64-bit Installer with local SQLite provisioning.`,
          ].join("\n"),
          draft: false,
          prerelease: false,
        }),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("Failed to create release:", err);
      process.exit(1);
    }
    release = await createRes.json();
    console.log(`Release created successfully: ${release.html_url}`);
  }

  // 2. Upload asset
  const exePath = path.resolve("dist", `Media Locker Setup ${version}.exe`);
  if (!fs.existsSync(exePath)) {
    console.error("Installer executable not found at:", exePath);
    process.exit(1);
  }

  const assetName = `Media.Locker.Setup.${version}.exe`;
  const stats = fs.statSync(exePath);
  console.log(`Uploading ${assetName} (${(stats.size / 1024 / 1024).toFixed(1)} MB)...`);

  // Check if asset already exists in release
  const existingAsset = release.assets?.find((a) => a.name === assetName);
  if (existingAsset) {
    console.log(`Asset ${assetName} already exists (ID: ${existingAsset.id}). Deleting before re-upload...`);
    await fetch(
      `https://api.github.com/repos/${repo}/releases/assets/${existingAsset.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "MLocker-Release-Bot",
        },
      }
    );
  }

  const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${assetName}`;
  const fileStream = fs.createReadStream(exePath);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/octet-stream",
      "Content-Length": stats.size.toString(),
      "User-Agent": "MLocker-Release-Bot",
    },
    body: fileStream,
    // @ts-expect-error duplex option for Node fetch streaming
    duplex: "half",
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error("Asset upload failed:", err);
    process.exit(1);
  }

  const uploadedAsset = await uploadRes.json();
  console.log("Asset uploaded successfully!");
  console.log("Download URL:", uploadedAsset.browser_download_url);
}

main().catch((err) => {
  console.error("Error in release script:", err);
  process.exit(1);
});
