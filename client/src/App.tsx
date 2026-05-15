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
import { I18nProvider } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OffloadLogo } from "@/components/offload-logo";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

import HomePage from "@/pages/home";
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
import AdminOwnerReview from "@/pages/admin/owner-review";
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
import DashboardPage from "@/pages/dashboard";
import CheckoutPage from "@/pages/checkout";
import TrackEntryPage from "@/pages/track";
import SupportPage from "@/pages/support";
import NotFound from "@/pages/not-found";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import WashPreferencesPage from "@/pages/wash-preferences";
import PartnerSignupPage from "@/pages/partner-signup";
import OrderNewPage from "@/features/wizard/OrderNewPage";
import NotificationsPage from "@/features/notifications/NotificationsPage";
import HelpPage from "@/features/help/HelpPage";
import OrderTrackingPage from "@/features/tracking/OrderTrackingPage";

function RequireAuth({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, isAuthenticated, bootstrapping } = useAuth();
  const [, navigate] = useLocation();

  // P0-5: Wait for auth hydration before redirecting
  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (allowedRoles && user && !["admin", "super_admin"].includes(user.role) && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate home (admin/super_admin bypass all role checks)
    switch (user.role) {
      case "customer": return <Redirect to="/" />;
      case "driver": return <Redirect to="/driver" />;
      case "laundromat":
      case "vendor":
      case "staff":
      case "laundromat_owner":
      case "laundromat_employee":
      case "operator":
      case "wash_operator":
        return <Redirect to="/staff" />;
      case "manager": return <Redirect to="/manager" />;
      default: return <Redirect to="/" />;
    }
  }

  return <>{children}</>;
}

