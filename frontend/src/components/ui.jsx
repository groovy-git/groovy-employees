import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Inbox, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useBackClose } from "../hooks/useBackClose";
import { useApp } from "../store";
import { fmtDate, initials } from "../lib/format";

// Rendered into <body> so a sheet opened from inside a styled container (e.g. the brown
// sidebar) never inherits that container's styles.
export function Sheet({ open, onClose, title, children, footer, full = false, headerRight }) {
  useBackClose(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={"sheet" + (full ? " full" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {headerRight}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + t.type}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function Spinner({ size = 22 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function Button({ loading, children, className = "", ...rest }) {
  return (
    <button className={"btn " + className} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner size={18} /> : children}
    </button>
  );
}

export function Empty({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="empty">
      <Icon size={44} />
      <h3>{title}</h3>
      {text && <div className="small">{text}</div>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}

export function SkeletonList({ rows = 5, height = 62 }) {
  return (
    <div className="col gap-s">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

// things a tap is meant to act on — tapping any of these leaves the keyboard alone
const TAPPABLE = "button, a, input, select, textarea, label, [role=button]";

/**
 * Swallow the click that the tap in progress is about to produce.
 * Not the pointerdown — preventing that would cancel touch scrolling too, and lists could no longer
 * be dragged. Deliberately outside the component: blurring re-renders SearchBar, and a cleanup that
 * removed this would take it away a moment before the click it exists to catch.
 */
let eatTimer = null;
function eatNextClick() {
  const done = () => {
    clearTimeout(eatTimer);
    eatTimer = null;
    document.removeEventListener("click", eat, true);
  };
  const eat = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    done();
  };
  if (eatTimer) clearTimeout(eatTimer);
  document.addEventListener("click", eat, true);
  eatTimer = setTimeout(done, 700); // the finger may have scrolled away instead of tapping
}

export function SearchBar({ value, onChange, placeholder = "Search", autoFocus, inputRef }) {
  const self = useRef(null);
  const [focused, setFocused] = useState(false);
  // one ref feeding both: the caller's and our own
  const setRef = useCallback(
    (el) => {
      self.current = el;
      if (inputRef) inputRef.current = el;
    },
    [inputRef],
  );

  /**
   * On a phone the keyboard hides half the screen, and the only way to put it away used to be to tap
   * something — which then did whatever that something does.
   * While a search box has focus: scrolling or tapping an empty area closes the keyboard, and a tap
   * on a row closes it *instead of* acting. The next tap works normally.
   * Only on touch, and only while the keyboard is really covering the screen, so the laptop is untouched.
   */
  useEffect(() => {
    if (!focused) return;
    const since = Date.now();
    let idle;
    const blur = () => self.current && self.current.blur();
    const keyboardUp = () => {
      const vv = window.visualViewport;
      return !!vv && vv.height < window.innerHeight * 0.85;
    };
    /**
     * Once scrolling has settled — not on the first scroll event. Closing the keyboard mid-gesture
     * resizes the viewport while the content is still moving, and since the shell is sized in dvh
     * and the header is sticky, that reflow makes the header flicker for the rest of the flick.
     */
    const onScroll = () => {
      if (Date.now() - since <= 500) return; // the browser's own scroll-into-view on focus
      clearTimeout(idle);
      idle = setTimeout(blur, 150);
    };
    const onDown = (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== "function") return;
      if (t.closest(".search")) return; // the clear button must work while typing
      if (!t.closest(TAPPABLE)) return blur(); // empty space: just put the keyboard away
      // a real control in the content area, tapped with the keyboard covering it: dismiss only
      if (e.pointerType === "touch" && keyboardUp() && t.closest(".page")) {
        blur();
        eatNextClick();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(idle); // never fire against an input that has already lost focus or unmounted
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [focused]);

  return (
    <div className="search">
      <Search size={19} color="var(--muted)" />
      <input
        ref={setRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value && (
        <button className="icon-btn" onClick={() => onChange("")} aria-label="Clear search" style={{ width: 36, height: 36 }}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}

/**
 * Date box. The phone's own date picker opens on tap (the real input lies invisible on top), but the
 * date is written the same everywhere — 20 Sep 2026 — instead of each device's own format.
 */
export function DateField({ value, onChange, min, max, "aria-label": label = "Date" }) {
  return (
    <div className="date-field">
      <span className={value ? "" : "muted"}>{value ? fmtDate(value) : "Pick a date"}</span>
      <Calendar size={18} />
      <input type="date" value={value || ""} min={min} max={max} onChange={onChange} aria-label={label} />
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

export function MoneyInput({ value, onChange, placeholder = "0", ...rest }) {
  const { settings } = useApp();
  return (
    <div className="input-wrap">
      <span className="prefix">{settings.currency_symbol || "₹"}</span>
      <input
        className="input"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        {...rest}
        // select what's there so typing replaces a pre-filled amount instead of appending to it
        onFocus={(e) => {
          e.target.select();
          rest.onFocus?.(e);
        }}
      />
    </div>
  );
}

// `wrap`: two to a row, for more choices than fit one line on a phone
export function Seg({ options, value, onChange, wrap }) {
  return (
    <div className={"seg" + (wrap ? " wrap" : "")} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Horizontally scrolling chip row. Fades + ‹ › buttons show there is more; the mouse wheel
// scrolls sideways on computers; the selected chip is kept in view.
export function Chips({ options, value, onChange }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [options.length]);

  useEffect(() => {
    const active = ref.current && ref.current.querySelector(".chip.active");
    if (active) active.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [value]);

  const by = (dir) => ref.current.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div className="chips-wrap">
      <div className="chips" ref={ref}>
        {options.map((o) => (
          <button key={o.value} className={"chip" + (value === o.value ? " active" : "")} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {edge.left && (
        <>
          <span className="chips-fade left" />
          <button type="button" className="chips-arrow left" onClick={() => by(-1)} aria-label="Scroll left">
            <ChevronLeft size={18} />
          </button>
        </>
      )}
      {edge.right && (
        <>
          <span className="chips-fade right" />
          <button type="button" className="chips-arrow right" onClick={() => by(1)} aria-label="More options">
            <ChevronRight size={18} />
          </button>
        </>
      )}
    </div>
  );
}

export function Avatar({ name, gold }) {
  return <div className={"avatar" + (gold ? " gold" : "")}>{initials(name)}</div>;
}

// simple confirm sheet: const confirm = useConfirm(); if (await confirm({...})) ...
export function ConfirmSheet({ state, setState }) {
  if (!state) return null;
  const done = (v) => {
    state.resolve(v);
    setState(null);
  };
  return (
    <Sheet
      open
      onClose={() => done(false)}
      title={state.title}
      footer={
        <div className="row">
          <button className="btn secondary grow" onClick={() => done(false)}>
            {state.cancelText || "Cancel"}
          </button>
          <button className={"btn grow " + (state.danger ? "danger" : "")} onClick={() => done(true)}>
            {state.okText || "OK"}
          </button>
        </div>
      }
    >
      <p style={{ marginTop: 0 }}>{state.text}</p>
    </Sheet>
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = (opts) => new Promise((resolve) => setState({ ...opts, resolve }));
  const node = <ConfirmSheet state={state} setState={setState} />;
  return [confirm, node];
}
