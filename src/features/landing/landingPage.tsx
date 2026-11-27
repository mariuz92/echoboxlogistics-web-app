import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ArrowRightOutlined, CheckOutlined, CloseOutlined, MenuOutlined } from "@ant-design/icons";
import { CONFIG } from "../../config/configuration";
import { getLandingConfig, getPlansEndpoint } from "./config";
import { DICTS, LANGS, LANG_NAMES, SECTION_IDS, detectLang, rememberLang, type Dict, type Lang, type SectionId } from "./i18n";
import { DELETE_CONTENT } from "./deleteAccountContent";
import { PRICE_PLANS, cheapestPlan, monthlyCost, parsePublicPlans, priceSaving, type PriceInterval, type PricePlan } from "../billing/pricing";
import "./landing.css";

/** Screenshots in public/images/screens (made by scripts/screenshots/capture.mjs). */
const SHOTS = {
  "web-orders": { w: 2880, h: 1800 },
  "crop-order-detail": { w: 1520, h: 1800 },
  "crop-channel-check": { w: 1520, h: 1042 },
  "crop-pickups": { w: 2200, h: 774 },
  "crop-dashboard": { w: 2344, h: 1400 },
  "crop-rider": { w: 1170, h: 2280 },
  "crop-booking": { w: 1170, h: 2280 },
} as const;
type ShotId = keyof typeof SHOTS;

/**
 * How each product section shows its screenshot:
 *   tall   a tall panel (drawer), cut at the bottom
 *   modal  a dialog, shown whole
 *   phone  a phone screen, cut at the bottom
 *   wide   a wide, short table that runs off the right edge
 *   bleed  a wide screen that runs off the right and bottom edges
 */
const SECTION_SHOTS: Record<SectionId, { shot: ShotId; kind: "tall" | "modal" | "phone" | "wide" | "bleed" }> = {
  orders: { shot: "crop-order-detail", kind: "tall" },
  channels: { shot: "crop-channel-check", kind: "modal" },
  riders: { shot: "crop-rider", kind: "phone" },
  pickups: { shot: "crop-pickups", kind: "wide" },
  booking: { shot: "crop-booking", kind: "phone" },
  stats: { shot: "crop-dashboard", kind: "bleed" },
};

/** "?v=<fingerprint>" so a changed screenshot is not served from a cache that holds the old one. */
const version = (file: string) => {
  const v = typeof __SHOT_VERSIONS__ === "undefined" ? undefined : __SHOT_VERSIONS__[file];
  return v ? `?v=${v}` : "";
};

/**
 * The screenshots come from the real app in each language: Italian visitors see the Italian screens
 * (<id>.webp), everyone else the English ones (<id>-en.webp). Both are made by scripts/screenshots.
 */
const shotFile = (id: ShotId, lang: Lang) => (lang === "it" ? id : `${id}-en`);