function AppRouter() {
  const scheduleQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?"))
    : window.location.search;

  return (
    <Switch>
      {/* Public auth routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/role-select" component={RoleSelectPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/become-a-partner" component={PartnerSignupPage} />

      {/* Customer routes */}
      <Route path="/">
        {() => <RequireAuth allowedRoles={["customer"]}><HomePage /></RequireAuth>}
      </Route>
      <Route path="/schedule">
        {() => <RequireAuth allowedRoles={["customer"]}><Redirect to={`/order/new${scheduleQuery}`} /></RequireAuth>}
      </Route>
      <Route path="/orders">
        {() => <RequireAuth allowedRoles={["customer"]}><OrdersPage /></RequireAuth>}
      </Route>
      <Route path="/order/new">
        {() => <RequireAuth allowedRoles={["customer"]}><OrderNewPage /></RequireAuth>}
      </Route>
      <Route path="/orders/:id">
        {() => <RequireAuth allowedRoles={["customer"]}><OrderTrackingPage /></RequireAuth>}
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
      <Route path="/chat/order/:orderId">
        {(params) => <RequireAuth allowedRoles={["customer"]}><ChatPage initialOrderId={params.orderId ? Number(params.orderId) : undefined} /></RequireAuth>}
      </Route>
      <Route path="/chat">
        {() => <RequireAuth allowedRoles={["customer"]}><ChatPage /></RequireAuth>}
      </Route>
      <Route path="/tracking/:id">
        {() => <RequireAuth allowedRoles={["customer"]}><OrderTrackingPage /></RequireAuth>}
      </Route>

      {/* D4: additional customer routes */}
      <Route path="/dashboard">
        {() => <RequireAuth allowedRoles={["customer"]}><DashboardPage /></RequireAuth>}
      </Route>
      <Route path="/checkout">
        {() => <RequireAuth allowedRoles={["customer"]}><CheckoutPage /></RequireAuth>}
      </Route>
      <Route path="/track/:orderId">
        {() => <RequireAuth allowedRoles={["customer"]}><TrackEntryPage /></RequireAuth>}
      </Route>
      <Route path="/track">
        {() => <RequireAuth allowedRoles={["customer"]}><TrackEntryPage /></RequireAuth>}
      </Route>
      <Route path="/notifications">
        {() => <RequireAuth allowedRoles={["customer"]}><NotificationsPage /></RequireAuth>}
      </Route>
      <Route path="/help">
        {() => <RequireAuth allowedRoles={["customer"]}><HelpPage /></RequireAuth>}
      </Route>
      <Route path="/support">
        {() => <RequireAuth allowedRoles={["customer"]}><SupportPage /></RequireAuth>}
      </Route>

      {/* Route aliases (BUG-8, 9, 10, 15) */}
      <Route path="/settings">
        {() => <RequireAuth><Redirect to="/profile" /></RequireAuth>}
      </Route>
      <Route path="/payment-methods">
        {() => <RequireAuth><Redirect to="/payments" /></RequireAuth>}
      </Route>
      <Route path="/saved-addresses">
        {() => <RequireAuth><Redirect to="/addresses" /></RequireAuth>}
      </Route>
      <Route path="/wash-preferences">
        {() => <RequireAuth allowedRoles={["customer"]}><WashPreferencesPage /></RequireAuth>}
      </Route>

      {/* Staff routes */}
      <Route path="/staff">
        {() => <RequireAuth allowedRoles={["laundromat", "vendor", "staff", "laundromat_owner", "laundromat_employee", "operator", "wash_operator"]}><StaffLayout><StaffOrdersPage /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/active">
        {() => <RequireAuth allowedRoles={["laundromat", "vendor", "staff", "laundromat_owner", "laundromat_employee", "operator", "wash_operator"]}><StaffLayout><StaffActivePage /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/profile">
        {() => <RequireAuth allowedRoles={["laundromat", "vendor", "staff", "laundromat_owner", "laundromat_employee", "operator", "wash_operator"]}><StaffLayout><StaffProfilePage /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/queue">
        {() => <RequireAuth allowedRoles={["laundromat", "vendor", "staff", "laundromat_owner", "laundromat_employee", "operator", "wash_operator"]}><StaffLayout><StaffQueue /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/quality">
        {() => <RequireAuth allowedRoles={["laundromat", "vendor", "staff", "laundromat_owner", "laundromat_employee", "operator", "wash_operator"]}><StaffLayout><StaffQuality /></StaffLayout></RequireAuth>}
      </Route>
      <Route path="/staff/weigh/:id">
        {() => <RequireAuth allowedRoles={["laundromat", "vendor", "staff", "laundromat_owner", "laundromat_employee", "operator", "wash_operator"]}><WeighPhotoPage /></RequireAuth>}
      </Route>
      <Route path="/staff/wash/:id">
        {() => <RequireAuth allowedRoles={["laundromat", "vendor", "staff", "laundromat_owner", "laundromat_employee", "operator", "wash_operator"]}><StartWashingPage /></RequireAuth>}
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
      <Route path="/admin/review">
        {() => <RequireAuth allowedRoles={["admin"]}><AdminOwnerReview /></RequireAuth>}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAuth = location === "/login" || location === "/register" || location === "/role-select" || location === "/forgot-password" || location.startsWith("/reset-password") || location === "/become-a-partner";
  const isAdmin = location.startsWith("/admin");
  const isStaff = location.startsWith("/staff");
  const isDriver = location.startsWith("/driver");
  const isManager = location.startsWith("/manager");
  // Chat uses its own full-screen layout but still shows the bottom nav
  const isChat = location.startsWith("/chat");
  // Wizard and order tracking have their own header
  const isWizard = location.startsWith("/order/new");
  const isOrderDetail = /^\/orders\/\d+$/.test(location);

  // These handle their own layout
  if (isAuth || isAdmin || isStaff || isDriver || isManager) {
    return <AppRouter />;
  }

  // Full-screen pages that manage their own header but show bottom nav
  if (isChat || isWizard || isOrderDetail) {
    return (
      <>
        <AppRouter />
        {!isWizard && <BottomNav />}
      </>
    );
  }

  return (
    <>
      {/* Customer Header with Notification Bell */}
      {user && (
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-2">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div className="flex items-center gap-2">
              <OffloadLogo size={24} />
              <span className="text-sm font-bold text-foreground">Offload</span>
            </div>
            <div className="flex items-center gap-1">
              <LanguageSwitcher variant="icon" />
              <NotificationBell />
            </div>
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
        <I18nProvider>
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
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
