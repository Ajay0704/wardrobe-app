"use client";

/** Small shared UI primitives kept in one file to avoid over-fragmentation. */

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline" | "danger";
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-accent text-accent-foreground hover:opacity-90 shadow-sm",
    outline:
      "border border-line bg-surface hover:bg-surface-2 text-foreground",
    ghost: "hover:bg-surface-2 text-foreground",
    danger:
      "border border-red-300/50 text-red-600 dark:text-red-400 hover:bg-red-500/10",
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-line bg-surface text-muted hover:border-accent/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  // Close on Escape for accessibility.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`animate-fade-up max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl ${
          wide ? "sm:max-w-xl" : "sm:max-w-md"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="heading text-xl">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 outline-none transition-colors focus:border-accent focus:bg-surface";

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line py-20 text-center">
      <p className="heading text-xl">{title}</p>
      <p className="max-w-sm text-sm text-muted">{subtitle}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Colored dot showing an item's primary color, with its name on hover. */
export function ColorDot({
  color,
  name,
  size = 14,
}: {
  color: string;
  name?: string;
  size?: number;
}) {
  return (
    <span
      title={name ?? color}
      className="inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  );
}

/** Traffic-light badge for harmony scores. */
export function MatchBadge({ score, label }: { score: number; label?: string }) {
  const tone =
    score >= 70
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : score >= 45
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-red-500/15 text-red-600 dark:text-red-400";
  const text =
    label ?? (score >= 70 ? "Great match" : score >= 45 ? "Okay match" : "May clash");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}
