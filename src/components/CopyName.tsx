import { useEffect, useRef, useState } from "react";

/** Copy `text` to the clipboard, with a fallback for older/insecure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const copyIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

const checkIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

interface Props {
  /** The name to copy (a resource/item name). */
  text: string;
}

/**
 * A tiny "copy the name" button, placed right after a resource/item name. It
 * stays hidden until you hover the name's row (revealed via CSS), is reachable
 * by keyboard, and flips to a check for ~1.3s after a successful copy. Handy for
 * pasting a resource name straight into the in-game HDV search.
 */
export function CopyName({ text }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Clear the pending revert if the component unmounts mid-feedback.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onCopy(e: React.MouseEvent) {
    // Don't let the click bubble to a row that toggles/selects on click.
    e.stopPropagation();
    e.preventDefault();
    if (!(await copyText(text))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1300);
  }

  return (
    <button
      type="button"
      className={`copy-name${copied ? " copied" : ""}`}
      aria-label={`Copier « ${text} »`}
      title={copied ? "Copié !" : "Copier le nom"}
      onClick={onCopy}
    >
      {copied ? checkIcon : copyIcon}
    </button>
  );
}
