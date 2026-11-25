import { dayjs, fmtNumber } from "../../lib/dates";
import type { DashboardInsights, PeriodFigures } from "./api";
import { numberLocale, t, tn } from "../../i18n";

/**
 * Percentage change between two periods.
 * Returns null when there is no meaningful baseline (previous = 0): the old
 * dashboard showed a fake "+100%" in that case, even when the current value was 0.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** One decimal, in the language's own format ("12,3" or "12.3"). */
export const dec1 = (value: number): string =>
  new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

export function formatPct(value: number | null): string {
  if (value === null) return t("n/d");
  const sign = value > 0 ? "+" : "";
  return `${sign}${dec1(value)}%`;
}

/** A share (0-100) with no decimals, "n/d" without a base. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export const fmtShare = (value: number | null): string => (value === null ? t("n/d") : `${Math.round(value)}%`);

/** Whole euros: totals do not need cents. */
export const fmtEuro = (value: number): string =>
  new Intl.NumberFormat(numberLocale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

export const lossRate = (lost: number, radios: number): number => (radios > 0 ? (lost / radios) * 100 : 0);

export const WEEKDAYS = [t("Lun"), t("Mar"), t("Mer"), t("Gio"), t("Ven"), t("Sab"), t("Dom")];
const WEEKDAYS_LONG = [t("lunedì"), t("martedì"), t("mercoledì"), t("giovedì"), t("venerdì"), t("sabato"), t("domenica")];

/** Share of deliveries within 10 minutes of the scheduled time (null when none was recorded). */
export const punctuality = (p: Pick<PeriodFigures, "delivered" | "on_time">): number | null =>
  share(p.on_time, p.delivered);

export const revenuePerRadio = (p: Pick<PeriodFigures, "revenue" | "radios">): number | null =>
  p.radios > 0 ? p.revenue / p.radios : null;

export const avgRadiosPerOrder = (p: Pick<PeriodFigures, "orders" | "radios">): number | null =>
  p.orders > 0 ? p.radios / p.orders : null;

export type Tone = "good" | "warn" | "info";
export interface Insight {
  key: string;
  tone: Tone;
  title: string;
  text: string;
}

const dayLabel = (date: string) => dayjs(date).format("ddd D MMM");
const MONTH = (ym: string) => dayjs(`${ym}-01`).format("MMMM");
const joinAnd = (items: string[]) => items.join(t(" e "));

/**
 * Plain-language findings, worth acting on, derived from the figures. Warnings first.
 * Every rule stays silent when there is not enough data to say something honest.
 */
export function buildInsights(d: DashboardInsights): Insight[] {
  const out: Insight[] = [];
  const cur = d.current;
  const prev = d.previous;
  const against = d.in_progress ? t("agli stessi giorni del mese scorso") : t("al mese scorso");

  // 1. revenue and orders against the previous period
  const dRev = pctChange(cur.revenue, prev.revenue);
  const dOrd = pctChange(cur.orders, prev.orders);
  if (dRev !== null) {
    const tone: Tone = dRev >= 3 ? "good" : dRev <= -5 ? "warn" : "info";
    let text = t("{change} rispetto {against} ({current} contro {previous}).", {
      change: formatPct(dRev),
      against,
      current: fmtEuro(cur.revenue),
      previous: fmtEuro(prev.revenue),
    });
    if (dOrd !== null && dOrd >= 3 && dRev < 0) {
      text += t(" Gli ordini crescono ma l'incasso no: i gruppi sono più piccoli o i prezzi più bassi.");
    } else if (dOrd !== null && dOrd <= -3 && dRev > 0) {
      text += t(" Meno ordini ma più incasso: stai lavorando con gruppi più grandi.");
    }
    out.push({ key: "revenue", tone, title: dRev >= 0 ? t("Incasso in crescita") : t("Incasso in calo"), text });
  }

  // 2. which months are strong and weak (complete months only)
  const full = d.trend.filter((m) => m.revenue > 0 && !(d.in_progress && m.month === d.month));
  if (full.length >= 6) {
    const byRev = [...full].sort((a, b) => b.revenue - a.revenue);
    const best = byRev.slice(0, 2).map((m) => MONTH(m.month));
    const worst = byRev.slice(-2).map((m) => MONTH(m.month));
    out.push({
      key: "seasonality",
      tone: "info",
      title: t("Stagionalità"),
      text: t(
        "I mesi più forti degli ultimi 12 sono {best}, i più deboli {worst}. Concentra ferie e manutenzione delle radio nei mesi bassi, assunzioni e scorte in anticipo su quelli alti.",
        { best: joinAnd(best), worst: joinAnd(worst) },
      ),
    });
  }

  // 3. capacity: the busiest day and how close it gets to the channels you have
  const peakDay = [...d.capacity.days].sort((a, b) => b.radios - a.radios)[0];
  if (peakDay && peakDay.radios > 0) {
    const occupancy = d.capacity.channels > 0 ? (peakDay.groups / d.capacity.channels) * 100 : null;
    if (d.capacity.exclusive && occupancy !== null && occupancy >= 80) {
      out.push({
        key: "capacity",
        tone: "warn",
        title: t("Canali quasi esauriti"),
        text: t(
          "{day}: {groups} gruppi in contemporanea su {channels} canali ({share}). Oltre questa soglia rischi di rifiutare prenotazioni: valuta altri canali o altre radio.",
          { day: dayLabel(peakDay.date), groups: peakDay.groups, channels: d.capacity.channels, share: fmtShare(occupancy) },
        ),
      });
    } else {
      const base = t(
        "Il giorno di punta ({day}) hanno lavorato insieme {radios} radio e {groups} gruppi: è la flotta minima per reggere il mese",
        { day: dayLabel(peakDay.date), radios: fmtNumber(peakDay.radios), groups: peakDay.groups },
      );
      const channels =
        occupancy !== null && d.capacity.exclusive ? t(", e usa il {share} dei canali", { share: fmtShare(occupancy) }) : "";
      out.push({ key: "capacity", tone: "info", title: t("Quante radio ti servono"), text: `${base}${channels}.` });
    }
  }

  // 4. when the riders are busiest, and whether the work is shared evenly
  const slot = [...d.stops].sort((a, b) => b.count - a.count)[0];
  if (slot && slot.count >= 5) {
    out.push({
      key: "peak-hour",
      tone: "info",
      title: t("Fascia più carica"),
      text: t(
        "{weekday} alle {hour}:00 si concentra il lavoro ({count} consegne e ritiri nel mese). Lì servono più rider, e sono ore da non lasciare scoperte.",
        { weekday: WEEKDAYS_LONG[slot.weekday - 1], hour: slot.hour, count: slot.count },
      ),
    });
  }
  const riders = d.operations.riders;
  const totalStops = riders.reduce((acc, r) => acc + r.stops, 0);
  if (riders.length >= 3 && totalStops >= 30) {
    const top = riders[0];
    const topShare = share(top.stops, totalStops) ?? 0;
    if (topShare > (100 / riders.length) * 1.5) {
      out.push({
        key: "balance",
        tone: "warn",
        title: t("Lavoro non bilanciato"),
        text: t(
          "{name} fa il {share} degli spostamenti con {riders} rider attivi. Ridistribuire riduce i ritardi e il rischio se manca.",
          { name: top.name, share: fmtShare(topShare), riders: riders.length },
        ),
      });
    }
  }

  // 5. customers: concentration, new, lapsed
  const guideRevenue = d.guides.top.reduce((acc, g) => acc + g.revenue, 0);
  const top3 = d.guides.top.slice(0, 3).reduce((acc, g) => acc + g.revenue, 0);
  const top3Share = share(top3, cur.revenue);
  if (top3Share !== null && d.guides.top.length >= 3 && guideRevenue > 0) {
    if (top3Share >= 40) {
      out.push({
        key: "concentration",
        tone: "warn",
        title: t("Troppo peso su poche guide"),
        text: t(
          "Le prime 3 guide portano il {share} dell'incasso. Se una smette, te ne accorgi: fidelizzale (condizioni, priorità) e lavora su nuovi clienti.",
          { share: fmtShare(top3Share) },
        ),
      });
    } else {
      out.push({
        key: "concentration",
        tone: "good",
        title: t("Clientela ben distribuita"),
        text: t("Le prime 3 guide portano il {share} dell'incasso: nessuna dipendenza pericolosa.", { share: fmtShare(top3Share) }),
      });
    }
  }
  if (d.guides.win_back.length > 0) {
    const value = d.guides.win_back.reduce((acc, g) => acc + g.revenue, 0);
    out.push({
      key: "win-back",
      tone: "warn",
      title: t("Guide da riconquistare"),
      text: t(
        "{count} guide che hanno ordinato più volte non prenotano da oltre 45 giorni ({value} di incasso storico). Una telefonata costa meno di un nuovo cliente.",
        { count: d.guides.win_back.length, value: fmtEuro(value) },
      ),
    });
  }
  if (d.guides.new > 0) {
    out.push({
      key: "new-guides",
      tone: "good",
      title: t("Nuovi clienti"),
      text: d.in_progress
        ? tn(d.guides.new, "{n} guida ha ordinato per la prima volta finora, per {value}.", "{n} guide hanno ordinato per la prima volta finora, per {value}.", { value: fmtEuro(d.guides.new_revenue) })
        : tn(d.guides.new, "{n} guida ha ordinato per la prima volta, per {value}.", "{n} guide hanno ordinato per la prima volta, per {value}.", { value: fmtEuro(d.guides.new_revenue) }),
    });
  }

  // 6. quality: lost radios, punctuality, cancellations
  const lossPct = lossRate(cur.lost, cur.radios);
  if (cur.lost > 0 && lossPct >= 1.5) {
    const worst = d.guides.losses[0];
    const base = t("{lost} radio perse ({pct}% di quelle consegnate).", { lost: cur.lost, pct: dec1(lossPct) });
    const who =
      worst && worst.lost >= 2
        ? t(" {name} da sola ne ha perse {lost}: valuta una cauzione per chi perde più spesso.", { name: worst.name, lost: worst.lost })
        : "";
    out.push({ key: "losses", tone: "warn", title: t("Radio perse"), text: `${base}${who}` });
  }
  const onTime = punctuality(cur);
  if (onTime !== null && cur.delivered >= 20 && onTime < 90) {
    const late = [...d.operations.riders]
      .filter((r) => r.delivered >= 15)
      .sort((a, b) => a.on_time / a.delivered - b.on_time / b.delivered)[0];
    const lateShare = late ? (late.on_time / late.delivered) * 100 : 100;
    const base = t("Solo il {share} delle consegne è arrivato entro 10 minuti dall'orario.", { share: fmtShare(onTime) });
    const who =
      late && lateShare < onTime - 5
        ? t(" Il dato più basso è di {name} ({share}): guarda se i suoi giri sono troppo fitti.", {
            name: late.name,
            share: fmtShare(lateShare),
          })
        : "";
    out.push({ key: "punctuality", tone: "warn", title: t("Consegne in ritardo"), text: `${base}${who}` });
  }
  const cancelRate = share(cur.cancelled, cur.booked);
  if (cancelRate !== null && cur.booked >= 30 && cancelRate >= 6) {
    out.push({
      key: "cancellations",
      tone: "warn",
      title: t("Molti annullamenti"),
      text: t(
        "Il {share} degli ordini è stato annullato ({cancelled} su {booked}). Capire quando e perché aiuta a chiedere una conferma o una caparra.",
        { share: fmtShare(cancelRate), cancelled: cur.cancelled, booked: cur.booked },
      ),
    });
  }

  // 7. how early people book
  const lt = d.operations.lead_time;
  const ltTotal = lt.same_day + lt.days_1_2 + lt.days_3_7 + lt.days_8_30 + lt.over_30;
  const lastMinute = share(lt.same_day, ltTotal);
  if (lastMinute !== null && ltTotal >= 30 && lastMinute >= 25) {
    out.push({
      key: "last-minute",
      tone: "warn",
      title: t("Prenotazioni last minute"),
      text: t(
        "Il {share} degli ordini arriva con meno di 24 ore di anticipo: tieni dei rider flessibili e valuta un supplemento per le richieste all'ultimo momento.",
        { share: fmtShare(lastMinute) },
      ),
    });
  }

  const rank: Record<Tone, number> = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 8);
}
