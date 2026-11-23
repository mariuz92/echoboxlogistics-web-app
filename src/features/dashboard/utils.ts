import { dayjs, fmtNumber } from "../../lib/dates";
import type { DashboardInsights, PeriodFigures } from "./api";

/**
 * Percentage change between two periods.
 * Returns null when there is no meaningful baseline (previous = 0): the old
 * dashboard showed a fake "+100%" in that case, even when the current value was 0.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatPct(value: number | null): string {
  if (value === null) return "n/d";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}%`;
}

/** A share (0-100) with no decimals, "n/d" without a base. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export const fmtShare = (value: number | null): string => (value === null ? "n/d" : `${Math.round(value)}%`);

/** Whole euros: totals do not need cents. */
export const fmtEuro = (value: number): string =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

export const lossRate = (lost: number, radios: number): number => (radios > 0 ? (lost / radios) * 100 : 0);

export const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const WEEKDAYS_LONG = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

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

/**
 * Plain-language findings, worth acting on, derived from the figures. Warnings first.
 * Every rule stays silent when there is not enough data to say something honest.
 */
export function buildInsights(d: DashboardInsights): Insight[] {
  const out: Insight[] = [];
  const cur = d.current;
  const prev = d.previous;
  const against = d.in_progress ? "agli stessi giorni del mese scorso" : "al mese scorso";

  // 1. revenue and orders against the previous period
  const dRev = pctChange(cur.revenue, prev.revenue);
  const dOrd = pctChange(cur.orders, prev.orders);
  if (dRev !== null) {
    const tone: Tone = dRev >= 3 ? "good" : dRev <= -5 ? "warn" : "info";
    let text = `${formatPct(dRev)} rispetto ${against} (${fmtEuro(cur.revenue)} contro ${fmtEuro(prev.revenue)}).`;
    if (dOrd !== null && dOrd >= 3 && dRev < 0) {
      text += " Gli ordini crescono ma l'incasso no: i gruppi sono più piccoli o i prezzi più bassi.";
    } else if (dOrd !== null && dOrd <= -3 && dRev > 0) {
      text += " Meno ordini ma più incasso: stai lavorando con gruppi più grandi.";
    }
    out.push({ key: "revenue", tone, title: dRev >= 0 ? "Incasso in crescita" : "Incasso in calo", text });
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
      title: "Stagionalità",
      text: `I mesi più forti degli ultimi 12 sono ${best.join(" e ")}, i più deboli ${worst.join(" e ")}. Concentra ferie e manutenzione delle radio nei mesi bassi, assunzioni e scorte in anticipo su quelli alti.`,
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
        title: "Canali quasi esauriti",
        text: `${dayLabel(peakDay.date)}: ${peakDay.groups} gruppi in contemporanea su ${d.capacity.channels} canali (${fmtShare(occupancy)}). Oltre questa soglia rischi di rifiutare prenotazioni: valuta altri canali o altre radio.`,
      });
    } else {
      out.push({
        key: "capacity",
        tone: "info",
        title: "Quante radio ti servono",
        text: `Il giorno di punta (${dayLabel(peakDay.date)}) hanno lavorato insieme ${fmtNumber(peakDay.radios)} radio e ${peakDay.groups} gruppi: è la flotta minima per reggere il mese${occupancy !== null && d.capacity.exclusive ? `, e usa il ${fmtShare(occupancy)} dei canali` : ""}.`,
      });
    }
  }

  // 4. when the riders are busiest, and whether the work is shared evenly
  const slot = [...d.stops].sort((a, b) => b.count - a.count)[0];
  if (slot && slot.count >= 5) {
    out.push({
      key: "peak-hour",
      tone: "info",
      title: "Fascia più carica",
      text: `${WEEKDAYS_LONG[slot.weekday - 1]} alle ${slot.hour}:00 si concentra il lavoro (${slot.count} consegne e ritiri nel mese). Lì servono più rider, e sono ore da non lasciare scoperte.`,
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
        title: "Lavoro non bilanciato",
        text: `${top.name} fa il ${fmtShare(topShare)} degli spostamenti con ${riders.length} rider attivi. Ridistribuire riduce i ritardi e il rischio se manca.`,
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
        title: "Troppo peso su poche guide",
        text: `Le prime 3 guide portano il ${fmtShare(top3Share)} dell'incasso. Se una smette, te ne accorgi: fidelizzale (condizioni, priorità) e lavora su nuovi clienti.`,
      });
    } else {
      out.push({
        key: "concentration",
        tone: "good",
        title: "Clientela ben distribuita",
        text: `Le prime 3 guide portano il ${fmtShare(top3Share)} dell'incasso: nessuna dipendenza pericolosa.`,
      });
    }
  }
  if (d.guides.win_back.length > 0) {
    const value = d.guides.win_back.reduce((acc, g) => acc + g.revenue, 0);
    out.push({
      key: "win-back",
      tone: "warn",
      title: "Guide da riconquistare",
      text: `${d.guides.win_back.length} guide che hanno ordinato più volte non prenotano da oltre 45 giorni (${fmtEuro(value)} di incasso storico). Una telefonata costa meno di un nuovo cliente.`,
    });
  }
  if (d.guides.new > 0) {
    out.push({
      key: "new-guides",
      tone: "good",
      title: "Nuovi clienti",
      text: `${d.guides.new} ${d.guides.new === 1 ? "guida ha ordinato" : "guide hanno ordinato"} per la prima volta${d.in_progress ? " finora" : ""}, per ${fmtEuro(d.guides.new_revenue)}.`,
    });
  }

  // 6. quality: lost radios, punctuality, cancellations
  const lossPct = lossRate(cur.lost, cur.radios);
  if (cur.lost > 0 && lossPct >= 1.5) {
    const worst = d.guides.losses[0];
    out.push({
      key: "losses",
      tone: "warn",
      title: "Radio perse",
      text: `${cur.lost} radio perse (${lossPct.toFixed(1).replace(".", ",")}% di quelle consegnate).${
        worst && worst.lost >= 2 ? ` ${worst.name} da sola ne ha perse ${worst.lost}: valuta una cauzione per chi perde più spesso.` : ""
      }`,
    });
  }
  const onTime = punctuality(cur);
  if (onTime !== null && cur.delivered >= 20 && onTime < 90) {
    const late = [...d.operations.riders]
      .filter((r) => r.delivered >= 15)
      .sort((a, b) => a.on_time / a.delivered - b.on_time / b.delivered)[0];
    const lateShare = late ? (late.on_time / late.delivered) * 100 : 100;
    out.push({
      key: "punctuality",
      tone: "warn",
      title: "Consegne in ritardo",
      text: `Solo il ${fmtShare(onTime)} delle consegne è arrivato entro 10 minuti dall'orario.${
        late && lateShare < onTime - 5 ? ` Il dato più basso è di ${late.name} (${fmtShare(lateShare)}): guarda se i suoi giri sono troppo fitti.` : ""
      }`,
    });
  }
  const cancelRate = share(cur.cancelled, cur.booked);
  if (cancelRate !== null && cur.booked >= 30 && cancelRate >= 6) {
    out.push({
      key: "cancellations",
      tone: "warn",
      title: "Molti annullamenti",
      text: `Il ${fmtShare(cancelRate)} degli ordini è stato annullato (${cur.cancelled} su ${cur.booked}). Capire quando e perché aiuta a chiedere una conferma o una caparra.`,
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
      title: "Prenotazioni last minute",
      text: `Il ${fmtShare(lastMinute)} degli ordini arriva con meno di 24 ore di anticipo: tieni dei rider flessibili e valuta un supplemento per le richieste all'ultimo momento.`,
    });
  }

  const rank: Record<Tone, number> = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 8);
}
