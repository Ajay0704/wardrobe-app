"use client";

import {
  Bell,
  Calendar,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Compass,
  Globe,
  Heart,
  Home,
  Image as ImageIcon,
  Landmark,
  LayoutGrid,
  Mail,
  Plus,
  ScanLine,
  Search,
  Shirt,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWardrobe, type View } from "@/lib/store";
import { AppViews } from "../AppViews";
import { ProfileAvatar } from "../ProfileAvatar";
import { SyncBadge } from "../SyncBadge";

type Tab = { view: View; label: string; Icon: LucideIcon };

const TITLES: Partial<Record<View, string>> = {
  today: "Home",
  wardrobe: "Closet",
  builder: "Build an outfit",
  outfits: "Outfits",
  calendar: "Calendar",
  wishlist: "Wishlist",
  travel: "Packing",
  insights: "Insights",
  you: "My page",
  explore: "Explore",
  profile: "My Profile",
  settings: "Settings",
};

// Main tabbed screens — the header actions (calendar/bell/profile) show here.
const MAIN_VIEWS = new Set<View>(["today", "wardrobe", "outfits", "explore"]);

function isActive(tab: View, view: View): boolean {
  if (tab === "outfits") return view === "outfits" || view === "builder";
  return view === tab;
}

/**
 * iOS-style app chrome: compact title bar, the shared screens, and a bottom tab
 * bar — Today · Closet · [＋ Create] · Outfits · You. The center button opens a
 * Create sheet (add a clothing item / build an outfit). Only rendered inside the
 * native app; the website keeps its own chrome.
 */
