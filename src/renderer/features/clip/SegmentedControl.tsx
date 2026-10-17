// A small pick-one control (radio group look). Arrow keys move between options.
export function SegmentedControl<T extends string>({
  label,
  testId,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  testId: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}): React.ReactElement {
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    const group = event.currentTarget.parentElement;
    requestAnimationFrame(() =>
      group
        ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
        ?.focus(),
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-app-muted">
      <span>{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        data-testid={testId}
        className="flex rounded-md border border-edge p-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-value={option.value}
              data-testid={`${testId}-${option.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              onKeyDown={onKeyDown}
              className={
                "flex-1 rounded px-2 py-1 text-xs transition-colors disabled:cursor-default disabled:opacity-40 " +
                (selected
                  ? "bg-brand/20 text-app-text"
                  : "text-app-muted hover:bg-white/5")
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
