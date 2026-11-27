import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** A small "?" button that shows a short explanation when clicked. Closes on Escape or a click elsewhere. */
export function Tip({ children, label = "What's this?", align = "left" }: { children: ReactNode; label?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    // Escape closes only the tip, not a dialog the tip sits in (which would throw away unsaved changes).
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  return (
    <span className="tip" ref={ref}>
      <button type="button" className="tipbtn" aria-label={label} aria-expanded={open} aria-controls={id}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}>?</button>
      {open && <span id={id} role="note" className={"tipbody" + (align === "right" ? " right" : "")}>{children}</span>}
    </span>
  );
}
