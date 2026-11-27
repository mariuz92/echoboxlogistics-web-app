// E-mails about subscriptions: limits reached, trial ending, payment reminders.
// Every message is Italian first, English below (the app has no per-company language).

export type NoticeKind =
  | "limit_orders_80"
  | "limit_orders_100"
  | "limit_riders_100"
  | "trial_ending"
  | "past_due"
  | "payment_reminder"
  | "custom";

export interface NoticePayload {
  metric?: "orders" | "riders";
  included?: number;
  used?: number;
  extra_price?: number;
  block?: number;
  currency?: string;
  ends_at?: string;
  grace_until?: string | null;
  message?: string | null;
}

export interface Email {
  subject: string;
  text: string;
  html: string;
}

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function money(value: number | undefined, currency = "EUR", locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value ?? 0);
}

function day(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Rome" }).format(new Date(value));
}

interface Copy { subject: string; lines: string[] }

function copy(kind: NoticeKind, p: NoticePayload, company: string, locale: "it-IT" | "en-GB"): Copy {
  const it = locale === "it-IT";
  const cur = p.currency ?? "EUR";
  switch (kind) {
    case "limit_orders_80":
      return it
        ? { subject: `${company}: hai usato l’80% degli ordini inclusi`, lines: [
          `Questo mese hai creato ${p.used} ordini su ${p.included} inclusi nel tuo piano.`,
          `Oltre ${p.included} ordini, ogni ${p.block} ordini aggiuntivi costano ${money(p.extra_price, cur, locale)}.`,
          "Nessun blocco: puoi continuare a lavorare normalmente.",
        ] }
        : { subject: `${company}: you have used 80% of your included orders`, lines: [
          `This month you created ${p.used} of the ${p.included} orders included in your plan.`,
          `Above ${p.included} orders, every ${p.block} extra orders cost ${money(p.extra_price, cur, locale)}.`,
          "Nothing is blocked: you can keep working as usual.",
        ] };
    case "limit_orders_100":
      return it
        ? { subject: `${company}: hai raggiunto gli ordini inclusi nel piano`, lines: [
          `Questo mese hai creato ${p.used} ordini; il tuo piano ne include ${p.included}.`,
          `Gli ordini aggiuntivi vengono fatturati ${money(p.extra_price, cur, locale)} ogni ${p.block} ordini.`,
          "Nessun blocco: puoi continuare a lavorare normalmente. Se ti serve più spazio puoi cambiare piano.",
        ] }
        : { subject: `${company}: you reached the orders included in your plan`, lines: [
          `This month you created ${p.used} orders; your plan includes ${p.included}.`,
          `Extra orders are billed ${money(p.extra_price, cur, locale)} per ${p.block} orders.`,
          "Nothing is blocked: you can keep working as usual. If you need more room you can change plan.",
        ] };
    case "limit_riders_100":
      return it
        ? { subject: `${company}: hai raggiunto i rider inclusi nel piano`, lines: [
          `Hai ${p.used} rider attivi; il tuo piano ne include ${p.included}.`,
          `Ogni rider aggiuntivo costa ${money(p.extra_price, cur, locale)} al mese.`,
          "Puoi disattivare i rider che non usi dalla sezione Persone.",
        ] }
        : { subject: `${company}: you reached the riders included in your plan`, lines: [
          `You have ${p.used} active riders; your plan includes ${p.included}.`,
          `Each additional rider costs ${money(p.extra_price, cur, locale)} per month.`,
          "You can disable riders you do not use from the People section.",
        ] };
    case "trial_ending":
      return it
        ? { subject: `${company}: la tua prova sta per terminare`, lines: [
          `La prova gratuita termina il ${day(p.ends_at, locale)}.`,
          "Per continuare senza interruzioni scegli un piano dalla sezione Impostazioni → Abbonamento, oppure rispondi a questa email.",
          "Dopo la scadenza l’azienda passa in sola lettura: i dati restano al sicuro.",
        ] }
        : { subject: `${company}: your trial is about to end`, lines: [
          `Your free trial ends on ${day(p.ends_at, locale)}.`,
          "To continue without interruption choose a plan in Settings → Subscription, or reply to this e-mail.",
          "After it ends the company becomes read-only: your data stays safe.",
        ] };
    case "past_due":
      return it
        ? { subject: `${company}: pagamento in ritardo`, lines: [
          "Non risulta ancora ricevuto il pagamento del tuo abbonamento.",
          p.grace_until ? `Hai tempo fino al ${day(p.grace_until, locale)} prima che l’accesso passi in sola lettura.` :
            "Se hai già pagato, rispondi a questa email indicando il riferimento del bonifico.",
        ] }
        : { subject: `${company}: payment overdue`, lines: [
          "We have not received the payment for your subscription yet.",
          p.grace_until ? `You have until ${day(p.grace_until, locale)} before access becomes read-only.` :
            "If you have already paid, reply to this e-mail with the transfer reference.",
        ] };
    case "payment_reminder":
      return it
        ? { subject: `${company}: promemoria di pagamento`, lines: [
          "Ti ricordiamo che c’è una fattura in attesa di pagamento.",
          "Trovi importi e scadenze in Impostazioni → Abbonamento. Se hai già pagato, ignora questo messaggio.",
        ] }
        : { subject: `${company}: payment reminder`, lines: [
          "This is a reminder that an invoice is waiting for payment.",
          "You can find amounts and due dates in Settings → Subscription. If you have already paid, please ignore this message.",
        ] };
    default:
      return { subject: `${company}: ${it ? "comunicazione" : "message"}`, lines: [p.message ?? ""] };
  }
}

/** Builds the bilingual message. `appUrl` (optional) adds a link to the subscription screen. */
export function buildEmail(kind: NoticeKind, payload: NoticePayload, company: string, appUrl?: string): Email {
  const itCopy = copy(kind, payload, company, "it-IT");
  const enCopy = copy(kind, payload, company, "en-GB");
  const custom = kind === "custom" ? (payload.message ?? "").trim() : "";
  const link = appUrl ? `${appUrl.replace(/\/+$/, "")}/settings?tab=subscription` : "";

  const body = (c: Copy) => (custom ? [custom] : c.lines);
  const text = [
    ...body(itCopy), ...(link ? ["", link] : []),
    "", "—", "", ...body(enCopy), ...(link ? ["", link] : []),
    "", "EchoBox Logistics",
  ].join("\n");

  const paragraphs = (c: Copy) => body(c).map((line) => `<p style="margin:0 0 12px">${esc(line)}</p>`).join("");
  const button = link
    ? `<p style="margin:16px 0"><a href="${esc(link)}" style="background:#1677ff;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abbonamento / Subscription</a></p>`
    : "";
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:560px">
    <h2 style="margin:0 0 16px;font-size:18px">${esc(itCopy.subject)}</h2>
    ${paragraphs(itCopy)}${button}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <h3 style="margin:0 0 12px;font-size:16px;color:#4b5563">${esc(enCopy.subject)}</h3>
    ${paragraphs(enCopy)}
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px">EchoBox Logistics</p>
  </div>`;

  return { subject: `${itCopy.subject} / ${enCopy.subject}`.slice(0, 200), text, html };
}
