import { Component, type ErrorInfo, type ReactNode } from "react";

const RECOVERY_KEY = "careflow:chunk-recovery";
const RECOVERY_WINDOW_MS = 30_000;

type Props = { children: ReactNode };
type State = { failed: boolean };

function isChunkLoadError(error: Error) {
  const message = String(error?.message ?? error).toLowerCase();
  return message.includes("failed to fetch dynamically imported module")
    || message.includes("importing a module script failed")
    || message.includes("chunkloaderror")
    || message.includes("loading chunk");
}

function recoverFromStaleChunk() {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  try {
    const lastRecovery = Number(sessionStorage.getItem(RECOVERY_KEY) ?? "0");
    if (lastRecovery && now - lastRecovery < RECOVERY_WINDOW_MS) return false;
    sessionStorage.setItem(RECOVERY_KEY, String(now));
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; still attempt one reload.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("cf_refresh", String(now));
  window.location.replace(url.toString());
  return true;
}

export class ChunkLoadRecovery extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(error: Error): State | null {
    if (isChunkLoadError(error)) {
      recoverFromStaleChunk();
    }
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (!isChunkLoadError(error)) {
      console.error("CareFlow application error", error, info.componentStack);
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-lg font-semibold">CareFlow is refreshing</div>
          <p className="text-sm text-muted-foreground">
            The application was updated while this page was open. We are refreshing it to load the latest version.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            Refresh application
          </button>
        </div>
      </div>
    );
  }
}

export default ChunkLoadRecovery;
