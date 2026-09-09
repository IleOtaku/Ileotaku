"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------- Skeleton ---------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

/* ---------------------------- Spinner ---------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5 animate-spin text-gold", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/* ---------------------------- Button ---------------------------- */

export type ButtonVariant = "primary" | "ghost" | "plat" | "gold" | "danger";

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  plat: "btn-plat",
  gold: "btn-gold",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-syne font-semibold text-ivory transition-colors hover:bg-red-500 disabled:opacity-50 disabled:pointer-events-none",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading, disabled, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(BUTTON_VARIANT_CLASS[variant], className)}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : children}
    </button>
  );
});

/* ---------------------------- Input ---------------------------- */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, style, ...props },
  ref
) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="font-syne text-xs font-semibold text-muted">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn("input-base", className)}
        style={error ? { borderColor: "#e07840", ...style } : style}
        {...props}
      />
      {error && <p className="font-noto text-xs text-clay2">{error}</p>}
    </div>
  );
});

/* ---------------------------- Select ---------------------------- */

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, className, id, ...props },
  ref
) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="font-syne text-xs font-semibold text-muted">
          {label}
        </label>
      )}
      <select ref={ref} id={selectId} className={cn("input-base", className)} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});

/* ---------------------------- Toggle ---------------------------- */

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className={cn("flex items-center gap-3", disabled ? "opacity-50" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none",
          checked ? "bg-clay" : "bg-muted/30",
          disabled && "cursor-not-allowed"
        )}
      >
        {/* Inline style (not Tailwind's translate-x-* utilities) for the thumb's position —
            guarantees the transform applies regardless of whether Tailwind's JIT scanner has
            generated those particular classes, rather than depending on class-detection at all. */}
        <span
          className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out"
          style={{
            transform: checked ? "translateX(20px)" : "translateX(2px)",
            marginTop: "2px",
          }}
        />
      </button>
      {label && <span className="font-noto text-sm text-text">{label}</span>}
    </label>
  );
}

/* ---------------------------- Modal ---------------------------- */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Every modal in the app funnels through this one component so the mobile-bottom-sheet /
 * desktop-centered layout, the max-h-[90vh] cap, and the sticky header (title + close button,
 * which must never scroll away) only have to be gotten right in one place. On mobile (below
 * `sm`) it docks to the bottom of the screen with only its top corners rounded, like a native
 * bottom sheet; at `sm` and up it's a centered, fully-rounded dialog. Content beyond what fits
 * scrolls in its own region — the header stays put via `sticky top-0` inside that same
 * scroll container, not by being a layout sibling, so it stays visible without a second nested
 * scroll area.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            onClick={(e) => e.stopPropagation()}
            className="glass flex max-h-[90vh] w-full flex-col rounded-t-2xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 rounded-t-2xl border-b border-white/[0.07] bg-bg2/95 p-6 pb-4 backdrop-blur">
              {title && <h2 className="font-cinzel text-lg text-gold">{title}</h2>}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="ml-auto text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 pt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------- SectionEyebrow ---------------------------- */

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-clay" />
      <span className="font-syne text-xs font-bold uppercase tracking-[0.2em] text-gold">
        {children}
      </span>
    </div>
  );
}

/* ---------------------------- Tabs ---------------------------- */

export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn("inline-flex rounded-full border border-muted2 bg-bg3 p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "rounded-full px-4 py-1.5 font-syne text-sm font-semibold transition-colors",
            value === tab.value ? "bg-clay text-ivory" : "text-muted hover:text-text"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------- EmptyState ---------------------------- */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-muted2 px-6 py-16 text-center">
      {icon}
      <h3 className="font-cinzel text-lg text-text">{title}</h3>
      {description && <p className="max-w-sm font-noto text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}
