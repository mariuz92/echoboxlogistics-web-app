/**
 * Configuration of the marketing site.
 *
 * The landing page is a static showcase: it never reads environment variables and never signs
 * anybody in, so it can be built and hosted on its own domain (the app, with its login, lives on
 * another one). It has two optional, public integrations, both Edge Functions that hold no secret:
 *
 *  - `contactEndpoint`: the `contact` function (https://<api-host>/functions/v1/contact). While it
 *    is empty the contact section shows the support e-mail address instead of the form.
 *  - `plansEndpoint`: the `public-plans` function, which returns the plans and prices set in the
 *    Superadmin console. When empty it is derived from `contactEndpoint` (same host, /public-plans).
 *    If it is missing or unreachable the page shows the built-in prices (src/features/billing/pricing.ts).
 *
 * The page is complete either way. Without rebuilding, a host can also set them before the page
 * script runs:
 *   <script>window.__ECHOBOX_LANDING__ = { contactEndpoint: "https://…/functions/v1/contact" };</script>
 */
export interface LandingConfig {
  contactEndpoint: string;
  plansEndpoint: string;
}

declare global {
  interface Window {
    __ECHOBOX_LANDING__?: Partial<LandingConfig>;
  }
}

const DEFAULTS: LandingConfig = {
  contactEndpoint: "",
  plansEndpoint: "",
};

export function getLandingConfig(): LandingConfig {
  const runtime = typeof window !== "undefined" ? window.__ECHOBOX_LANDING__ : undefined;
  return { ...DEFAULTS, ...runtime };
}

/** Where the plans are read from: the configured address, else next to the contact function, else nowhere. */
export function getPlansEndpoint(): string {
  const config = getLandingConfig();
  if (config.plansEndpoint) return config.plansEndpoint;
  return /\/contact\/?$/.test(config.contactEndpoint) ? config.contactEndpoint.replace(/\/contact\/?$/, "/public-plans") : "";
}
