// The text "Copy details" puts on the clipboard for a crash screen. Pure.
export function formatErrorDetails(input: {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  version?: string | null;
  when: Date;
}): string {
  const lines = [
    `Sandwich error report${input.version ? ` (version ${input.version})` : ""}`,
    input.when.toISOString(),
    "",
    input.message,
  ];
  if (input.stack) {
    lines.push("", input.stack);
  }
  if (input.componentStack) {
    lines.push("", "Component stack:", input.componentStack.trimEnd());
  }
  return lines.join("\n");
}
