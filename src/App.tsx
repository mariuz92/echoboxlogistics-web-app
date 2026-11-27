import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { Authenticated, Refine } from "@refinedev/core";
import routerProvider, { NavigateToResource } from "@refinedev/react-router";
import { App as AntdApp, ConfigProvider } from "antd";
import { MutationCache, QueryCache } from "@tanstack/react-query";
import { reportWebIssue } from "./features/platform/runtime";
import enGB from "antd/locale/en_GB";
import itIT from "antd/locale/it_IT";

import { isSupabaseConfigured } from "./config/env";
import { getTheme } from "./config/theme";
import { AppLayout } from "./layout/AppLayout";
import { RequireUser } from "./layout/RequireUser";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import { authProvider } from "./providers/auth-provider";
import { accessControlProvider } from "./providers/access-control";
import { CurrentUserProvider, useCurrentUser } from "./providers/current-user";
import { useNotificationProvider } from "./providers/notification-provider";
import { ThemeModeProvider, useThemeMode } from "./providers/theme-mode";
import {
  AccessDenied,
  ConfigurationError,
  FullPageSpinner,
  NotFoundPage,
  SectionSpinner,
} from "./shared/components/Screens";

import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { UpdatePasswordPage } from "./features/auth/UpdatePasswordPage";
import { JoinPage } from "./features/auth/JoinPage";
import { OnboardingPage } from "./features/auth/OnboardingPage";
import { OrdersPage } from "./features/orders/OrdersPage";
import { RiderJobsPage } from "./features/orders/RiderJobsPage";
import { getLang, t } from "./i18n";

// Heavy / rarely used screens are split into their own chunks.
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const CalendarPage = lazy(() => import("./features/calendar/CalendarPage"));
const TeamPage = lazy(() => import("./features/members/TeamPage"));
const AdminShiftsPage = lazy(() => import("./features/shifts/AdminShiftsPage"));
const RiderShiftsPage = lazy(() => import("./features/shifts/RiderShiftsPage"));
const GuidesPage = lazy(() => import("./features/guides/GuidesPage"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"));
const ProfilePage = lazy(() => import("./features/settings/ProfilePage"));
const BookingPage = lazy(() => import("./features/booking/BookingPage"));
const PrivacyPolicy = lazy(() => import("./features/landing/privacy"));
const TermsAndConditions = lazy(() => import("./features/landing/terms"));
const CookiePolicy = lazy(() => import("./features/landing/cookies"));

const RESOURCES = [
  { name: "orders", list: "/" },
  { name: "calendar", list: "/calendar" },
  { name: "dashboard", list: "/dashboard" },
  { name: "riders", list: "/riders" },
  { name: "shifts", list: "/shifts" },
  { name: "my-shifts", list: "/my-shifts" },
  { name: "guides", list: "/guides" },
  { name: "settings", list: "/settings" },
  { name: "profile", list: "/profile" },
];

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useCurrentUser();
  return isAdmin ? <>{children}</> : <AccessDenied message={t("Questa sezione è riservata agli amministratori.")} />;
}

/** Orders for admins, "my jobs" for riders. */
function Home() {
  const { isAdmin } = useCurrentUser();
  return isAdmin ? <OrdersPage /> : <RiderJobsPage />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        {/* Signed-out screens (signed-in users are sent home) */}
        <Route
          element={
            <Authenticated key="public" fallback={<Outlet />} loading={<FullPageSpinner />}>
              <NavigateToResource resource="orders" />
            </Authenticated>
          }
        >
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Reachable with or without a session (links from emails) */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Public booking form for guides */}
        <Route path="/book/:slug" element={<BookingPage />} />
        <Route path="/OrdineGuida" element={<BookingPage legacy />} />

        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/cookies" element={<CookiePolicy />} />

        {/* Signed-in app */}
        <Route
          element={
            <Authenticated key="app" fallback={<Navigate to="/login" replace />} loading={<FullPageSpinner />}>
              <RequireUser>
                <AppLayout />
              </RequireUser>
            </Authenticated>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<SectionSpinner />}>
                <Home />
              </Suspense>
            }
          />
          <Route
            path="/calendar"
            element={
              <AdminOnly>
                <Suspense fallback={<SectionSpinner />}>
                  <CalendarPage />
                </Suspense>
              </AdminOnly>
            }
          />
          <Route
            path="/dashboard"
            element={
              <AdminOnly>
                <Suspense fallback={<SectionSpinner />}>
                  <DashboardPage />
                </Suspense>
              </AdminOnly>
            }
          />
          <Route
            path="/riders"
            element={
              <AdminOnly>
                <Suspense fallback={<SectionSpinner />}>
                  <TeamPage />
                </Suspense>
              </AdminOnly>
            }
          />
          <Route
            path="/shifts"
            element={
              <AdminOnly>
                <Suspense fallback={<SectionSpinner />}>
                  <AdminShiftsPage />
                </Suspense>
              </AdminOnly>
            }
          />
          <Route
            path="/my-shifts"
            element={
              <Suspense fallback={<SectionSpinner />}>
                <RiderShiftsPage />
              </Suspense>
            }
          />
          <Route
            path="/guides"
            element={
              <AdminOnly>
                <Suspense fallback={<SectionSpinner />}>
                  <GuidesPage />
                </Suspense>
              </AdminOnly>
            }
          />
          <Route
            path="/settings"
            element={
              <AdminOnly>
                <Suspense fallback={<SectionSpinner />}>
                  <SettingsPage />
                </Suspense>
              </AdminOnly>
            }
          />
          <Route
            path="/profile"
            element={
              <Suspense fallback={<SectionSpinner />}>
                <ProfilePage />
              </Suspense>
            }
          />

          {/* URLs used by the previous version of the app */}
          <Route path="/Calendario" element={<Navigate to="/calendar" replace />} />
          <Route path="/Profilo" element={<Navigate to="/profile" replace />} />
          <Route path="/Collaboratori" element={<Navigate to="/riders" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

const queryCache = new QueryCache({
  onError: (error) => void reportWebIssue("data", "query_error", error),
});
const mutationCache = new MutationCache({
  onError: (error) => void reportWebIssue("data", "mutation_error", error),
});

function RefineApp() {
  useEffect(() => {
    const unhandled = () => void reportWebIssue("runtime", "unhandled_rejection");
    window.addEventListener("unhandledrejection", unhandled);
    return () => window.removeEventListener("unhandledrejection", unhandled);
  }, []);
  const notificationProvider = useNotificationProvider();

  return (
    <Refine
      authProvider={authProvider}
      accessControlProvider={accessControlProvider}
      routerProvider={routerProvider}
      notificationProvider={notificationProvider}
      resources={RESOURCES}
      options={{
        syncWithLocation: true,
        warnWhenUnsavedChanges: false,
        disableTelemetry: true,
        reactQuery: {
          clientConfig: {
            queryCache,
            mutationCache,
            defaultOptions: {
              queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
            },
          },
        },
      }}
    >
      <AppRoutes />
    </Refine>
  );
}

function Themed({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode();
  return (
    <ConfigProvider theme={getTheme(mode)} locale={getLang() === "en" ? enGB : itIT}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <ThemeModeProvider>
      <Themed>
        <ErrorBoundary>
        <BrowserRouter>
          {!isSupabaseConfigured ? (
            <ConfigurationError />
          ) : (
            <CurrentUserProvider>
              <RefineApp />
            </CurrentUserProvider>
          )}
        </BrowserRouter>
        </ErrorBoundary>
      </Themed>
    </ThemeModeProvider>
  );
}