export function NativeShell() {
  const { view, setView, setAddOpen, setBulkOpen, setSettingsSection } =
    useWardrobe();
  const profile = useWardrobe((s) => s.profile);
  const setClosetsOpen = useWardrobe((s) => s.setClosetsOpen);
  const [createOpen, setCreateOpen] = useState(false);
  const [closetMenuOpen, setClosetMenuOpen] = useState(false);
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const showActions = MAIN_VIEWS.has(view);

  // Navigation history so the back button returns to the actual previous view
  // (e.g. My page → My Profile → back → My page), not just the last main tab.
  const historyRef = useRef<View[]>([]);
  const prevRef = useRef<View>(view);
  useEffect(() => {
    if (prevRef.current !== view) {
      historyRef.current.push(prevRef.current);
      if (historyRef.current.length > 30) historyRef.current.shift();
      prevRef.current = view;
    }
  }, [view]);
  const goBack = () => {
    const target = historyRef.current.pop() ?? "today";
    prevRef.current = target;
    setView(target);
  };

  // Create sheet: run a real action (and close), or flag a not-yet-built one.
  const runSheet = (fn: () => void) => {
    setSheetNote(null);
    setCreateOpen(false);
    fn();
  };
  const soon = () => {
    setSheetNote("Coming soon");
    window.setTimeout(() => setSheetNote(null), 1600);
  };

  return (
    <div className="native-shell flex h-[100svh] max-h-[100svh] flex-col overflow-hidden bg-background">
      <header className="native-topbar">
        <div className="flex items-center gap-1.5">
          {!showActions && (
            <button
              type="button"
              aria-label="Back"
              onClick={goBack}
              className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-2"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {view === "wardrobe" ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setClosetMenuOpen((v) => !v)}
                className="brand-wordmark-name flex items-center gap-1 !text-xl"
              >
                {TITLES[view]}
                <ChevronDown size={17} className="text-muted" />
              </button>
              {closetMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setClosetMenuOpen(false)}
                  />
                  <div className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg shadow-black/10">
                    <button
                      type="button"
                      onClick={() => {
                        setClosetMenuOpen(false);
                        setClosetsOpen(true);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    >
                      <LayoutGrid size={18} /> View closets
                    </button>
                    <button
                      type="button"
                      onClick={() => setClosetMenuOpen(false)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    >
                      <Shirt size={18} /> View items
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="brand-wordmark-name !text-xl">
              {view === "today"
                ? `Hello, ${profile.displayName?.trim() || "there"}`
                : (TITLES[view] ?? "Wardrobe")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3.5">
          <SyncBadge />
          {showActions && (
            <>
              <button
                type="button"
                aria-label="Calendar"
                onClick={() => setView("calendar")}
                className="text-foreground/80 transition-colors hover:text-foreground"
              >
                <Calendar size={21} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => {
                  setSettingsSection("notifications");
                  setView("settings");
                }}
                className="text-foreground/80 transition-colors hover:text-foreground"
              >
                <Bell size={21} strokeWidth={1.8} />
              </button>
              <ProfileAvatar
                profile={profile}
                size={28}
                onClick={() => setView("you")}
              />
            </>
          )}
        </div>
      </header>

      <main className="native-main flex-1 overflow-y-auto px-4 pt-5">
        <AppViews />
      </main>

      <nav className="native-tabbar" aria-label="Primary">
        <TabBtn tab={{ view: "today", label: "Home", Icon: Home }} view={view} onClick={setView} />
        <TabBtn tab={{ view: "wardrobe", label: "Closet", Icon: Shirt }} view={view} onClick={setView} />

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="native-tab"
          aria-label="Create"
        >
          <span className="native-fab">
            <Plus size={24} strokeWidth={2.2} />
          </span>
        </button>

        <TabBtn tab={{ view: "outfits", label: "Outfits", Icon: LayoutGrid }} view={view} onClick={setView} />
        <TabBtn tab={{ view: "explore", label: "Explore", Icon: Compass }} view={view} onClick={setView} />
      </nav>

      {createOpen && (
        <div
          className="native-sheet-backdrop"
          onClick={() => setCreateOpen(false)}
          role="presentation"
        >
          <div
            className="native-sheet max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Add"
          >
            <div className="native-sheet-handle" />

            <p className="px-1 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted">
              Add item
            </p>
            <SheetRow icon={ImageIcon} label="Album" onClick={() => runSheet(() => setBulkOpen(true))} />
            <SheetRow icon={Camera} label="Camera" onClick={() => runSheet(() => setAddOpen(true))} />
            <SheetRow icon={ScanLine} label="Smart Detector" onClick={() => runSheet(() => setBulkOpen(true))} />
            <SheetRow icon={Landmark} label="Library" onClick={soon} />
            <SheetRow icon={Globe} label="Web" onClick={() => runSheet(() => setAddOpen(true))} />
            <SheetRow icon={Clipboard} label="Clipboard" onClick={soon} />
            <SheetRow icon={Search} label="Search item" onClick={soon} />
            <SheetRow icon={ShoppingBag} label="Import from Online Stores" onClick={soon} />
            <SheetRow icon={Mail} label="Import from Email" onClick={soon} />

            <p className="px-1 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted">
              Closet
            </p>
            <SheetRow icon={LayoutGrid} label="Go to closet" onClick={() => runSheet(() => setView("wardrobe"))} />
            <SheetRow icon={Heart} label="Wishlist" onClick={() => runSheet(() => setView("wishlist"))} />
            <SheetRow icon={Sparkles} label="Beautify" onClick={soon} last />

            {sheetNote && (
              <p className="mt-3 rounded-full bg-surface-2 px-4 py-2 text-center text-sm text-muted">
                {sheetNote}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SheetRow({
  icon: Icon,
  label,
  onClick,
  last,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="native-sheet-row"
      style={last ? { borderBottom: "none" } : undefined}
    >
      <Icon size={20} strokeWidth={1.7} />
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight size={18} className="text-muted" />
    </button>
  );
}

function TabBtn({
  tab,
  view,
  onClick,
}: {
  tab: Tab;
  view: View;
  onClick: (v: View) => void;
}) {
  const active = isActive(tab.view, view);
  const { Icon, label } = tab;
  return (
    <button
      type="button"
      onClick={() => onClick(tab.view)}
      aria-current={active ? "page" : undefined}
      className={`native-tab ${active ? "native-tab-active" : ""}`}
    >
      <Icon size={22} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}
