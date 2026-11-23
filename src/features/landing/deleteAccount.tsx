import { useEffect, useState, type ReactNode } from "react";
import { CONFIG } from "../../config/configuration";
import { DELETE_CONTENT } from "./deleteAccountContent";
import { DICTS, detectLang, rememberLang, type Lang } from "./i18n";
import { LanguageSelect } from "./landingPage";
import "./landing.css";

/** **bold** markers in the content become <strong>. */
function rich(text: string): ReactNode[] {
  return text.split("**").map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

/**
 * Public page linked from the Google Play listing ("Delete account URL"). Static, no login, no
 * backend: the request is an e-mail to support, with the steps and the data policy on the page.
 */
export default function DeleteAccountPage() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const c = DELETE_CONTENT[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = c.meta.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = c.meta.description;
  }, [lang, c]);

  const changeLang = (next: Lang) => {
    setLang(next);
    rememberLang(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
  };

  const mailto = `mailto:${CONFIG.supportEmail}?subject=${encodeURIComponent(c.mail.subject)}&body=${encodeURIComponent(c.mail.body)}`;
  const nav = DICTS[lang].nav;

  return (
    <div className="lp lp-doc">
      <header className="lp-doc-bar">
        <div className="lp-wrap lp-doc-bar-inner">
          <a href="/" className="lp-logo" aria-label={CONFIG.appName}>
            <img src={CONFIG.logoOnLight} alt={CONFIG.appName} width={146} height={40} />
          </a>
          <div className="lp-doc-bar-end">
            <a href="/" className="lp-doc-back">
              {c.home}
            </a>
            <LanguageSelect lang={lang} onChange={changeLang} label={nav.language} id="lp-doc-lang" />
          </div>
        </div>
      </header>

      <main className="lp-wrap lp-doc-main">
        <p className="lp-label">{CONFIG.appName}</p>
        <h1>{c.title}</h1>
        <p className="lp-doc-lead">{c.lead}</p>

        <section aria-labelledby="doc-steps">
          <h2 id="doc-steps">{c.stepsTitle}</h2>
          <ol className="lp-doc-steps">
            {c.steps.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <a className="lp-btn lp-btn-primary" href={mailto}>
            {c.mail.button}
          </a>
          <p className="lp-doc-address">{CONFIG.supportEmail}</p>
        </section>

        <section aria-labelledby="doc-who">
          <h2 id="doc-who">{c.who.title}</h2>
          <ul className="lp-doc-list">
            {c.who.items.map((item) => (
              <li key={item}>{rich(item)}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="doc-deleted">
          <h2 id="doc-deleted">{c.deletedTitle}</h2>
          <ul className="lp-doc-list">
            {c.deleted.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="doc-kept">
          <h2 id="doc-kept">{c.keptTitle}</h2>
          <p>{c.keptIntro}</p>
          <div className="lp-doc-kept">
            {c.kept.map((k) => (
              <div key={k.what} className="lp-doc-kept-row">
                <h3>{k.what}</h3>
                <p>{k.why}</p>
                <p>{k.how}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="doc-timing">
          <h2 id="doc-timing">{c.timingTitle}</h2>
          <ul className="lp-doc-list">
            {c.timing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="doc-contact">
          <h2 id="doc-contact">{c.contactTitle}</h2>
          <p>
            {c.contactText} <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>.
          </p>
          <p className="lp-doc-updated">{c.updated}</p>
        </section>
      </main>

      <footer className="lp-doc-foot">
        <div className="lp-wrap">
          © {new Date().getFullYear()} {CONFIG.appName}
        </div>
      </footer>
    </div>
  );
}
