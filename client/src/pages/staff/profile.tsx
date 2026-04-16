import { useLocation } from "wouter";
import { LogOut, User, Moon, Sun, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/components/theme-provider";

export default function StaffProfilePage() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
        <h1 className="text-lg font-bold text-foreground mb-1">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account</p>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4">
        {/* User Info */}
        <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p
              data-testid="text-user-name"
              className="text-base font-semibold text-foreground truncate"
            >
              {user?.name || "Staff Member"}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {user?.email || "staff@offload.com"}
            </p>
            <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20">
              Staff
            </span>
          </div>
        </div>

        {/* Settings */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border">
          {/* Theme toggle */}
          <button
            data-testid="button-toggle-theme"
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Moon className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-sm text-foreground flex-1 text-left">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Logout */}
          <button
            data-testid="button-logout"
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-400 flex-1 text-left">Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
