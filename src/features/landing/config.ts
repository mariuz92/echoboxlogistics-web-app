/**
 * Configuration of the marketing site.
 *
 * The landing page is a static showcase: it never reads environment variables, never signs
 * anybody in and does not talk to the app's backend, so it can be built and hosted on its own
 * domain (the app, with its login, lives on another one).
 *
 * The only optional integration is the contact form. Set `contactEndpoint` to the public URL of
 * the `contact` Edge Function (https://<project-ref>.supabase.co/functions/v1/contact; it is
 * public by design and holds no secret). While it is empty the contact section shows the support
 * e-mail address instead of the form, so the page is complete either way.
 *
 * Without rebuilding, a host can also set it before the page script runs:
 *   <script>window.__ECHOBOX_LANDING__ = { contactEndpoint: "https://…/functions/v1/contact" };</script>
 */
export interface LandingConfig {
  contactEndpoint: string;
}

declare global {
  interface Window {
    __ECHOBOX_LANDING__?: Partial<LandingConfig>;
  }
}

const DEFAULTS: LandingConfig = {
  contactEndpoint: "",
};

export function getLandingConfig(): LandingConfig {
  const runtime = typeof window !== "undefined" ? window.__ECHOBOX_LANDING__ : undefined;
  return { ...DEFAULTS, ...runtime };
}
