import type { ReactNode } from "react";

/**
 * The page shell every routed page renders into. The spacing between the top
 * nav and the page content lives here (plus the `.app-main` rule) — defined
 * once, so it can't drift per page the way it did when each page re-added its
 * own `margin-top`. New pages get the correct gap for free.
 */
export function Page({ children }: { children: ReactNode }) {
  return <main className="app-main">{children}</main>;
}
