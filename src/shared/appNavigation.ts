// Decides whether a navigation of the app window stays on the app's own page. Dropping a
// file onto the window or clicking a stray link must never replace the app with another
// document. Query and hash changes on the same page are fine. Pure.

export function isAppPageUrl(target: string, appUrl: string): boolean {
  let to: URL;
  let app: URL;
  try {
    to = new URL(target);
    app = new URL(appUrl);
  } catch {
    return false;
  }
  if (to.protocol !== app.protocol) {
    return false;
  }
  if (app.protocol === "file:") {
    return to.pathname === app.pathname;
  }
  return to.origin === app.origin && to.pathname === app.pathname;
}
