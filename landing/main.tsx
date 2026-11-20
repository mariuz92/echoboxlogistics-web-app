/**
 * Entry point of the marketing site (a separate build from the app: `npm run build:landing`).
 * It renders the landing page and the legal pages only. It does not import the app, the
 * Supabase client or the environment helpers, so it needs no configuration to run.
 */
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "@fontsource-variable/inter";
import LandingPage from "../src/features/landing/landingPage";

const PrivacyPolicy = lazy(() => import("../src/features/landing/privacy"));
const TermsAndConditions = lazy(() => import("../src/features/landing/terms"));
const CookiePolicy = lazy(() => import("../src/features/landing/cookies"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
