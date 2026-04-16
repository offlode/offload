import { Link, useRoute, useLocation } from "wouter";
import { useState } from "react";
import {
  LayoutDashboard, ClipboardList, Store, Truck, AlertTriangle,
  ArrowLeft, Package, Menu, X, ChevronRight, User, LogOut,
  BarChart3, Activity, Tag, DollarSign, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { NotificationBell } from "@/components/notification-bell";
import { useAuth } from "@/contexts/auth-context";

const sidebarItems = [
  { label: "Overview", path: "/admin", icon: LayoutDashboard },
  { label: "Orders", path: "/admin/orders", icon: ClipboardList },
  { label: "Vendors", path: "/admin/vendors", icon: Store },
  { label: "Drivers", path: "/admin/drivers", icon: Truck },
  { label: "Disputes", path: "/admin/disputes", icon: AlertTriangle },
  { label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
  { label: "Vendor Health", path: "/admin/vendor-scoring", icon: Activity },
  { label: "Promos", path: "/admin/promos", icon: Tag },
  { label: "Financial", path: "/admin/financial", icon: DollarSign },
  { label: "Fraud", path: "/admin/fraud", icon: ShieldAlert },
];

function SidebarLink({ item, collapsed }: { item: typeof sidebarItems[0]; collapsed?: boolean }) {
  const [isActive] = useRoute(item.path);
  const Icon = item.icon;

  const link = (
    <Link href={item.path}>
      <button
        data-testid={`admin-nav-${item.label.toLowerCase()}`}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        }`}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
        )}
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </button>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

function Breadcrumb() {
  const [location] = useLocation();
  const segments = location.split("/").filter(Boolean);

  const breadcrumbMap: Record<string, string> = {
    admin: "Dashboard",
    orders: "Orders",
    vendors: "Vendors",
    drivers: "Drivers",
    disputes: "Disputes",
    analytics: "Analytics",
    "vendor-scoring": "Vendor Health",
    promos: "Promos",
    financial: "Financial",
    fraud: "Fraud",
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="breadcrumb">
      {segments.map((seg, i) => (
        <span key={seg} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3 h-3" />}
          <span className={i === segments.length - 1 ? "text-foreground font-medium" : ""}>
            {breadcrumbMap[seg] || seg}
          </span>
        </span>
      ))}
    </div>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? "w-16" : "w-60"
        } shrink-0 border-r border-border bg-card/50 flex flex-col transition-all duration-300`}
      >
        {/* Sidebar header */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-[18px] h-[18px] text-primary" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold tracking-tight">Offload</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Admin</p>
              </div>
            )}
          </div>
        </div>

        {/* Admin user section */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" data-testid="text-admin-user-name">
                  {user?.name || "Admin User"}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {user?.role || "Operations"}
                </p>
              </div>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-logout"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Logout
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scrollbar-none">
          {sidebarItems.slice(0, 5).map(item => (
            <SidebarLink key={item.label} item={item} collapsed={collapsed} />
          ))}
          {/* Divider */}
          <div className="py-1.5">
            <div className="h-px bg-border" />
            {!collapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-0.5">Intelligence</p>
            )}
          </div>
          {sidebarItems.slice(5).map(item => (
            <SidebarLink key={item.label} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {/* Bottom section */}
        <div className="p-2 border-t border-border space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            data-testid="button-toggle-sidebar"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-3.5 h-3.5" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          {collapsed && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  data-testid="button-logout-collapsed"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Logout</TooltipContent>
            </Tooltip>
          )}
          <Link href="/">
            <button
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              data-testid="button-back-to-app"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {!collapsed && <span>Back to App</span>}
            </button>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 h-12">
            <Breadcrumb />
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>

        <div className="p-6 max-w-[1200px]">
          {children}
        </div>
      </main>
    </div>
  );
}
