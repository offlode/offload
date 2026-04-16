import { Link, useLocation } from "wouter";
import { ClipboardList, Waves, User, Zap, CheckCircle } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";

const staffNavItems = [
  { label: "Orders", path: "/staff", icon: ClipboardList, exact: true },
  { label: "Washing", path: "/staff/active", icon: Waves, exact: true },
  { label: "AI Queue", path: "/staff/queue", icon: Zap, exact: true },
  { label: "Quality", path: "/staff/quality", icon: CheckCircle, exact: true },
  { label: "Profile", path: "/staff/profile", icon: User, exact: true },
];

function StaffNavItem({ item }: { item: typeof staffNavItems[0] }) {
  const [location] = useLocation();

  const isActive = item.exact
    ? location === item.path
    : location.startsWith(item.path);

  const Icon = item.icon;

  return (
    <Link href={item.path}>
      <button
        data-testid={`staff-nav-${item.label.toLowerCase()}`}
        className={`flex flex-col items-center gap-1 py-2 px-2.5 transition-colors flex-shrink-0 ${
          isActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Icon className="w-5 h-5" />
        <span className="text-[11px] font-medium">{item.label}</span>
      </button>
    </Link>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Staff Header with Notification Bell */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-2">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-sm font-semibold text-foreground">Staff Portal</h1>
          <NotificationBell />
        </div>
      </div>
      <main className="pb-16">{children}</main>
      <nav
        data-testid="staff-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border"
      >
        <div className="flex items-center justify-around max-w-lg mx-auto overflow-x-auto scrollbar-none px-1">
          {staffNavItems.map((item) => (
            <StaffNavItem key={item.label} item={item} />
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
