import { Link, useLocation } from "wouter";
import { Home, ClipboardList, User, MessageCircle, Gift } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { NotificationBell } from "@/components/notification-bell";

const navItems = [
  { label: "Home", path: "/", icon: Home, matchPrefix: false },
  { label: "Orders", path: "/orders", icon: ClipboardList, matchPrefix: true },
  { label: "Chat", path: "/chat", icon: MessageCircle, matchPrefix: true, isCentral: true },
  { label: "Rewards", path: "/loyalty", icon: Gift, matchPrefix: true },
  { label: "Profile", path: "/profile", icon: User, matchPrefix: true },
];

function NavItem({ item }: { item: typeof navItems[0] }) {
  const [location] = useLocation();

  // Use prefix matching for tabs that have sub-routes
  const isActive = item.matchPrefix
    ? (item.path === "/profile"
        ? location === "/profile" || location.startsWith("/addresses") || location.startsWith("/payments")
        : item.path === "/loyalty"
        ? location === "/loyalty" || location === "/referrals"
        : location.startsWith(item.path))
    : location === item.path;

  const Icon = item.icon;
  const isCentral = item.isCentral;

  return (
    <Link href={item.path}>
      <button
        data-testid={`nav-${item.label.toLowerCase()}`}
        className={`flex flex-col items-center gap-1 py-2 px-3 transition-colors relative ${
          isActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {isCentral ? (
          <div className={`flex items-center justify-center w-11 h-11 rounded-full -mt-5 transition-all ${
            isActive
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}>
            <Icon className="w-5 h-5" />
          </div>
        ) : (
          <Icon className="w-5 h-5" />
        )}
        <span className="text-[11px] font-medium">{item.label}</span>
      </button>
    </Link>
  );
}

export function BottomNav() {
  const { user, isAuthenticated } = useAuth();

  // Don't show bottom nav on auth pages
  if (!isAuthenticated) return null;
  // Only show for customers
  if (user?.role !== "customer") return null;

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map(item => (
          <NavItem key={item.label} item={item} />
        ))}
      </div>
      {/* Safe area padding for notched phones */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
