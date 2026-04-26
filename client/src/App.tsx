import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { BottomNav } from "@/components/bottom-nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { NotificationBell } from "@/components/notification-bell";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

import HomePage from "@/pages/home";
import SchedulePage from "@/pages/schedule";
import OrdersPage from "@/pages/orders";
import OrderDetailPage from "@/pages/order-detail";
import ProfilePage from "@/pages/profile";
import AddressesPage from "@/pages/addresses";
import PaymentsPage from "@/pages/payments";
import LoyaltyPage from "@/pages/loyalty";
import ReferralsPage from "@/pages/referrals";
import ChatPage from "@/pages/chat";
import AdminOverview from "@/pages/admin/overview";
import AdminOrders from "@/pages/admin/orders";
import AdminVendors from "@/pages/admin/vendors";
import AdminDrivers from "@/pages/admin/drivers";
import AdminDisputes from "@/pages/admin/disputes";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminVendorScoring from "@/pages/admin/vendor-scoring";
import AdminPromos from "@/pages/admin/promos";
import AdminFinancial from "@/pages/admin/financial";
import AdminFraud from "@/pages/admin/fraud";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import RoleSelectPage from "@/pages/role-select";
import StaffLayout from "@/pages/staff/layout";
import StaffOrdersPage from "@/pages/staff/orders";
import StaffActivePage from "@/pages/staff/active";
import StaffProfilePage from "@/pages/staff/profile";
import WeighPhotoPage from "@/pages/staff/weigh-photo";
import StartWashingPage from "@/pages/staff/start-washing";
import DriverDashboard from "@/pages/driver/dashboard";
import DriverOrderDetail from "@/pages/driver/order-detail";
import DriverNavigation from "@/pages/driver/navigation";
import DriverEarnings from "@/pages/driver/earnings";
import DriverAvailability from "@/pages/driver/availability";
import DriverRoute from "@/pages/driver/route";
import StaffQueue from "@/pages/staff/queue";
import StaffQuality from "@/pages/staff/quality";
import ManagerOrders from "@/pages/manager/orders";
import ManagerPayouts from "@/pages/manager/payouts";
import TrackingPage from "@/pages/tracking";
import NotFound from "@/pages/not-found";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";

