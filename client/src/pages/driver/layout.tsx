import { Link, useLocation } from "wouter";
import { Home, DollarSign, Navigation, User, MoreHorizontal } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";

const driverNavItems = [
  { label: "Home", path: "/driver", icon: Home },
  { label: "Earnings", path: "/driver/earnings", icon: DollarSign },
  { label: "Route", path: "/driver/route", icon: Navigation },
  { label: "Profile", path: "/driver/profile", icon: User },
];

function DriverNavItem({ item }: { item: typeof driverNavItems[0] }) {
  const [location] = useLocation();
  const isActive =
    item.path === "/driver"
      ? location === "/driver"
      : location.startsWith(item.path);
  const Icon = item.icon;

  return (
    <Link href={item.path}>
      <button
        data-testid={`driver-nav-${item.label.toLowerCase()}`}
        className={`flex flex-col items-center gap-1 py-2 px-2.5 transition-colors relative flex-shrink-0 ${
          isActive
            ? "text-white"
            : "text-gray-500 hover:text-gray-300"
        }`}
      >
        <div className="relative">
          <Icon className="w-5 h-5" />
          {isActive && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
          )}
        </div>
        <span className="text-[11px] font-medium">{item.label}</span>
      </button>
    </Link>
  );
}

export function DriverBottomNav() {
  return (
    <nav
      data-testid="driver-bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-white/5"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto overflow-x-auto scrollbar-none px-1">
        {driverNavItems.map((item) => (
          <DriverNavItem key={item.label} item={item} />
        ))}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-card">
      {/* Driver Header with Notification Bell */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-white/5 px-4 py-2">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-sm font-semibold text-white">Driver</h1>
          <NotificationBell />
        </div>
      </div>
      <main className="pb-20 max-w-lg mx-auto">
        {children}
      </main>
      <DriverBottomNav />
    </div>
  );
}
