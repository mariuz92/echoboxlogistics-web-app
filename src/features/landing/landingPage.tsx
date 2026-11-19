import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  BarChartOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  ExpandOutlined,
  GlobalOutlined,
  HistoryOutlined,
  LinkOutlined,
  MailOutlined,
  MenuOutlined,
  MobileOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { CONFIG } from "../../config/configuration";
import { DICTS, LANGS, LANG_NAMES, detectLang, rememberLang, type Dict, type Lang, type ScreenId } from "./i18n";
import "./landing.css";

const WEB_SCREENS: ScreenId[] = ["web-orders", "web-order-detail", "web-channels", "web-dashboard", "web-calendar", "web-team"];
const MOBILE_SCREENS: ScreenId[] = ["mobile-rider", "mobile-orders", "mobile-booking"];
const FEATURE_ICONS = [
  <UnorderedListOutlined key="o" />,
  <AppstoreOutlined key="c" />,
  <MobileOutlined key="m" />,
  <ClockCircleOutlined key="p" />,
  <LinkOutlined key="l" />,
  <BarChartOutlined key="b" />,
  <TeamOutlined key="t" />,
  <HistoryOutlined key="h" />,
];

/** The app lives on platform.<domain>; the marketing site on the apex domain. */
function appUrl(path: string): string {
  const { protocol, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("platform.")) {
    return path;
  }
  const apex = hostname.replace(/^www\./, "");
  return `${protocol}//platform.${apex}${port ? `:${port}` : ""}${path}`;
}

function Screen({ id, alt, eager = false }: { id: ScreenId; alt: string; eager?: boolean }) {
  const mobile = id.startsWith("mobile-");
  return (
    <picture>
      <source type="image/webp" srcSet={`/images/screens/${id}.webp`} />
      <img
        src={`/images/screens/${id}.jpg`}
        alt={alt}
        width={mobile ? 1170 : 2880}
        height={mobile ? 1992 : 1800}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp-browser">
      <div className="lp-browser-bar" aria-hidden="true">
        <span />
        <span />
        <span />
        <div className="lp-browser-url">platform.echoboxlogistics.com</div>
      </div>
      <div className="lp-browser-body">{children}</div>
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp-phone">
      <div className="lp-phone-notch" aria-hidden="true" />
      <div className="lp-phone-body">{children}</div>
    </div>
  );
}

