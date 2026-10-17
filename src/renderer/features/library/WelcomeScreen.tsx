import type { LibraryState } from "../../../shared/library";
import { LibraryPicker } from "./LibraryPicker";

// Shown on first launch (no library yet) and when the saved library cannot be opened.
export const WelcomeScreen: React.FC<{
  state: Exclude<LibraryState, { status: "ready" }>;
}> = ({ state }) => {
  const broken = state.status === "error";
  return (
    <div className="flex h-screen items-center justify-center bg-app p-8 text-app-text">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-xl border border-edge bg-panel p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {broken
              ? "Your library could not be opened"
              : "Welcome to Sandwich"}
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            {broken
              ? "Check that the drive is connected, or choose a different library folder."
              : "Sandwich keeps your products, clips, captions and finished videos in one library folder. Choose where it should live."}
          </p>
        </div>
        {broken && (
          <div className="rounded-md border border-edge bg-white/5 px-4 py-3 text-sm">
            <p className="break-all font-mono text-xs text-app-muted">
              {state.path}
            </p>
            <p className="mt-2 text-app-text">{state.message}</p>
          </div>
        )}
        <LibraryPicker defaultPath={state.defaultPath} />
      </div>
    </div>
  );
};
