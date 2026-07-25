"use client";

import { Check, ChevronRight, X, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

/** Inset-grouped card with a small label above it — one calm section of settings. */
export function Group({
  label,
  right,
  children,
}: {
  label?: string;
  right?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      {(label || right) && (
        <div className="flex items-center justify-between px-1">
          {label && <span className="text-xs font-medium text-muted">{label}</span>}
          {right && <span className="text-xs text-muted">{right}</span>}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

/**
 * One settings row. An optional icon sits in a soft accent chip; the current
 * value shows muted on the right, then a chevron (for drill-ins) or custom
 * `right` content (e.g. a toggle). Rows divide themselves with a hairline.
 */
export function Row({
  icon: Icon,
  label,
  value,
  onClick,
  chevron,
  right,
  danger,
}: {
  icon?: LucideIcon;
  label: string;
  value?: string;
  onClick?: () => void;
  chevron?: boolean;
  right?: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line hover:bg-surface-2/60"
    >
      {Icon && (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
            danger ? "bg-red-500/10 text-red-600" : "bg-accent-soft text-accent"
          }`}
        >
          <Icon size={17} strokeWidth={1.9} />
        </span>
      )}
      <span className={`min-w-0 flex-1 text-[15px] ${danger ? "text-red-600" : ""}`}>
        {label}
      </span>
      {value && <span className="shrink-0 text-sm text-muted">{value}</span>}
      {right}
      {chevron && <ChevronRight size={17} className="shrink-0 text-muted/60" />}
    </button>
  );
}

/** Green glanceable summary line at the top of a sub-page (Option C snapshot). */
export function Snapshot({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-accent-soft px-3.5 py-3 text-sm leading-relaxed text-accent">
      {children}
    </p>
  );
}

/** Bottom sheet — reuses the app's native sheet chrome. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A selectable row inside a Sheet, with a check when active. */
export function PickRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-line px-1 py-3.5 text-left last:border-none"
    >
      {children}
      {active && <Check size={18} className="ml-auto shrink-0 text-accent" />}
    </button>
  );
}

/** Consistent outer wrapper so every sub-page shares width + rhythm. */
export function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-2xl space-y-5 pb-6">{children}</div>;
}

/** Small muted helper line under a page title / above a group. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="px-1 text-xs leading-relaxed text-muted">{children}</p>;
}
