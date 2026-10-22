import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { formatErrorDetails } from "../../shared/errorDetails";
import { logToFile } from "../log";

const BUTTON =
  "rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5";

// What people see instead of a blank window. The draft is autosaved, so the message says
// where to find it.
export const ErrorScreen: React.FC<{
  details: string;
  onReload: () => void;
  onCopy: (details: string) => Promise<boolean>;
  onOpenLogs: () => Promise<string | null>;
}> = ({ details, onReload, onCopy, onOpenLogs }) => {
  const [copied, setCopied] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  return (
    <div
      role="alert"
      className="grid h-screen place-items-center bg-app p-8 text-app-text"
    >
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-app-muted">
          Your work is saved. Reload the window to carry on. If your draft does
          not come back by itself, open it from History.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            onClick={onReload}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Reload
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => void onCopy(details).then(setCopied)}
          >
            {copied ? "Copied" : "Copy details"}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => void onOpenLogs().then(setLogsError)}
          >
            Open logs folder
          </button>
        </div>
        {logsError && (
          <p className="mt-3 break-words text-sm text-red-400">{logsError}</p>
        )}
        <pre className="mt-6 max-h-48 overflow-auto rounded-md bg-black/30 p-3 text-xs text-app-dim">
          {details}
        </pre>
      </div>
    </div>
  );
};

type Props = {
  children: ReactNode;
  // Runs first, before the error is reported: the app uses it to save a draft that is still
  // waiting for its debounced autosave. May reject; that is ignored.
  beforeReport?: () => Promise<unknown> | void;
};

type State = { error: Error | null; componentStack: string | null };

// Catches errors thrown while rendering and shows ErrorScreen. Errors outside rendering are
// logged by installGlobalErrorLogging.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    try {
      void Promise.resolve(this.props.beforeReport?.()).catch(() => undefined);
    } catch {
      // Saving is best effort; the report matters more.
    }
    logToFile(
      "error",
      `Render error: ${error.message}${info.componentStack ? `\nComponent stack:${info.componentStack}` : ""}`,
      error.stack,
    );
  }

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }
    const details = formatErrorDetails({
      message: error.message,
      stack: error.stack,
      componentStack,
      when: new Date(),
    });
    return (
      <ErrorScreen
        details={details}
        onReload={() => window.location.reload()}
        onCopy={async (text) => {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch {
            return false;
          }
        }}
        onOpenLogs={async () => {
          try {
            const result = await window.api.app.openLogsFolder();
            return result.ok ? null : result.message;
          } catch (caught) {
            return caught instanceof Error ? caught.message : String(caught);
          }
        }}
      />
    );
  }
}
