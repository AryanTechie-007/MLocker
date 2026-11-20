import { isValidSourceUrl } from "@/lib/domain/source-domain";

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      platform?: string;
      openExternal: (url: string) => Promise<boolean>;
      getAppVersion: () => Promise<string>;
    };
  }
}

/**
 * Safely launches an external URL.
 * In Electron: delegates via `window.electronAPI.openExternal(url)` to open in the OS default browser.
 * In Web browser: opens in a new tab with `noopener,noreferrer` after verifying protocol allowlist.
 */
export async function launchExternalUrl(url: string): Promise<boolean> {
  if (!isValidSourceUrl(url)) {
    console.error("launchExternalUrl rejected unsafe or invalid URL:", url);
    return false;
  }

  if (
    typeof window !== "undefined" &&
    window.electronAPI &&
    typeof window.electronAPI.openExternal === "function"
  ) {
    try {
      return await window.electronAPI.openExternal(url);
    } catch (err) {
      console.error("Electron openExternal failed:", err);
      return false;
    }
  }

  if (typeof window !== "undefined") {
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (newWindow) {
      newWindow.opener = null;
      return true;
    }
  }

  return false;
}
