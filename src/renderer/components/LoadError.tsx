// A failed load, with a way to ask again (nothing here needs a restart).
export const LoadError: React.FC<{
  message: string;
  onRetry: () => void;
  className?: string;
}> = ({ message, onRetry, className = "mt-6" }) => (
  <div role="alert" className={`${className} text-sm text-red-400`}>
    <p className="break-words">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-2 rounded-md border border-edge px-3 py-1.5 text-sm text-app-text transition-colors hover:bg-white/5"
    >
      Try again
    </button>
  </div>
);
