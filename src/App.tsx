import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { Authenticated, Refine } from "@refinedev/core";
import routerProvider, { NavigateToResource } from "@refinedev/react-router";
import { App as AntdApp, ConfigProvider } from "antd";
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

// Heavy / rarely used screens are split into their own chunks.
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const CalendarPage = lazy(() => import("./features/calendar/CalendarPage"));
const TeamPage = lazy(() => import("./features/members/TeamPage"));
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
  { name: "guides", list: "/guides" },
  { name: "settings", list: "/settings" },
  { name: "profile", list: "/profile" },
];

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useCurrentUser();
  return isAdmin ? <>{children}</> : <AccessDenied message="Questa sezione è riservata agli amministratori." />;
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
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Reachable with or without a session (links from emails) */}
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

function RefineApp() {
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
    <ConfigProvider theme={getTheme(mode)} locale={itIT}>
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