function Shot({ id, alt, lang, eager = false }: { id: ShotId; alt: string; lang: Lang; eager?: boolean }) {
  const file = shotFile(id, lang);
  return (
    <picture>
      <source type="image/webp" srcSet={`/images/screens/${file}.webp${version(file)}`} />
      <img
        src={`/images/screens/${file}.jpg${version(file)}`}
        alt={alt}
        width={SHOTS[id].w}
        height={SHOTS[id].h}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}

export function LanguageSelect({ lang, onChange, label, id }: { lang: Lang; onChange: (l: Lang) => void; label: string; id: string }) {
  return (
    <span className="lp-lang">
      <label htmlFor={id} className="lp-sr">
        {label}
      </label>
      <select id={id} value={lang} onChange={(e) => onChange(e.target.value as Lang)}>
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </span>
  );
}

function Lightbox({ shot, alt, lang, close, closeLabel }: { shot: ShotId; alt: string; lang: Lang; close: () => void; closeLabel: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  const narrow = SHOTS[shot].w < SHOTS[shot].h;
  return (
    <div className="lp-lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={close}>
      <button className="lp-lightbox-close" onClick={close} aria-label={closeLabel}>
        <CloseOutlined />
      </button>
      <div className={`lp-lightbox-img${narrow ? " is-narrow" : ""}`}>
        <Shot id={shot} alt={alt} lang={lang} eager />
      </div>
    </div>
  );
}

// --- contact form ----------------------------------------------------------------

type FormState = { name: string; email: string; company: string; phone: string; message: string; consent: boolean; website: string };
const EMPTY: FormState = { name: "", email: "", company: "", phone: "", message: "", consent: false, website: "" };
type FieldKey = "name" | "email" | "message" | "consent";
type FieldError = Partial<Record<FieldKey, string>>;

function ContactForm({ t, lang }: { t: Dict; lang: Lang }) {
  const c = t.contact;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FieldError>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [failure, setFailure] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): FieldError => {
    const e: FieldError = {};
    if (form.name.trim().length < 2) e.name = c.errors.name;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = c.errors.email;
    if (form.message.trim().length < 10) e.message = c.errors.message;
    if (!form.consent) e.consent = c.errors.consent;
    return e;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;

    setStatus("sending");
    try {
      const res = await fetch(getLandingConfig().contactEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          phone: form.phone,
          message: form.message,
          locale: lang,
          website: form.website,
        }),
      });
      if (res.ok) {
        setStatus("sent");
        setForm(EMPTY);
        return;
      }
      let code = "";
      try {
        code = ((await res.json()) as { error?: string }).error ?? "";
      } catch {
        /* not json */
      }
      setStatus("idle");
      setFailure(code === "too_many_requests" || res.status === 429 ? c.errors.rate : c.errors.generic);
    } catch {
      setStatus("idle");
      setFailure(c.errors.generic);
    }
  };

  if (status === "sent") {
    return (
      <div className="lp-form lp-form-done" role="status">
        <h3>{c.successTitle}</h3>
        <p>{c.successText}</p>
        <button type="button" className="lp-link" onClick={() => setStatus("idle")}>
          {c.again}
        </button>
      </div>
    );
  }

  const err = (key: FieldKey) =>
    errors[key] ? (
      <span className="lp-err" id={`lp-${key}-err`}>
        {errors[key]}
      </span>
    ) : null;

  const input = (key: "name" | "email" | "company" | "phone", label: string, type: string, auto: string, optional = false) => {
    const invalid = key === "name" || key === "email" ? Boolean(errors[key]) : false;
    return (
      <div className={`lp-field${invalid ? " has-error" : ""}`}>
        <label htmlFor={`lp-${key}`}>
          {label}
          {optional && <span className="lp-optional">{c.optional}</span>}
        </label>
        <input
          id={`lp-${key}`}
          type={type}
          autoComplete={auto}
          value={form[key]}
          maxLength={key === "email" ? 200 : 120}
          onChange={(e) => set(key, e.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `lp-${key}-err` : undefined}
        />
        {(key === "name" || key === "email") && err(key)}
      </div>
    );
  };

  return (
    <form className="lp-form" onSubmit={submit} noValidate>
      <div className="lp-form-row">
        {input("name", c.name, "text", "name")}
        {input("email", c.email, "email", "email")}
      </div>
      <div className="lp-form-row">
        {input("company", c.company, "text", "organization", true)}
        {input("phone", c.phone, "tel", "tel", true)}
      </div>
      <div className={`lp-field${errors.message ? " has-error" : ""}`}>
        <label htmlFor="lp-message">{c.message}</label>
        <textarea
          id="lp-message"
          rows={5}
          maxLength={4000}
          placeholder={c.messagePlaceholder}
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "lp-message-err" : undefined}
        />
        {err("message")}
      </div>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div className="lp-hp" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>
      <div className={`lp-check${errors.consent ? " has-error" : ""}`}>
        <input id="lp-consent" type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
        <label htmlFor="lp-consent">
          {c.consentBefore}
          <a href="/privacy" target="_blank" rel="noreferrer">
            {c.consentLink}
          </a>
          {c.consentAfter}
        </label>
      </div>
      {err("consent")}
      {failure && (
        <p className="lp-alert" role="alert">
          {failure} <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
        </p>
      )}
      <button className="lp-btn lp-btn-primary" type="submit" disabled={status === "sending"}>
        {status === "sending" ? c.sending : c.submit}
      </button>
    </form>
  );
}