function SectionHead({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="lp-head">
      <span className="lp-label">{label}</span>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function LanguageSelect({ lang, onChange, label }: { lang: Lang; onChange: (l: Lang) => void; label: string }) {
  return (
    <label className="lp-lang">
      <GlobalOutlined aria-hidden="true" />
      <span className="lp-sr">{label}</span>
      <select value={lang} onChange={(e) => onChange(e.target.value as Lang)}>
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

// --- screens gallery -------------------------------------------------------------

function Gallery({ t }: { t: Dict }) {
  const [tab, setTab] = useState<"web" | "mobile">("web");
  const list = tab === "web" ? WEB_SCREENS : MOBILE_SCREENS;
  const [active, setActive] = useState<ScreenId>("web-orders");
  const [zoom, setZoom] = useState<ScreenId | null>(null);

  const current = list.includes(active) ? active : list[0];

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <>
      <div className="lp-tabs" role="tablist">
        {(["web", "mobile"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "is-active" : ""}
            onClick={() => {
              setTab(k);
              setActive(k === "web" ? WEB_SCREENS[0] : MOBILE_SCREENS[0]);
            }}
          >
            {k === "web" ? <AppstoreOutlined /> : <MobileOutlined />} {k === "web" ? t.screens.web : t.screens.mobile}
          </button>
        ))}
      </div>

      {tab === "web" ? (
        <div className="lp-gallery">
          <ul className="lp-gallery-list">
            {list.map((id) => (
              <li key={id}>
                <button className={id === current ? "is-active" : ""} onClick={() => setActive(id)}>
                  <strong>{t.screens.items[id].title}</strong>
                  <span>{t.screens.items[id].text}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="lp-gallery-stage">
            <button className="lp-zoom" onClick={() => setZoom(current)} aria-label={t.screens.enlarge}>
              <BrowserFrame>
                <Screen id={current} alt={t.screens.items[current].title} />
              </BrowserFrame>
              <span className="lp-zoom-hint">
                <ExpandOutlined /> {t.screens.enlarge}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="lp-phones">
          {list.map((id) => (
            <figure key={id}>
              <button className="lp-zoom" onClick={() => setZoom(id)} aria-label={`${t.screens.enlarge}: ${t.screens.items[id].title}`}>
                <PhoneFrame>
                  <Screen id={id} alt={t.screens.items[id].title} />
                </PhoneFrame>
              </button>
              <figcaption>
                <strong>{t.screens.items[id].title}</strong>
                <span>{t.screens.items[id].text}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="lp-note">{t.screens.note}</p>

      {zoom && (
        <div className="lp-lightbox" role="dialog" aria-modal="true" aria-label={t.screens.items[zoom].title} onClick={() => setZoom(null)}>
          <button className="lp-lightbox-close" onClick={() => setZoom(null)} aria-label={t.screens.close}>
            <CloseOutlined />
          </button>
          <div className={zoom.startsWith("mobile-") ? "lp-lightbox-img is-mobile" : "lp-lightbox-img"}>
            <Screen id={zoom} alt={t.screens.items[zoom].title} eager />
          </div>
          <p>{t.screens.items[zoom].title}</p>
        </div>
      )}
    </>
  );
}

// --- contact form ----------------------------------------------------------------

type FormState = { name: string; email: string; company: string; phone: string; message: string; consent: boolean; website: string };
const EMPTY: FormState = { name: "", email: "", company: "", phone: "", message: "", consent: false, website: "" };
type FieldError = Partial<Record<"name" | "email" | "message" | "consent", string>>;

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
    const { error } = await supabase.functions.invoke("contact", {
      body: {
        name: form.name,
        email: form.email,
        company: form.company,
        phone: form.phone,
        message: form.message,
        locale: lang,
        website: form.website,
      },
    });
    if (!error) {
      setStatus("sent");
      setForm(EMPTY);
      return;
    }
    let code = "";
    if (error instanceof FunctionsHttpError) {
      try {
        code = ((await error.context.json()) as { error?: string }).error ?? "";
      } catch {
        /* not json */
      }
    }
    setStatus("idle");
    setFailure(code === "too_many_requests" ? c.errors.rate : c.errors.generic);
  };

  if (status === "sent") {
    return (
      <div className="lp-form lp-form-done" role="status">
        <div className="lp-done-icon">
          <CheckOutlined />
        </div>
        <h3>{c.successTitle}</h3>
        <p>{c.successText}</p>
        <button className="lp-btn lp-btn-ghost" onClick={() => setStatus("idle")}>
          {c.again}
        </button>
      </div>
    );
  }

  const field = (key: "name" | "email" | "company" | "phone", label: string, type: string, auto: string, optional = false) => (
    <div className={`lp-field${errors[key as keyof FieldError] ? " has-error" : ""}`}>
      <label htmlFor={`lp-${key}`}>
        {label}
        {optional && <small> · {c.optional}</small>}
      </label>
      <input
        id={`lp-${key}`}
        type={type}
        autoComplete={auto}
        value={form[key]}
        maxLength={key === "email" ? 200 : 120}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={Boolean(errors[key as keyof FieldError])}
        aria-describedby={errors[key as keyof FieldError] ? `lp-${key}-err` : undefined}
      />
      {errors[key as keyof FieldError] && (
        <span className="lp-err" id={`lp-${key}-err`}>
          {errors[key as keyof FieldError]}
        </span>
      )}
    </div>
  );

  return (
    <form className="lp-form" onSubmit={submit} noValidate>
      <div className="lp-form-row">
        {field("name", c.name, "text", "name")}
        {field("email", c.email, "email", "email")}
      </div>
      <div className="lp-form-row">
        {field("company", c.company, "text", "organization", true)}
        {field("phone", c.phone, "tel", "tel", true)}
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
        {errors.message && (
          <span className="lp-err" id="lp-message-err">
            {errors.message}
          </span>
        )}
      </div>
      {/* Honeypot: hidden from people, irresistible to bots. */}
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
      {errors.consent && <span className="lp-err">{errors.consent}</span>}
      {failure && (
        <div className="lp-alert" role="alert">
          {failure}{" "}
          <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
        </div>
      )}
      <button className="lp-btn lp-btn-primary lp-btn-block" type="submit" disabled={status === "sending"}>
        {status === "sending" ? c.sending : c.submit}
        {status !== "sending" && <ArrowRightOutlined />}
      </button>
    </form>
  );
}

// --- page ------------------------------------------------------------------------

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = DICTS[lang];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
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
      { href: "#features", label: t.nav.features },
      { href: "#screens", label: t.nav.screens },
      { href: "#how", label: t.nav.how },
      { href: "#faq", label: t.nav.faq },
      { href: "#contact", label: t.nav.contact },
    ],
    [t],
  );

  const year = new Date().getFullYear();

  return (
    <div className="lp">
      {/* Navigation */}
      <header className={`lp-nav${scrolled || menuOpen ? " is-solid" : ""}`}>
        <div className="lp-container lp-nav-inner">
          <a href="#top" className="lp-logo" aria-label={CONFIG.appName}>
            <img src={CONFIG.logo} alt="" width={34} height={34} />
            <span>{CONFIG.appName}</span>
          </a>
          <nav className={`lp-nav-links${menuOpen ? " is-open" : ""}`} aria-label={t.nav.menu}>
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <a className="lp-nav-login-mobile" href={appUrl("/login")}>
              {t.nav.login}
            </a>
          </nav>
          <div className="lp-nav-actions">
            <LanguageSelect lang={lang} onChange={changeLang} label={t.footer.language} />
            <a className="lp-nav-login" href={appUrl("/login")}>
              {t.nav.login}
            </a>
            <a className="lp-btn lp-btn-primary lp-btn-sm" href="#contact">
              {t.nav.demo}
            </a>
            <button className="lp-burger" aria-label={t.nav.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              {menuOpen ? <CloseOutlined /> : <MenuOutlined />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="lp-hero" id="top">
          <div className="lp-hero-glow" aria-hidden="true" />
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow">
                <span className="lp-dot" aria-hidden="true" />
                {t.hero.eyebrow}
              </span>
              <h1>
                {t.hero.title} <span className="lp-accent">{t.hero.accent}</span>
              </h1>
              <p className="lp-hero-sub">{t.hero.subtitle}</p>
              <div className="lp-hero-cta">
                <a className="lp-btn lp-btn-primary" href="#contact">
                  {t.hero.primary} <ArrowRightOutlined />
                </a>
                <a className="lp-btn lp-btn-light" href="#screens">
                  {t.hero.secondary}
                </a>
              </div>
              <ul className="lp-hero-points">
                {t.hero.points.map((p) => (
                  <li key={p}>
                    <CheckOutlined /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-hero-visual">
              <BrowserFrame>
                <Screen id="web-orders" alt={t.screens.items["web-orders"].title} eager />
              </BrowserFrame>
              <div className="lp-hero-phone">
                <PhoneFrame>
                  <Screen id="mobile-rider" alt={t.screens.items["mobile-rider"].title} eager />
                </PhoneFrame>
              </div>
              <div className="lp-live-chip">
                <span className="lp-dot" aria-hidden="true" /> {t.hero.liveBadge}
              </div>
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="lp-audience">
          <div className="lp-container lp-audience-inner">
            <span>{t.audience.label}</span>
            <ul>
              {t.audience.items.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Problems -> solutions */}
        <section className="lp-section">
          <div className="lp-container">
            <SectionHead label={t.problems.label} title={t.problems.title} subtitle={t.problems.subtitle} />
            <div className="lp-compare">
              {t.problems.items.map((item, i) => (
                <article key={i} className="lp-compare-card">
                  <div className="lp-before">
                    <span className="lp-tag lp-tag-bad">{t.problems.before}</span>
                    <p>{item.problem}</p>
                  </div>
                  <div className="lp-after">
                    <span className="lp-tag lp-tag-good">{t.problems.after}</span>
                    <p>{item.solution}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="lp-section lp-section-alt" id="features">
          <div className="lp-container">
            <SectionHead label={t.features.label} title={t.features.title} subtitle={t.features.subtitle} />
            <div className="lp-features">
              {t.features.items.map((f, i) => (
                <article key={f.title} className="lp-feature">
                  <div className="lp-feature-icon">{FEATURE_ICONS[i]}</div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Screens */}
        <section className="lp-section" id="screens">
          <div className="lp-container">
            <SectionHead label={t.screens.label} title={t.screens.title} subtitle={t.screens.subtitle} />
            <Gallery t={t} />
          </div>
        </section>

        {/* How it works */}
        <section className="lp-section lp-section-dark" id="how">
          <div className="lp-container">
            <SectionHead label={t.how.label} title={t.how.title} />
            <ol className="lp-steps">
              {t.how.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Roles */}
        <section className="lp-section">
          <div className="lp-container">
            <SectionHead label={t.roles.label} title={t.roles.title} />
            <div className="lp-roles">
              {t.roles.items.map((r) => (
                <article key={r.role} className="lp-role">
                  <span className="lp-role-name">{r.role}</span>
                  <h3>{r.title}</h3>
                  <ul>
                    {r.points.map((p) => (
                      <li key={p}>
                        <CheckOutlined /> {p}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section lp-section-alt" id="faq">
          <div className="lp-container lp-narrow">
            <SectionHead label={t.faq.label} title={t.faq.title} />
            <div className="lp-faq">
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
        <section className="lp-section" id="contact">
          <div className="lp-container lp-contact">
            <div className="lp-contact-copy">
              <span className="lp-label">{t.contact.label}</span>
              <h2>{t.contact.title}</h2>
              <p>{t.contact.subtitle}</p>
              <ul>
                {t.contact.perks.map((p) => (
                  <li key={p}>
                    <CheckOutlined /> {p}
                  </li>
                ))}
              </ul>
              <p className="lp-direct">
                {t.contact.direct}{" "}
                <a href={`mailto:${CONFIG.supportEmail}`}>
                  <MailOutlined /> {CONFIG.supportEmail}
                </a>
              </p>
            </div>
            <ContactForm t={t} lang={lang} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-grid">
          <div>
            <div className="lp-logo">
              <img src={CONFIG.logo} alt="" width={34} height={34} />
              <span>{CONFIG.appName}</span>
            </div>
            <p>{t.footer.tagline}</p>
          </div>
          <div>
            <h4>{t.footer.product}</h4>
            {links.slice(0, 4).map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
            <a href={appUrl("/login")}>{t.footer.login}</a>
          </div>
          <div>
            <h4>{t.footer.legal}</h4>
            <a href="/privacy">{t.footer.privacy}</a>
            <a href="/terms">{t.footer.terms}</a>
            <a href="/cookies">{t.footer.cookies}</a>
            <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
          </div>
          <div>
            <h4>{t.footer.language}</h4>
            <div className="lp-footer-langs">
              {LANGS.map((l) => (
                <button key={l} className={l === lang ? "is-active" : ""} onClick={() => changeLang(l)} lang={l}>
                  {LANG_NAMES[l]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="lp-container">
          <div className="lp-footer-bottom">
            © {year} {CONFIG.appName}. {t.footer.rights}
          </div>
        </div>
      </footer>
    </div>
  );
}
