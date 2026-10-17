import { useEffect, useId, useRef, useState } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  // Tailwind max-width class for the panel.
  widthClass?: string;
  // Disables Escape and backdrop close, e.g. while a save is running.
  busy?: boolean;
  // Unsaved edits: Escape or a click on the backdrop asks "Discard changes?" instead of
  // closing. The explicit buttons inside the modal (Cancel, Close) are not affected.
  dirty?: boolean;
};

// A centred dialog: Escape and a click on the backdrop close it, Tab stays inside, and focus
// goes back to whatever had it before. The first field should carry autoFocus.
export const Modal: React.FC<ModalProps> = ({
  title,
  onClose,
  children,
  widthClass = "max-w-lg",
  busy = false,
  dirty = false,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);
  confirmingRef.current = confirming;
  const beforeConfirm = useRef<HTMLElement | null>(null);

  // "Keep editing" removes the focused button: put focus back where the user was, so Escape
  // and Tab keep working inside the dialog.
  useEffect(() => {
    if (!confirming) {
      beforeConfirm.current?.focus?.();
      beforeConfirm.current = null;
    }
  }, [confirming]);

  // Escape and the backdrop: close, or ask first when there is something to lose.
  const requestClose = () => {
    if (busyRef.current) {
      return;
    }
    if (dirtyRef.current) {
      beforeConfirm.current = document.activeElement as HTMLElement | null;
      setConfirming(true);
    } else {
      onCloseRef.current();
    }
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Fall back to the panel itself when no field asked for focus.
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (confirmingRef.current) {
        setConfirming(false);
      } else {
        requestClose();
      }
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) {
      return;
    }
    const items = [
      ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`flex max-h-full w-full flex-col overflow-y-auto rounded-xl border border-edge bg-panel p-6 shadow-2xl outline-none ${widthClass}`}
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {children}
        {confirming && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Discard changes?"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
          >
            <div className="w-full max-w-sm rounded-xl border border-edge bg-panel p-5 shadow-2xl">
              <p className="font-medium">Discard changes?</p>
              <p className="mt-1 text-sm text-app-muted">
                What you typed here has not been saved.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-edge px-4 py-2 text-sm hover:bg-white/5"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => onCloseRef.current()}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
