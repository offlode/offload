import { Link, useLocation } from "wouter";
import { Home, ClipboardList, Wallet, User } from "lucide-react";

const managerNavItems = [
  { label: "Home", path: "/manager", icon: Home },
  { label: "Orders", path: "/manager/orders", icon: ClipboardList },
  { label: "Payouts", path: "/manager/payouts", icon: Wallet },
  { label: "Profile", path: "/manager/profile", icon: User },
];

function ManagerNavItem({ item }: { item: typeof managerNavItems[0] }) {
  const [location] = useLocation();
  const isActive =
    item.path === "/manager"
      ? location === "/manager"
      : location.startsWith(item.path);
  const Icon = item.icon;

  return (
    <Link href={item.path}>
      <button
        data-testid={`manager-nav-${item.label.toLowerCase()}`}
        className={`flex flex-col items-center gap-1 py-2 px-3 transition-colors relative ${
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

export function ManagerBottomNav() {
  return (
    <nav
      data-testid="manager-bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-white/5"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {managerNavItems.map((item) => (
          <ManagerNavItem key={item.label} item={item} />
        ))}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-card">
      <main className="pb-20 max-w-lg mx-auto">
        {children}
      </main>
      <ManagerBottomNav />
    </div>
  );
}