// --- page ------------------------------------------------------------------------

function Head({ label, title, children, light = false }: { label: string; title: string; children?: ReactNode; light?: boolean }) {
  return (
    <header className={`lp-head${light ? " is-light" : ""}`}>
      <p className="lp-label">{label}</p>
      <h2>{title}</h2>
      {children}
    </header>
  );
}

// --- pricing ---------------------------------------------------------------------

const LOCALES: Record<Lang, string> = { it: "it-IT", en: "en-GB", de: "de-DE", fr: "fr-FR" };
const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function CalcInput({ id, label, value, onChange, max }: { id: string; label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div className="lp-calc-field">
      <label htmlFor={`${id}-n`}>{label}</label>
      <div className="lp-calc-inputs">
        <input
          type="range"
          aria-label={label}
          min={0}
          max={max}
          step={max > 100 ? 50 : 1}
          value={Math.min(value, max)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          id={`${id}-n`}
          type="number"
          inputMode="numeric"
          min={0}
          max={max * 10}
          value={value}
          onChange={(e) => onChange(clamp(Math.floor(Number(e.target.value)), 0, max * 10))}
        />
      </div>
    </div>
  );
}

/**
 * The plans of the price list: the built-in ones at once, replaced by the ones set in the Superadmin
 * console as soon as the public-plans function answers. If it is not configured, slow, or answers
 * something unexpected, the built-in prices stay.
 */
function usePublicPlans(): readonly PricePlan[] {
  const [plans, setPlans] = useState<readonly PricePlan[]>(PRICE_PLANS);
  useEffect(() => {
    const url = getPlansEndpoint();
    if (!url) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { plans?: unknown } | null) => {
        const parsed = parsePublicPlans(data?.plans);
        if (parsed) setPlans(parsed);
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer));
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);
  return plans;
}

