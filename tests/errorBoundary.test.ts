import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ErrorBoundary,
  ErrorScreen,
} from "../src/renderer/components/ErrorBoundary";
import { formatErrorDetails } from "../src/shared/errorDetails";

describe("formatErrorDetails", () => {
  it("includes version, time, message, stack and component stack", () => {
    const text = formatErrorDetails({
      message: "boom",
      stack: "Error: boom\n    at a",
      componentStack: "\n    at Page\n    at App\n",
      version: "0.1.0",
      when: new Date("2026-10-18T09:30:00.000Z"),
    });
    expect(text).toBe(
      [
        "Sandwich error report (version 0.1.0)",
        "2026-10-18T09:30:00.000Z",
        "",
        "boom",
        "",
        "Error: boom\n    at a",
        "",
        "Component stack:",
        "\n    at Page\n    at App",
      ].join("\n"),
    );
  });

  it("leaves out what it does not have", () => {
    expect(
      formatErrorDetails({ message: "x", when: new Date(0) }).split("\n"),
    ).toEqual(["Sandwich error report", "1970-01-01T00:00:00.000Z", "", "x"]);
  });
});

describe("ErrorScreen", () => {
  const markup = renderToStaticMarkup(
    createElement(ErrorScreen, {
      details: "the details",
      onReload: () => undefined,
      onCopy: async () => true,
      onOpenLogs: async () => null,
    }),
  );

  it("says the work is saved and where to find the draft", () => {
    expect(markup).toContain("Something went wrong");
    expect(markup).toContain("Your work is saved");
    expect(markup).toContain("open it from History");
  });

  it("offers reload, copy details and the logs folder, and shows the details", () => {
    expect(markup).toContain("Reload");
    expect(markup).toContain("Copy details");
    expect(markup).toContain("Open logs folder");
    expect(markup).toContain("the details");
  });
});

describe("ErrorBoundary", () => {
  it("turns a thrown error into state, so the screen shows instead of a blank window", () => {
    const error = new Error("render blew up");
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it("renders its children when nothing has failed", () => {
    expect(
      renderToStaticMarkup(
        createElement(ErrorBoundary, null, createElement("p", null, "fine")),
      ),
    ).toBe("<p>fine</p>");
  });
});
