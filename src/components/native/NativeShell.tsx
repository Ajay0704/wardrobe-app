"use client";

import {
  Bell,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  Compass,
  Globe,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  MessageCircle,
  Plus,
  Settings,
  Shirt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { unreadCount } from "@/lib/notifications";
import { unreadCount as chatUnreadCount } from "@/lib/chat";
import { useWardrobe, type View } from "@/lib/store";
import { AppViews } from "../AppViews";
import { ProfileAvatar } from "../ProfileAvatar";

// useLayoutEffect on the client (avoids the SSR warning); noop-safe on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Tab = { view: View; label: string; Icon: LucideIcon };

const TITLES: Partial<Record<View, string>> = {
  today: "Home",
  wardrobe: "Closet",
  builder: "Build an outfit",
  outfits: "Outfits",
  messages: "Messages",
  chat: "",
  stylist: "",
  calendar: "Calendar",
  wishlist: "Wishlist",
  travel: "Packing",
  insights: "Insights",
  you: "You",
  explore: "Explore",
  profile: "My Profile",
  social: "Profile",
  userProfile: "Profile",
  settings: "Settings",
  notifications: "Notifications",
  photoDetail: "",
};

// Main tabbed screens — the header actions (bell/calendar/settings) show here.
const MAIN_VIEWS = new Set<View>(["wardrobe", "outfits", "explore"]);
// Root tabs get no back button. Profile is a root tab too, but it renders its
// own chrome (find-friends/new-post + Edit/Share/Settings), so it stays out of
// MAIN_VIEWS to avoid a duplicate header action row.
const ROOT_VIEWS = new Set<View>(["wardrobe", "outfits", "explore", "social"]);

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
  const { view, setView, openAdd, openSplit, openScan } = useWardrobe();
  const profile = useWardrobe((s) => s.profile);
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const showActions = MAIN_VIEWS.has(view);

  // Refresh the bell badge whenever we land on a screen — cheap, RLS-scoped
  // count. Returning from the notifications screen (which marks all read) clears it.
  useEffect(() => {
    let alive = true;
    void unreadCount().then((n) => {
      if (alive) setUnread(n);
    });
    void chatUnreadCount().then((n) => {
      if (alive) setChatUnread(n);
    });
    return () => {
      alive = false;
    };
  }, [view]);

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
    const target = historyRef.current.pop() ?? "explore";
    prevRef.current = target;
    setView(target);
  };

  // Per-view scroll memory. The root tabs stay mounted (keepAliveTabs), so
  // restoring each view's last scroll position on return makes "go in, come
  // back" land exactly where you left off. New/sub-views default to the top.
  const mainRef = useRef<HTMLElement>(null);
  const scrollMem = useRef<Record<string, number>>({});
  const activeScrollView = useRef<View>(view);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      // Only the currently-active view records its position — ignore the
      // clamp/scroll events that fire while a pane is being hidden on a switch,
      // which would otherwise overwrite the outgoing view's saved position.
      if (activeScrollView.current === view) scrollMem.current[view] = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [view]);
  useIsoLayoutEffect(() => {
    activeScrollView.current = view;
    const el = mainRef.current;
    if (el) el.scrollTop = scrollMem.current[view] ?? 0;
  }, [view]);

  // Create sheet: run a real action and close.
  const runSheet = (fn: () => void) => {
    setSheetNote(null);
    setCreateOpen(false);
    fn();
  };

  return (
    <div className="native-shell flex h-[100svh] max-h-[100svh] flex-col overflow-hidden bg-background">
      <header className="native-topbar">
        <div className="flex items-center gap-1.5">
          {!ROOT_VIEWS.has(view) && (
            <button
              type="button"
              aria-label="Back"
              onClick={goBack}
              className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-2"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <span className="brand-wordmark-name !text-xl">
            {view === "today"
              ? "" /* Home's greeting lives in the in-content masthead */
              : (TITLES[view] ?? "Wardrobe")}
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          {showActions && (
            <>
              <button
                type="button"
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
                onClick={() => {
                  setUnread(0);
                  setView("notifications");
                }}
                className="relative text-foreground/80 transition-colors hover:text-foreground"
              >
                <Bell size={21} strokeWidth={1.8} />
                {unread > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
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
                aria-label="Settings"
                onClick={() => setView("you")}
                className="text-foreground/80 transition-colors hover:text-foreground"
              >
                <Settings size={21} strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
      </header>

      <main ref={mainRef} className="native-main flex-1 overflow-y-auto px-4 pt-5">
        <AppViews keepAliveTabs />
      </main>

      <nav className="native-tabbar" aria-label="Primary">
        <TabBtn tab={{ view: "explore", label: "Explore", Icon: Compass }} view={view} onClick={setView} />
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

        <button
          type="button"
          onClick={() => setView("social")}
          aria-label="Profile"
          aria-current={view === "social" ? "page" : undefined}
          className="native-tab"
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${
              view === "social" ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""
            }`}
          >
            <ProfileAvatar profile={profile} size={26} />
          </span>
        </button>
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
            <SheetRow icon={Camera} label="Take photo" onClick={() => runSheet(() => openSplit("camera"))} />
            <SheetRow icon={ImageIcon} label="Photo library" onClick={() => runSheet(() => openSplit("library"))} />
            <SheetRow icon={Sparkles} label="Build closet from photos" onClick={() => runSheet(() => openScan())} />
            <SheetRow icon={Globe} label="Paste a link" onClick={() => runSheet(() => openAdd("link"))} />

            <p className="px-1 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted">
              Closet
            </p>
            <SheetRow icon={LayoutGrid} label="Go to closet" onClick={() => runSheet(() => setView("wardrobe"))} />
            <SheetRow icon={Heart} label="Wishlist" onClick={() => runSheet(() => setView("wishlist"))} last />

            {sheetNote && (
              <p className="mt-3 rounded-full bg-surface-2 px-4 py-2 text-center text-sm text-muted">
                {sheetNote}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Floating chat button — bottom-right above the tab bar, on main views only */}
      {showActions && (
        <button
          type="button"
          aria-label={chatUnread > 0 ? `Messages, ${chatUnread} unread` : "Messages"}
          onClick={() => setView("messages")}
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-black/20"
          style={{ bottom: "calc(env(safe-area-inset-bottom) / 2 + 84px)" }}
        >
          <MessageCircle size={24} strokeWidth={1.9} />
          {chatUnread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-background bg-foreground px-1 text-[11px] font-semibold leading-none text-background">
              {chatUnread > 9 ? "9+" : chatUnread}
            </span>
          )}
        </button>
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
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className="native-tab"
    >
      <span className={`native-tab-icon ${active ? "native-tab-icon-active" : ""}`}>
        <Icon size={22} strokeWidth={1.8} />
      </span>
    </button>
  );
}