function Pricing({ t, lang, plans }: { t: Dict; lang: Lang; plans: readonly PricePlan[] }) {
  const p = t.pricing;
  const [interval, setInterval] = useState<PriceInterval>("month");
  const [riders, setRiders] = useState(4);
  const [orders, setOrders] = useState(400);
  const currency = plans[0]?.currency ?? "EUR";
  const money = (value: number) =>
    new Intl.NumberFormat(LOCALES[lang], {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  // The yearly switch only exists when at least one plan has a yearly discount.
  const hasYearly = plans.some((plan) => priceSaving(plan) !== null);
  const view: PriceInterval = hasYearly ? interval : "month";
  // The badge on the yearly switch is the best real discount among the plans.
  const bestPercent = Math.max(0, ...plans.map((plan) => priceSaving(plan)?.percent ?? 0));
  const best = cheapestPlan(plans, riders, orders, view);
  // Above the biggest included amounts a custom plan makes more sense than extras.
  const roomRiders = plans.some((plan) => plan.includedRiders === null) ? Infinity : Math.max(...plans.map((plan) => plan.includedRiders ?? 0));
  const roomOrders = plans.some((plan) => plan.includedOrders === null) ? Infinity : Math.max(...plans.map((plan) => plan.includedOrders ?? 0));
  const large = riders > roomRiders || orders > roomOrders;

  return (
    <section className="lp-pricing" id="pricing">
      <div className="lp-wrap">
        <div className="lp-pricing-top">
          <Head label={p.label} title={p.title}>
            <p className="lp-lead">{p.subtitle}</p>
          </Head>
          {hasYearly && (
            <div className="lp-toggle" role="group" aria-label={`${p.monthly} / ${p.yearly}`}>
              {(["month", "year"] as const).map((value) => (
                <button key={value} type="button" className={view === value ? "is-on" : ""} aria-pressed={view === value} onClick={() => setInterval(value)}>
                  {value === "month" ? p.monthly : p.yearly}
                  {value === "year" && <span className="lp-toggle-note">−{bestPercent}%</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lp-plans" style={{ "--plans": Math.min(plans.length, plans.length <= 4 ? 4 : 3) } as CSSProperties}>
          {plans.map((plan) => {
            const tagline = p.plans[plan.code as keyof typeof p.plans]?.tagline ?? plan.description;
            const yearly = view === "year";
            const deal = priceSaving(plan);
            const price = yearly ? plan.priceYear ?? plan.priceMonth * 12 : plan.priceMonth;
            return (
              <article key={plan.code} className={`lp-plan${plan.highlighted ? " is-popular" : ""}`}>
                {plan.highlighted && <span className="lp-plan-badge">{p.popular}</span>}
                <h3>{plan.name}</h3>
                <p className="lp-plan-tagline">{tagline}</p>
                <div className="lp-plan-money">
                  {yearly && deal && <p className="lp-plan-was">{money(deal.listPrice)}</p>}
                  <p className="lp-plan-price">
                    <strong>{money(price)}</strong> <span>{yearly ? p.perYear : p.perMonth}</span>
                  </p>
                  {deal && (yearly ? (
                    <p className="lp-plan-save">
                      <span className="lp-plan-pct">−{deal.percent}%</span>
                      <span>{fill(p.saving, { amount: money(deal.saving) })}</span>
                      <small>{fill(p.monthlyEquivalent, { price: money(deal.perMonth) })}</small>
                    </p>
                  ) : (
                    <p className="lp-plan-hint">{fill(p.monthlyHint, { price: money(deal.perMonth), percent: deal.percent })}</p>
                  ))}
                </div>
                <ul>
                  <li><CheckOutlined />{plan.includedRiders === null ? p.ridersUnlimited : fill(p.ridersIncluded, { n: plan.includedRiders })}</li>
                  <li><CheckOutlined />{plan.includedOrders === null ? p.ordersUnlimited : fill(p.ordersIncluded, { n: plan.includedOrders.toLocaleString(LOCALES[lang]) })}</li>
                  {plan.includedRiders !== null && <li><CheckOutlined />{fill(p.extraRider, { price: money(plan.extraRider) })}</li>}
                  {plan.includedOrders !== null && <li><CheckOutlined />{fill(p.extraOrders, { price: money(plan.extraOrders), block: plan.ordersBlock })}</li>}
                </ul>
                <a className={`lp-btn ${plan.highlighted ? "lp-btn-primary" : "lp-btn-quiet"}`} href="#contact">
                  {p.cta}
                </a>
              </article>
            );
          })}
        </div>
        <p className="lp-pricing-note">{p.everyPlan} {p.vat}</p>
        <p className="lp-pricing-note">{p.yearlyTerms}</p>

        <div className="lp-calc" id="calculator">
          <div className="lp-calc-intro">
            <p className="lp-label">{p.calc.label}</p>
            <h3>{p.calc.title}</h3>
            <p>{p.calc.subtitle}</p>
            <CalcInput id="lp-riders" label={p.calc.riders} value={riders} onChange={setRiders} max={60} />
            <CalcInput id="lp-orders" label={p.calc.orders} value={orders} onChange={setOrders} max={12000} />
          </div>
          <div className="lp-calc-out" aria-live="polite">
            {plans.map((plan) => {
              const cost = monthlyCost(plan, riders, orders, view);
              return (
                <div key={plan.code} className={`lp-calc-row${plan.code === best.code ? " is-best" : ""}`}>
                  <div className="lp-calc-plan">
                    <strong>{plan.name}</strong>
                    {plan.code === best.code && <span className="lp-calc-best">{p.calc.best}</span>}
                  </div>
                  <ul className="lp-calc-lines">
                    <li><span>{p.calc.base}</span><span>{money(cost.base)}</span></li>
                    <li>
                      <span>{p.calc.extraRiders}{cost.extraRiderCount > 0 && ` (${cost.extraRiderCount})`}</span>
                      <span>{cost.extraRiders > 0 ? `+${money(cost.extraRiders)}` : p.calc.included}</span>
                    </li>
                    <li>
                      <span>{p.calc.extraOrders}{cost.extraOrderBlocks > 0 && ` (${cost.extraOrderBlocks} × ${plan.ordersBlock})`}</span>
                      <span>{cost.extraOrders > 0 ? `+${money(cost.extraOrders)}` : p.calc.included}</span>
                    </li>
                  </ul>
                  <p className="lp-calc-total">
                    <span>{p.calc.total}</span>
                    <strong>{money(cost.total)}</strong>
                  </p>
                </div>
              );
            })}
            <p className="lp-calc-note">{large ? p.calc.over : p.calc.note}</p>
          </div>
        </div>

        <div className="lp-custom">
          <div>
            <h3>{p.custom.title}</h3>
            <p>{p.custom.text}</p>
          </div>
          <a className="lp-btn lp-btn-quiet" href="#contact">
            {p.custom.cta} <ArrowRightOutlined />
          </a>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoom, setZoom] = useState<{ shot: ShotId; alt: string } | null>(null);
  const t = DICTS[lang];
  const plans = usePublicPlans();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.meta.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = t.meta.description;
  }, [lang, t]);

  const changeLang = (next: Lang) => {
    setLang(next);
    rememberLang(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
  };

  const links = useMemo(
    () => [
      { href: "#product", label: t.nav.product },
      { href: "#start", label: t.nav.start },
      { href: "#pricing", label: t.nav.pricing },
      { href: "#faq", label: t.nav.faq },
      { href: "#contact", label: t.nav.contact },
    ],
    [t],
  );

  return (
    <div className="lp">
      <header className={`lp-nav${scrolled || menuOpen ? " is-solid" : ""}`}>
        <div className="lp-wrap lp-nav-inner">
          <a href="#top" className="lp-logo" aria-label={CONFIG.appName}>
            <img src={CONFIG.logoOnLight} alt={CONFIG.appName} width={146} height={40} />
          </a>
          <nav className={`lp-nav-links${menuOpen ? " is-open" : ""}`} aria-label={t.nav.menu}>
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="lp-nav-end">
            <LanguageSelect lang={lang} onChange={changeLang} label={t.nav.language} id="lp-lang-top" />
            <a className="lp-btn lp-btn-primary lp-btn-sm" href="#contact">
              {t.nav.demo}
            </a>
            <button
              type="button"
              className="lp-burger"
              aria-label={t.nav.menu}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <CloseOutlined /> : <MenuOutlined />}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the promise, then the product itself */}
        <section className="lp-hero" id="top">
          <div className="lp-wrap">
            <p className="lp-kicker">{t.hero.kicker}</p>
            <h1>{t.hero.title}</h1>
            <p className="lp-hero-sub">{t.hero.subtitle}</p>
            <div className="lp-hero-cta">
              <a className="lp-btn lp-btn-primary" href="#contact">
                {t.hero.primary}
              </a>
              <a className="lp-btn lp-btn-quiet" href="#product">
                {t.hero.secondary} <ArrowRightOutlined />
              </a>
            </div>
            <p className="lp-hero-note">{t.hero.note}</p>
          </div>
          <div className="lp-wrap">
            <div className="lp-hero-visual">
              <figure className="lp-hero-web">
                <button
                  type="button"
                  className="lp-hero-shot"
                  onClick={() => setZoom({ shot: "web-orders", alt: t.hero.imageAlt })}
                  aria-label={`${t.product.enlarge}: ${t.hero.imageAlt}`}
                >
                  <Shot id="web-orders" alt={t.hero.imageAlt} lang={lang} eager />
                </button>
                <figcaption className="lp-cap">{t.hero.webLabel}</figcaption>
              </figure>
              <figure className="lp-hero-phone">
                <button
                  type="button"
                  className="lp-hero-screen"
                  onClick={() => setZoom({ shot: "crop-rider", alt: t.hero.phoneAlt })}
                  aria-label={`${t.product.enlarge}: ${t.hero.phoneAlt}`}
                >
                  <Shot id="crop-rider" alt={t.hero.phoneAlt} lang={lang} eager />
                </button>
                <figcaption className="lp-cap">{t.hero.mobileLabel}</figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* The problem, as a real day */}
        <section className="lp-day">
          <div className="lp-wrap lp-day-grid">
            <Head label={t.day.label} title={t.day.title} light>
              <p className="lp-lead">{t.day.intro}</p>
            </Head>
            <ol className="lp-timeline">
              {t.day.items.map((item) => (
                <li key={item.time}>
                  <time>{item.time}</time>
                  <p>{item.text}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="lp-wrap">
            <p className="lp-day-outro">{t.day.outro}</p>
          </div>
        </section>

        {/* Product, one job per section */}
        <section className="lp-product" id="product">
          <div className="lp-wrap">
            <Head label={t.product.label} title={t.product.title}>
              <p className="lp-small">{t.product.note}</p>
            </Head>
            <div className="lp-rows">
              {SECTION_IDS.map((id, i) => {
                const s = t.product.sections[id];
                const { shot, kind } = SECTION_SHOTS[id];
                return (
                  <article key={id} className={`lp-row${i % 2 ? " is-flipped" : ""}`} id={`product-${id}`}>
                    <div className="lp-row-copy">
                      <p className="lp-label">{s.label}</p>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                      <ul className="lp-points">
                        {s.points.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                    <button
                      type="button"
                      className={`lp-panel is-${kind}`}
                      onClick={() => setZoom({ shot, alt: s.title })}
                      aria-label={`${t.product.enlarge}: ${s.title}`}
                    >
                      <Shot id={shot} alt={s.title} lang={lang} />
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="lp-more">
              <h3>{t.product.moreTitle}</h3>
              <dl>
                {t.product.more.map((m) => (
                  <div key={m.title}>
                    <dt>{m.title}</dt>
                    <dd>{m.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Getting started */}
        <section className="lp-start" id="start">
          <div className="lp-wrap">
            <Head label={t.start.label} title={t.start.title} />
            <ol className="lp-steps">
              {t.start.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
            <a className="lp-start-cta" href="#contact">
              {t.start.cta} <ArrowRightOutlined />
            </a>
          </div>
        </section>

        {/* Pricing and cost calculator */}
        <Pricing t={t} lang={lang} plans={plans} />

        {/* FAQ */}
        <section className="lp-faq" id="faq">
          <div className="lp-wrap lp-faq-grid">
            <Head label={t.faq.label} title={t.faq.title} />
            <div className="lp-faq-list">
              {t.faq.items.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="lp-contact" id="contact">
          <div className="lp-wrap lp-contact-grid">
            <div>
              <Head label={t.contact.label} title={t.contact.title} light>
                <p className="lp-lead">{t.contact.subtitle}</p>
              </Head>
              {getLandingConfig().contactEndpoint && (
                <p className="lp-direct">
                  {t.contact.direct} <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
                </p>
              )}
            </div>
            {getLandingConfig().contactEndpoint ? (
              <ContactForm t={t} lang={lang} />
            ) : (
              <div className="lp-form lp-form-mail">
                <h3>{t.contact.mailTitle}</h3>
                <p>{t.contact.mailText}</p>
                <a className="lp-btn lp-btn-primary" href={`mailto:${CONFIG.supportEmail}`}>
                  {t.contact.mailCta}
                </a>
                <p className="lp-mail-address">{CONFIG.supportEmail}</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div className="lp-footer-brand">
            <span className="lp-logo">
              <img src={CONFIG.logoOnDark} alt={CONFIG.appName} width={146} height={40} />
            </span>
            <p>{t.footer.tagline}</p>
          </div>
          <nav aria-label={t.footer.product}>
            <h4>{t.footer.product}</h4>
            {links.slice(0, 3).map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <nav aria-label={t.footer.legal}>
            <h4>{t.footer.legal}</h4>
            <a href="/privacy">{t.footer.privacy}</a>
            <a href="/terms">{t.footer.terms}</a>
            <a href="/cookies">{t.footer.cookies}</a>
            <a href="/delete-account">{DELETE_CONTENT[lang].footerLink}</a>
          </nav>
          <div>
            <h4>{t.nav.language}</h4>
            <LanguageSelect lang={lang} onChange={changeLang} label={t.nav.language} id="lp-lang-bottom" />
          </div>
        </div>
        <div className="lp-wrap lp-footer-bottom">
          <span>
            © {new Date().getFullYear()} {CONFIG.appName}. {t.footer.rights}
          </span>
          <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
        </div>
      </footer>

      {zoom && <Lightbox shot={zoom.shot} alt={zoom.alt} lang={lang} close={() => setZoom(null)} closeLabel={t.product.close} />}
    </div>
  );
}