function RequireAuth({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (allowedRoles && user && user.role !== "admin" && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate home (admin bypasses all role checks)
    switch (user.role) {
      case "customer": return <Redirect to="/" />;
      case "driver": return <Redirect to="/driver" />;
      case "laundromat": return <Redirect to="/staff" />;
      case "manager": return <Redirect to="/manager" />;
      default: return <Redirect to="/" />;
    }
  }

  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      {/* Public auth routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/role-select" component={RoleSelectPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />

      {/* Customer routes */}
      <Route path="/">
        {() => <RequireAuth allowedRoles={["customer"]}><HomePage /></RequireAuth>}
      </Route>
      <Route path="/schedule">
        {() => <RequireAuth allowedRoles={["customer"]}><SchedulePage /></RequireAuth>}
      </Route>
      <Route path="/orders">
        {() => <RequireAuth allowedRoles={["customer"]}><OrdersPage /></RequireAuth>}
      </Route>
      <Route path="/orders/:id">
        {() => <RequireAuth allowedRoles={["customer"]}><OrderDetailPage /></RequireAuth>}
      </Route>
      <Route path="/profile">
        {() => <RequireAuth><ProfilePage /></RequireAuth>}
      </Route>
      <Route path="/addresses">
        {() => <RequireAuth allowedRoles={["customer"]}><AddressesPage /></RequireAuth>}
      </Route>
      <Route path="/payments">
        {() => <RequireAuth allowedRoles={["customer"]}><PaymentsPage /></RequireAuth>}
      </Route>
      <Route path="/loyalty">
        {() => <RequireAuth allowedRoles={["customer"]}><LoyaltyPage /></RequireAuth>}
      </Route>
      <Route path="/referrals">
        {() => <RequireAuth allowedRoles={["customer"]}><ReferralsPage /></RequireAuth>}
      </Route>
      <Route path="/chat">
        {() => <RequireAuth allowedRoles={["customer"]}><ChatPage /></RequireAuth>}
      </Route>
      <Route path="/tracking/:id">
        {() => <RequireAuth allowedRoles={["customer"]}><TrackingPage /></RequireAuth>}
      </Route>

      {/* Staff routes */}
      <Route path="/staff">
        {() => <RequireAuth allowedRoles={["laundromat"]}><StaffLayout><StaffOrdersPage /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/active">
        {() => <RequireAuth allowedRoles={["laundromat"]}><StaffLayout><StaffActivePage /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/profile">
        {() => <RequireAuth allowedRoles={["laundromat"]}><StaffLayout><StaffProfilePage /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/queue">
        {() => <RequireAuth allowedRoles={["laundromat"]}><StaffLayout><StaffQueue /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/quality">
        {() => <RequireAuth allowedRoles={["laundromat"]}><StaffLayout><StaffQuality /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/weigh/:id">
        {() => <RequireAuth allowedRoles={["laundromat"]}><WeighPhotoPage /></RequireAuth>}
      </Route>
      <Route path="/staff/wash/:id">
        {() => <RequireAuth allowedRoles={["laundromat"]}><StartWashingPage /></RequireAuth>}
      </Route>

      {/* Driver routes */}
      <Route path="/driver">
        {() => <RequireAuth allowedRoles={["driver"]}><DriverDashboard /></RequireAuth>}
      </Route>
      <Route path="/driver/orders">
        {() => <RequireAuth allowedRoles={["driver"]}><DriverDashboard /></RequireAuth>}
      </Route>
      <Route path="/driver/order/:id">
        {() => <RequireAuth allowedRoles={["driver"]}><DriverOrderDetail /></RequireAuth>}
      </Route>
      <Route path="/driver/navigation/:id">
        {() => <RequireAuth allowedRoles={["driver"]}><DriverNavigation /></RequireAuth>}
      </Route>
      <Route path="/driver/earnings">
        {() => <RequireAuth allowedRoles={["driver"]}><DriverEarnings /></RequireAuth>}
      </Route>
      <Route path="/driver/availability">
        {() => <RequireAuth allowedRoles={["driver"]}><DriverAvailability /></RequireAuth>}
      </Route>
      <Route path="/driver/route">
        {() => <RequireAuth allowedRoles={["driver"]}><DriverRoute /></RequireAuth>}
      </Route>
      <Route path="/driver/profile">
        {() => <RequireAuth allowedRoles={["driver"]}><ProfilePage /></RequireAuth>}
      </Route>

      {/* Manager routes */}
      <Route path="/manager">
        {() => <RequireAuth allowedRoles={["manager", "admin"]}><ManagerOrders /></RequireAuth>}
      </Route>
      <Route path="/manager/orders">
        {() => <RequireAuth allowedRoles={["manager", "admin"]}><ManagerOrders /></RequireAuth>}
      </Route>
      <Route path="/manager/payouts">
        {() => <RequireAuth allowedRoles={["manager", "admin"]}><ManagerPayouts /></RequireAuth>}
      </Route>
      <Route path="/manager/profile">
        {() => <RequireAuth allowedRoles={["manager", "admin"]}><ProfilePage /></RequireAuth>}
      </Route>

      {/* Admin routes */}
      <Route path="/admin">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminOverview /></RequireAuth>}
      </Route>
      <Route path="/admin/orders">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminOrders /></RequireAuth>}
      </Route>
      <Route path="/admin/vendors">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminVendors /></RequireAuth>}
      </Route>
      <Route path="/admin/drivers">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminDrivers /></RequireAuth>}
      </Route>
      <Route path="/admin/disputes">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminDisputes /></RequireAuth>}
      </Route>
      <Route path="/admin/analytics">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminAnalytics /></RequireAuth>}
      </Route>
      <Route path="/admin/vendor-scoring">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminVendorScoring /></RequireAuth>}
      </Route>
      <Route path="/admin/promos">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminPromos /></RequireAuth>}
      </Route>
      <Route path="/admin/financial">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminFinancial /></RequireAuth>}
      </Route>
      <Route path="/admin/fraud">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminFraud /></RequireAuth>}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAuth = location === "/login" || location === "/register" || location === "/role-select" || location === "/forgot-password" || location.startsWith("/reset-password");
  const isAdmin = location.startsWith("/admin");
  const isStaff = location.startsWith("/staff");
  const isDriver = location.startsWith("/driver");
  const isManager = location.startsWith("/manager");
  // Chat uses its own full-screen layout but still shows the bottom nav
  const isChat = location.startsWith("/chat");

  // These handle their own layout
  if (isAuth || isAdmin || isStaff || isDriver || isManager) {
    return <AppRouter />;
  }

  if (isChat) {
    return (
      <>
        <AppRouter />
        <BottomNav />
      </>
    );
  }

  return (
    <>
      {/* Customer Header with Notification Bell */}
      {user && (
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-2">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <h1 className="text-sm font-semibold text-foreground">Offload</h1>
            <NotificationBell />
          </div>
        </div>
      )}
      <main className="pb-16">
        <AppRouter />
      </main>
      <BottomNav />
    </>
  );
}


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>

            <div className="min-h-screen bg-background">
              <Router hook={useHashLocation}>
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
              </Router>
            </div>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
