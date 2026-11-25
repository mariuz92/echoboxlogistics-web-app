// Demo data for the landing-page screenshots.
//
// A fictional Rome tour-equipment company with riders, guides and ~2 months of
// orders around a fixed "now". Rows follow the real table shapes
// (src/types/database.types.ts) and the derived views/RPCs are computed the same
// way the SQL does it (rider_activity, get_channel_board, get_dashboard_stats).
// Everything here is invented: names, phone numbers and e-mail addresses are fake.

export const TZ = "Europe/Rome";

// --- tiny deterministic PRNG ---------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- time zone helpers (Europe/Rome wall clock <-> UTC) ------------------------
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

function romeParts(date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    h: +p.hour,
    mi: +p.minute,
    s: +p.second,
    weekday: p.weekday, // Mon..Sun
  };
}

function offsetMs(date) {
  const p = romeParts(date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Rome wall-clock time -> Date */
export function rome(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

const pad = (n) => String(n).padStart(2, "0");
export const romeDay = (date) => {
  const p = romeParts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};
const ISO_DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// --- fixed ids -----------------------------------------------------------------
const id = (kind, n) => {
  const hex = { tenant: "a0", profile: "b0", guide: "c0", order: "d0", event: "e0" }[kind];
  const s = `${hex}${String(n).padStart(30, "0")}`;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
};

// Free text of the demo company in English, for the English screenshots (names and places stay as they are).
const EN_TEXT = {
  "Consegnare al capogruppo all'ingresso": "Hand over to the group leader at the entrance",
  "Gruppo da crociera, rientro in nave alle 17:00": "Cruise group, back on the ship at 5 pm",
  "Chiamare la guida 10 minuti prima": "Call the guide 10 minutes before",
  "Scuola: 2 classi, servono auricolari monouso": "School: 2 classes, single-use earpieces needed",
  "Fattura intestata all'agenzia": "Invoice to the agency",
  "Lasciare le radio alla reception dell'hotel": "Leave the radios at the hotel reception",
  "Gruppo tedesco, tour in lingua": "German group, tour in their language",
  "La guida riporta le radio in sede entro venerdì": "The guide brings the radios back to the office by Friday",
  "Tour annullato per sciopero dei trasporti": "Tour cancelled because of a transport strike",
  "Preferisce consegna 15 minuti prima": "Prefers delivery 15 minutes early",
  "Gruppi tedeschi, fattura all'agenzia": "German groups, invoice to the agency",
  "Noleggio radioguide per gruppi turistici a Roma e dintorni": "Radio guide rental for tour groups in Rome and surroundings",
};
const translateDemo = (db) => {
  const tr = (v) => (typeof v === "string" && EN_TEXT[v] ? EN_TEXT[v] : v);
  db.tenant.description = tr(db.tenant.description);
  for (const g of db.guides) g.notes = tr(g.notes);
  for (const o of db.orders) o.notes = tr(o.notes);
  return db;
};

export function buildDemo(now, lang = "it") {
  const db = buildDemoData(now);
  return lang === "en" ? translateDemo(db) : db;
}

function buildDemoData(now) {
  const rnd = mulberry32(20261119);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

  const today = romeParts(now);
  const dayAt = (offsetDays, h, mi) => {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + offsetDays));
    return rome(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, mi);
  };
  const iso = (d) => (d ? d.toISOString() : null);

  const TENANT_ID = id("tenant", 1);
  const created = dayAt(-420, 9, 0);

  const tenant = {
    id: TENANT_ID,
    name: "Aurora Tours Roma",
    name_key: "aurora tours roma",
    slug: "aurora-tours",
    description: "Noleggio radioguide per gruppi turistici a Roma e dintorni",
    domain: null,
    timezone: TZ,
    channel_min: 1,
    channel_max: 200,
    channels_exclusive: true,
    disabled_channels: [13, 77],
    public_booking_enabled: true,
    is_active: true,
    created_at: iso(created),
    updated_at: iso(dayAt(-3, 18, 12)),
  };

  const people = [
    // [n, full name, email, phone, roles]
    [1, "Giulia Ferri", "giulia.ferri@auroratours-roma.it", "+39 347 218 4410", ["admin"]],
    [2, "Luca Bianchi", "luca.bianchi@auroratours-roma.it", "+39 333 905 1287", ["rider"]],
    [3, "Marco De Santis", "marco.desantis@auroratours-roma.it", "+39 349 612 0733", ["rider"]],
    [4, "Sara Conti", "sara.conti@auroratours-roma.it", "+39 320 447 9152", ["rider"]],
    [5, "Davide Rinaldi", "davide.rinaldi@auroratours-roma.it", "+39 338 760 2246", ["rider"]],
    [6, "Elena Marchetti", "elena.marchetti@auroratours-roma.it", "+39 345 118 6630", ["admin", "rider"]],
  ];
  const profiles = people.map(([n, full_name, email, phone, roles]) => ({
    id: id("profile", n),
    tenant_id: TENANT_ID,
    full_name,
    email,
    phone,
    roles,
    avatar_url: null,
    disabled: false,
    last_login_at: iso(n === 6 ? dayAt(-1, 14, 40) : dayAt(0, n === 1 ? 7 : 6, n * 9)),
    created_at: iso(dayAt(-400 + n * 20, 10, 0)),
    updated_at: iso(dayAt(-30, 10, 0)),
  }));
  const P = Object.fromEntries(profiles.map((p) => [p.full_name.split(" ")[0], p]));
  const riders = [P.Luca, P.Marco, P.Sara, P.Davide];

  const guideNames = [
    ["Francesca Romano", "+39 333 120 4587"],
    ["Alessandro Greco", "+39 347 662 0918"],
    ["Chiara Lombardi", "+39 328 415 7720"],
    ["Matteo Colombo", "+39 339 078 3341"],
    ["Valentina Esposito", "+39 340 927 1165"],
    ["Paolo Ricci", "+39 335 284 6609"],
    ["Martina Galli", "+39 346 551 2093"],
    ["Stefano Moretti", "+39 331 740 8852"],
    ["Laura Barbieri", "+39 329 368 1470"],
    ["Andrea Fontana", "+39 348 913 5528"],
    ["Federica Caruso", "+39 334 205 7716"],
    ["Simone Gallo", "+39 342 677 3049"],
    ["Ilaria Testa", "+39 327 481 9935"],
    ["Giorgio Villa", "+39 336 159 2284"],
    ["Beatrice Serra", "+39 351 803 4467"],
    ["Nicola Pellegrini", "+39 344 726 0158"],
    ["Anna Cattaneo", "+39 380 344 6912"],
    ["Emma Schneider", "+49 151 2384 7720"],
    ["Claire Dubois", "+33 6 12 48 93 57"],
    ["James Whitfield", "+44 7700 914 562"],
  ];
  const guides = guideNames.map(([full_name, phone], i) => {
    const local = full_name.toLowerCase().replace(/[^a-z ]/g, "").replace(" ", ".");
    return {
      id: id("guide", i + 1),
      tenant_id: TENANT_ID,
      full_name,
      phone,
      phone_digits: phone.replace(/\D/g, ""),
      email: i % 3 === 0 ? null : `${local}@guidaroma.example`,
      email_key: i % 3 === 0 ? null : `${local}@guidaroma.example`,
      notes: i === 0 ? "Preferisce consegna 15 minuti prima" : i === 17 ? "Gruppi tedeschi, fattura all'agenzia" : null,
      created_at: iso(dayAt(-380 + i * 9, 11, 0)),
      updated_at: iso(dayAt(-20, 11, 0)),
    };
  });
  const G = (name) => guides.find((g) => g.full_name.startsWith(name));

  const places = [
    "Piazza del Colosseo, 1, Roma",
    "Musei Vaticani, Viale Vaticano, Roma",
    "Piazza San Pietro, Città del Vaticano",
    "Piazza di Trevi, Roma",
    "Piazza della Rotonda (Pantheon), Roma",
    "Piazza Navona, Roma",
    "Galleria Borghese, Piazzale Scipione Borghese 5, Roma",
    "Castel Sant'Angelo, Lungotevere Castello 50, Roma",
    "Piazza del Campidoglio, 1, Roma",
    "Piazza di Spagna, Roma",
    "Via del Circo Massimo, Roma",
    "Piazza di Santa Maria in Trastevere, Roma",
    "Stazione Termini, Piazza dei Cinquecento, Roma",
    "Piazza di S. Giovanni in Laterano, 4, Roma",
    "Scavi di Ostia Antica, Viale dei Romagnoli 717, Roma",
    "Terminal Crociere, Porto di Civitavecchia",
    "Via Nazionale, 7, Roma (hotel)",
    "Via Veneto, 125, Roma (hotel)",
  ];
  const notesPool = [
    "Consegnare al capogruppo all'ingresso",
    "Gruppo da crociera, rientro in nave alle 17:00",
    "Chiamare la guida 10 minuti prima",
    "Scuola: 2 classi, servono auricolari monouso",
    "Fattura intestata all'agenzia",
    "Lasciare le radio alla reception dell'hotel",
    "Gruppo tedesco, tour in lingua",
  ];

  const RIDER_LATE = { Luca: 0.05, Marco: 0.12, Sara: 0.07, Davide: 0.2, Elena: 0.08 };

  // Who orders when: a few busy guides, some who started recently, some who stopped.
  // [guide index, first active day offset, last active day offset, weight]
  const GUIDE_PROFILE = {
    0: [-400, 99, 3.2], 1: [-400, 99, 2.4], 2: [-400, 99, 2.0], 3: [-400, 99, 1.5], 4: [-400, 99, 1.3],
    5: [-400, 99, 1.1], 6: [-400, 99, 1.0], 7: [-400, 99, 0.9], 8: [-360, 99, 0.8], 9: [-330, 99, 0.7],
    10: [-300, 99, 0.6], 11: [-280, 99, 0.6], 12: [-400, -75, 0.7], 13: [-150, 99, 0.7], 14: [-200, 99, 0.6],
    15: [-400, -120, 0.7], 16: [-380, -52, 0.6], 17: [-40, 99, 1.2], 18: [-12, 99, 0.8], 19: [-6, 99, 0.7],
  };
  const pickGuide = (offset) => {
    const live = guides.filter((_, i) => offset >= GUIDE_PROFILE[i][0] && offset <= GUIDE_PROFILE[i][1]);
    const w = (g) => GUIDE_PROFILE[guides.indexOf(g)][2];
    let r = rnd() * live.reduce((t, g) => t + w(g), 0);
    for (const g of live) {
      r -= w(g);
      if (r <= 0) return g;
    }
    return live[live.length - 1];
  };
  // Rome tourism through the year (relative to November = 1) and a business that grew over the year.
  const SEASON = [0.55, 0.68, 1.0, 1.45, 1.6, 1.5, 1.25, 0.85, 1.5, 1.68, 1.0, 0.85];
  const LOSS_PROB = { 3: 0.12, 5: 0.09 };

  const orders = [];
  let seq = 0;
  const price = (radios) => Math.round(radios * (rnd() < 0.5 ? 2.5 : 3));

  function add(o) {
    seq += 1;
    const guide = o.guide ?? pick(guides);
    const radios = o.radios ?? between(10, 48);
    const extra = o.extra ?? (rnd() < 0.25 ? between(1, 3) : 0);
    const delivery_at = o.delivery;
    const pickup_at = o.pickup === undefined ? new Date(delivery_at.getTime() + between(3, 7) * 3600e3) : o.pickup;
    // about one booking in five is last minute (the day before or the same day)
    const createdAt =
      rnd() < 0.22
        ? new Date(delivery_at.getTime() - between(1, 20) * 3600e3)
        : new Date(delivery_at.getTime() - between(2, 20) * 86400e3 - between(0, 600) * 60e3);
    const row = {
      id: id("order", seq),
      tenant_id: TENANT_ID,
      guide_id: guide.id,
      guide_name: guide.full_name,
      guide_phone: guide.phone,
      guide_email: guide.email,
      radios_count: radios,
      extra_radios: extra,
      lost_radios: o.lost ?? 0,
      balance: o.balance ?? price(radios + extra),
      invoice_required: o.invoice ?? rnd() < 0.2,
      delivery_at: iso(delivery_at),
      delivery_address: o.where ?? pick(places),
      pickup_at: iso(pickup_at),
      pickup_address: pickup_at ? (o.pickupWhere ?? (rnd() < 0.7 ? o.where : null) ?? pick(places)) : null,
      radio_channel: o.channel ?? null,
      status: o.status,
      delivery_rider_id: o.deliveryRider?.id ?? null,
      pickup_rider_id: o.pickupRider?.id ?? null,
      notes: o.notes === undefined ? (rnd() < 0.22 ? pick(notesPool) : null) : o.notes,
      source: o.source ?? (rnd() < 0.3 ? "public_form" : "dashboard"),
      created_by: o.source === "public_form" ? null : P.Giulia.id,
      delivered_at: null,
      picked_up_at: null,
      created_at: iso(createdAt),
      updated_at: iso(o.updated ?? new Date(Math.min(now.getTime() - 5 * 60e3, delivery_at.getTime() + 20 * 60e3))),
    };
    const doneDelivery = ["delivered", "awaiting_pickup", "pickup_assigned", "out_for_pickup", "picked_up"];
    if (doneDelivery.includes(row.status)) {
      // riders are not equally punctual
      const late = rnd() < (o.deliveryRider ? (RIDER_LATE[o.deliveryRider.full_name.split(" ")[0]] ?? 0.1) : 0.1);
      row.delivered_at = iso(
        new Date(delivery_at.getTime() + (late ? between(11, 35) : -between(2, 12)) * 60e3),
      );
    }
    if (row.status === "picked_up") {
      row.picked_up_at = iso(new Date((pickup_at ?? delivery_at).getTime() + between(0, 25) * 60e3));
    }
    if (row.source === "public_form") row.created_by = null;
    orders.push(row);
    return row;
  }

  // --- history: the last 13 months, almost everything closed -------------------
  const usedPlaces = places.slice(0, 15);
  for (let off = -400; off <= -1; off++) {
    const date = dayAt(off, 12, 0);
    const parts = romeParts(date);
    const dow = ISO_DOW[parts.weekday];
    const growth = 0.75 + 0.25 * (1 - -off / 400);
    const n = Math.round((dow >= 6 ? between(11, 17) : between(7, 13)) * SEASON[parts.m - 1] * growth);
    for (let i = 0; i < n; i++) {
      const h = between(7, 15);
      const delivery = dayAt(off, h, pick([0, 15, 30, 45]));
      const source = rnd() < 0.3 ? "public_form" : "dashboard";
      const cancelled = rnd() < (source === "public_form" ? 0.07 : 0.03);
      const rider = pick(riders);
      const guide = pickGuide(off);
      add({
        delivery,
        guide,
        source,
        where: pick(usedPlaces),
        status: cancelled ? "cancelled" : "picked_up",
        channel: (() => {
          const c = between(1, 60);
          return c === 13 ? 12 : c;
        })(),
        deliveryRider: cancelled ? null : rider,
        pickupRider: cancelled ? null : rnd() < 0.6 ? rider : pick(riders),
        lost: !cancelled && rnd() < (LOSS_PROB[guides.indexOf(guide)] ?? 0.02) ? between(1, 2) : 0,
        notes: null,
      });
    }
  }

  // --- open pickups left over from the past days (shown as overdue) -------------
  add({
    delivery: dayAt(-2, 9, 30),
    guide: G("Giorgio"),
    radios: 26,
    where: "Musei Vaticani, Viale Vaticano, Roma",
    pickup: null,
    status: "delivered",
    channel: 27,
    deliveryRider: P.Marco,
    notes: "La guida riporta le radio in sede entro venerdì",
    source: "dashboard",
  });
  add({
    delivery: dayAt(-1, 14, 0),
    guide: G("Beatrice"),
    radios: 19,
    where: "Via del Circo Massimo, Roma",
    pickup: dayAt(-1, 18, 30),
    pickupWhere: "Via Veneto, 125, Roma (hotel)",
    status: "awaiting_pickup",
    channel: 25,
    deliveryRider: P.Sara,
    notes: "Lasciare le radio alla reception dell'hotel",
  });

  // --- today --------------------------------------------------------------------
  const T = (h, mi) => dayAt(0, h, mi);
  add({ delivery: T(7, 45), guide: G("Francesca"), radios: 32, where: "Piazza del Colosseo, 1, Roma",
    pickup: T(11, 30), pickupWhere: "Piazza del Colosseo, 1, Roma", status: "pickup_assigned", channel: 4,
    deliveryRider: P.Luca, pickupRider: P.Luca, notes: "Consegnare al capogruppo all'ingresso", source: "dashboard" });
  add({ delivery: T(8, 15), guide: G("Emma"), radios: 44, extra: 2, where: "Musei Vaticani, Viale Vaticano, Roma",
    pickup: T(12, 45), pickupWhere: "Piazza San Pietro, Città del Vaticano", status: "awaiting_pickup", channel: 7,
    deliveryRider: P.Marco, notes: "Gruppo tedesco, tour in lingua", invoice: true, source: "dashboard" });
  add({ delivery: T(8, 30), guide: G("Paolo"), radios: 24, where: "Piazza San Pietro, Città del Vaticano",
    pickup: T(12, 0), status: "pickup_assigned", channel: 9, deliveryRider: P.Marco, pickupRider: P.Davide, source: "public_form" });
  add({ delivery: T(9, 0), guide: G("Claire"), radios: 18, where: "Piazza di Trevi, Roma",
    pickup: null, status: "delivered", channel: 11, deliveryRider: P.Sara, notes: null, source: "public_form" });
  add({ delivery: T(9, 30), guide: G("Laura"), radios: 22, where: "Galleria Borghese, Piazzale Scipione Borghese 5, Roma",
    pickup: T(13, 0), status: "awaiting_pickup", channel: 2, deliveryRider: P.Sara, source: "dashboard" });
  add({ delivery: T(10, 30), guide: G("Alessandro"), radios: 28, where: "Piazza della Rotonda (Pantheon), Roma",
    pickup: T(14, 30), status: "out_for_delivery", channel: 5, deliveryRider: P.Luca, notes: "Chiamare la guida 10 minuti prima",
    updated: T(10, 9), source: "dashboard" });
  add({ delivery: T(10, 45), guide: G("James"), radios: 38, extra: 3, where: "Terminal Crociere, Porto di Civitavecchia",
    pickup: T(16, 30), pickupWhere: "Terminal Crociere, Porto di Civitavecchia", status: "out_for_delivery", channel: 6,
    deliveryRider: P.Davide, notes: "Gruppo da crociera, rientro in nave alle 17:00", invoice: true, updated: T(9, 40), source: "dashboard" });
  add({ delivery: T(11, 15), guide: G("Chiara"), radios: 36, where: "Castel Sant'Angelo, Lungotevere Castello 50, Roma",
    pickup: T(15, 0), status: "delivery_assigned", channel: 14, deliveryRider: P.Sara, source: "dashboard" });
  add({ delivery: T(12, 0), guide: G("Matteo"), radios: 15, where: "Piazza Navona, Roma",
    pickup: T(15, 30), status: "delivery_assigned", channel: 16, deliveryRider: P.Marco, source: "public_form" });
  add({ delivery: T(13, 30), guide: G("Valentina"), radios: 40, where: "Piazza del Colosseo, 1, Roma",
    pickup: T(17, 0), status: "received", channel: 18, notes: "Scuola: 2 classi, servono auricolari monouso", source: "dashboard" });
  add({ delivery: T(14, 0), guide: G("Federica"), radios: 20, where: "Piazza del Campidoglio, 1, Roma",
    pickup: T(17, 30), status: "received", channel: 4, source: "public_form", notes: null });
  add({ delivery: T(15, 0), guide: G("Simone"), radios: 12, where: "Piazza di Santa Maria in Trastevere, Roma",
    pickup: T(18, 30), status: "received", channel: 21, source: "public_form", notes: null });
  add({ delivery: T(16, 30), guide: G("Martina"), radios: 30, where: "Stazione Termini, Piazza dei Cinquecento, Roma",
    pickup: dayAt(1, 10, 0), pickupWhere: "Via Nazionale, 7, Roma (hotel)", status: "delivery_assigned", channel: 22,
    deliveryRider: P.Luca, notes: "Lasciare le radio alla reception dell'hotel", source: "dashboard" });
  add({ delivery: T(11, 0), guide: G("Stefano"), radios: 16, where: "Piazza di Spagna, Roma",
    pickup: T(14, 0), status: "cancelled", channel: null, notes: "Tour annullato per sciopero dei trasporti", source: "dashboard" });
  // yesterday's tour, radios being collected right now
  add({ delivery: dayAt(-1, 15, 0), guide: G("Andrea"), radios: 26, where: "Piazza di S. Giovanni in Laterano, 4, Roma",
    pickup: T(10, 15), pickupWhere: "Via Nazionale, 7, Roma (hotel)", status: "out_for_pickup", channel: 3,
    deliveryRider: P.Davide, pickupRider: P.Elena, updated: T(9, 58), source: "dashboard" });

  // --- next two weeks -------------------------------------------------------------
  for (let off = 1; off <= 21; off++) {
    const date = dayAt(off, 12, 0);
    const dow = ISO_DOW[romeParts(date).weekday];
    const n = Math.max(1, (dow >= 6 ? between(7, 12) : between(4, 9)) - Math.floor(off / 4));
    for (let i = 0; i < n; i++) {
      const delivery = dayAt(off, between(7, 15), pick([0, 15, 30, 45]));
      const assigned = off === 1 && rnd() < 0.6;
      add({
        delivery,
        guide: pickGuide(off),
        where: pick(usedPlaces),
        status: assigned ? "delivery_assigned" : "received",
        deliveryRider: assigned ? pick(riders) : null,
      });
    }
  }

  // Channels for tomorrow's orders (booked in advance); later ones get one on the day.
  const busy = new Set(
    orders
      .filter((o) => o.radio_channel !== null && !["picked_up", "cancelled"].includes(o.status))
      .map((o) => o.radio_channel),
  );
  const tomorrow = romeDay(dayAt(1, 12, 0));
  for (const o of orders) {
    if (romeDay(new Date(o.delivery_at)) !== tomorrow || o.status === "cancelled") continue;
    for (let c = tenant.channel_min; c <= tenant.channel_max; c++) {
      if (busy.has(c) || tenant.disabled_channels.includes(c)) continue;
      o.radio_channel = c;
      busy.add(c);
      break;
    }
  }

  // Embedded rider names, as in ORDER_SELECT.
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
  for (const o of orders) {
    o.delivery_rider = o.delivery_rider_id ? { id: o.delivery_rider_id, full_name: byId[o.delivery_rider_id].full_name } : null;
    o.pickup_rider = o.pickup_rider_id ? { id: o.pickup_rider_id, full_name: byId[o.pickup_rider_id].full_name } : null;
  }

  // Audit trail (shown in the order drawer), as written by private.orders_audit().
  const FLOW = ["received", "delivery_assigned", "out_for_delivery", "awaiting_pickup", "pickup_assigned", "out_for_pickup", "picked_up"];
  const order_events = [];
  let ev = 0;
  const recent = orders.filter((x) => Math.abs(new Date(x.delivery_at) - now) < 2 * 86400e3);
  for (const o of recent) {
    const at = (ms) => iso(new Date(Math.min(ms, now.getTime() - 60e3)));
    const push = (when, type, data) =>
      order_events.push({
        id: ++ev,
        order_id: o.id,
        tenant_id: TENANT_ID,
        actor_id: data.actor === undefined ? P.Giulia.id : data.actor,
        event_type: type,
        from_status: data.from ?? null,
        to_status: data.to ?? null,
        payload: data.payload ?? {},
        created_at: at(when),
      });
    const dAt = new Date(o.delivery_at).getTime();
    const pAt = o.pickup_at ? new Date(o.pickup_at).getTime() : dAt + 4 * 3600e3;
    push(new Date(o.created_at).getTime(), "created", {
      to: "received",
      actor: o.created_by,
      payload: { source: o.source },
    });
    if (o.status === "cancelled") {
      push(dAt - 20 * 3600e3, "status_changed", { from: "received", to: "cancelled" });
      continue;
    }
    const reached = FLOW.indexOf(o.status === "delivered" ? "awaiting_pickup" : o.status);
    const step = (i, when, actor) => {
      const to = i === 3 && o.status === "delivered" ? "delivered" : FLOW[i];
      if (i === 1 || i === 4) {
        const field = i === 1 ? "delivery_rider_id" : "pickup_rider_id";
        push(when, "status_changed", {
          from: FLOW[i - 1],
          to,
          payload: { changes: { status: { from: FLOW[i - 1], to }, [field]: { from: null, to: o[field] } } },
        });
      } else {
        push(when, "status_changed", { from: FLOW[i - 1], to, actor });
      }
    };
    if (reached >= 1) step(1, dAt - 16 * 3600e3);
    if (reached >= 2) step(2, dAt - 35 * 60e3, o.delivery_rider_id);
    if (reached >= 3) step(3, dAt - 6 * 60e3, o.delivery_rider_id);
    if (reached >= 4) step(4, dAt + 25 * 60e3);
    if (reached >= 5) step(5, pAt - 30 * 60e3, o.pickup_rider_id);
    if (reached >= 6) step(6, pAt + 5 * 60e3, o.pickup_rider_id);
  }

  return { now, tenant, profiles, guides, orders, order_events, invitations: [] };
}

// --- derived data (mirrors the SQL) --------------------------------------------

export function riderActivity(db) {
  const legs = [];
  for (const o of db.orders) {
    if (o.delivery_rider_id && ["delivery_assigned", "out_for_delivery"].includes(o.status)) {
      legs.push({ order: o, rider_id: o.delivery_rider_id, leg: "delivery", heading_to: o.delivery_address, scheduled_at: o.delivery_at });
    }
    if (o.pickup_rider_id && ["pickup_assigned", "out_for_pickup"].includes(o.status)) {
      legs.push({ order: o, rider_id: o.pickup_rider_id, leg: "pickup", heading_to: o.pickup_address, scheduled_at: o.pickup_at });
    }
  }
  return db.profiles
    .filter((p) => p.roles.includes("rider") && !p.disabled)
    .map((p) => {
      const mine = legs.filter((l) => l.rider_id === p.id);
      const moving = (l) => ["out_for_delivery", "out_for_pickup"].includes(l.order.status);
      mine.sort((a, b) => Number(moving(b)) - Number(moving(a)) || a.scheduled_at.localeCompare(b.scheduled_at));
      const cur = mine[0];
      return {
        rider_id: p.id,
        tenant_id: p.tenant_id,
        rider_name: p.full_name,
        active_orders: mine.length,
        is_busy: mine.length > 0,
        in_progress: cur ? moving(cur) : null,
        current_order_id: cur?.order.id ?? null,
        current_leg: cur?.leg ?? null,
        current_status: cur?.order.status ?? null,
        heading_to: cur?.heading_to ?? null,
        scheduled_at: cur?.scheduled_at ?? null,
        last_activity_at: mine.length ? mine.map((l) => l.order.updated_at).sort().at(-1) : null,
      };
    });
}

/** End of the period in which an order occupies its channel (mirrors private.channel_window). */
export function busyUntil(o) {
  const delivery = new Date(o.delivery_at);
  let end;
  if (o.pickup_at) end = new Date(o.pickup_at);
  else {
    const p = romeParts(delivery);
    end = rome(p.y, p.m, p.d + 1, 0, 0);
  }
  const min = new Date(delivery.getTime() + 60e3);
  return end < min ? min : end;
}

const isOpen = (o) => !["picked_up", "cancelled"].includes(o.status);

/** public.get_channel_board(from, to) */
export function channelBoard(db, from, to) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return db.orders
    .filter((o) => o.radio_channel !== null && isOpen(o))
    .filter((o) => new Date(o.delivery_at).getTime() < b && busyUntil(o).getTime() > a)
    .map((o) => ({
      channel: o.radio_channel,
      order_id: o.id,
      guide_name: o.guide_name,
      status: o.status,
      delivery_at: o.delivery_at,
      pickup_at: o.pickup_at,
      busy_until: busyUntil(o).toISOString(),
    }))
    .sort((x, y) => x.channel - y.channel || x.delivery_at.localeCompare(y.delivery_at));
}

export function dashboardInsights(db, monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const now = db.now;
  const tz = db.tenant;
  const monthStart = (yy, mm) => rome(yy, mm, 1);
  const addMonths = (n) => {
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return [t.getUTCFullYear(), t.getUTCMonth() + 1];
  };
  const start = monthStart(y, m);
  const end = monthStart(...addMonths(1));
  const pStart = monthStart(...addMonths(-1));
  // a month in progress is measured up to the end of today (see the SQL)
  const todayP0 = romeParts(db.now);
  const tomorrow = rome(todayP0.y, todayP0.m, todayP0.d + 1);
  const cut = new Date(Math.min(end.getTime(), Math.max(start.getTime(), tomorrow.getTime())));
  const prevCut = new Date(Math.min(start.getTime(), pStart.getTime() + (cut.getTime() - start.getTime())));
  const t = (iso) => new Date(iso).getTime();
  const MIN = 60e3;
  const DAY = 86400e3;
  const sum = (rows, f) => rows.reduce((acc, r) => acc + Number(r[f]), 0);
  const radiosOf = (o) => o.radios_count + o.extra_radios;
  const key = (o) => o.guide_id ?? o.guide_name.trim().toLowerCase();
  const group = (rows, keyFn) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  };
  const inRange = (o, a, b) => t(o.delivery_at) >= a.getTime() && t(o.delivery_at) < b.getTime();

  const all = db.orders;
  const nonCancelled = all.filter((o) => o.status !== "cancelled");
  const cur = all.filter((o) => inRange(o, start, cut));
  const live = cur.filter((o) => o.status !== "cancelled");
  const prevAll = all.filter((o) => inRange(o, pStart, prevCut));
  const prev = prevAll.filter((o) => o.status !== "cancelled");
  const pickups = nonCancelled.filter((o) => o.pickup_at && t(o.pickup_at) >= start.getTime() && t(o.pickup_at) < cut.getTime());

  const onTime = (o) => o.delivered_at && t(o.delivered_at) <= t(o.delivery_at) + 10 * MIN;
  const snapshot = (rows, allRows) => ({
    orders: rows.length,
    revenue: sum(rows, "balance"),
    radios: rows.reduce((acc, o) => acc + radiosOf(o), 0),
    lost: sum(rows, "lost_radios"),
    delivered: rows.filter((o) => o.delivered_at).length,
    on_time: rows.filter(onTime).length,
    cancelled: allRows.filter((o) => o.status === "cancelled").length,
    booked: allRows.length,
  });

  // trend: the selected month and the 11 before
  const trend = [];
  for (let n = 11; n >= 0; n--) {
    const [yy, mm] = addMonths(-n);
    const a = monthStart(yy, mm);
    const b = monthStart(...(mm === 12 ? [yy + 1, 1] : [yy, mm + 1]));
    const rows = nonCancelled.filter((o) => inRange(o, a, new Date(Math.min(b.getTime(), cut.getTime()))));
    trend.push({
      month: `${yy}-${pad(mm)}`,
      orders: rows.length,
      revenue: sum(rows, "balance"),
      radios: rows.reduce((acc, o) => acc + radiosOf(o), 0),
    });
  }

  // capacity: most groups / radios out in any hour of the day
  const spans = nonCancelled.map((o) => ({
    s: t(o.delivery_at),
    e: Math.max(
      o.picked_up_at ? t(o.picked_up_at) : o.pickup_at ? t(o.pickup_at) : t(o.delivery_at) + 6 * 3600e3,
      t(o.delivery_at) + MIN,
    ),
    radios: radiosOf(o),
    dDel: romeDay(new Date(o.delivery_at)),
    dPick: o.pickup_at ? romeDay(new Date(o.pickup_at)) : null,
  }));
  const concurrency = (from, days) => {
    const out = [];
    for (let i = 0; i < days; i++) {
      const dt = new Date(Date.UTC(from.y, from.m - 1, from.d + i));
      const [yy, mm, dd] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
      const day = `${yy}-${pad(mm)}-${pad(dd)}`;
      const dayStart = rome(yy, mm, dd).getTime();
      const near = spans.filter((sp) => sp.s < dayStart + 25 * 3600e3 && sp.e > dayStart);
      let groups = 0;
      let radios = 0;
      for (let h = 0; h < 24; h++) {
        const hs = rome(yy, mm, dd, h).getTime();
        let g = 0;
        let r = 0;
        for (const sp of near) {
          if (sp.s < hs + 3600e3 && sp.e > hs) {
            g += 1;
            r += sp.radios;
          }
        }
        groups = Math.max(groups, g);
        radios = Math.max(radios, r);
      }
      out.push({
        date: day,
        groups,
        radios,
        deliveries: spans.filter((sp) => sp.dDel === day).length,
        pickups: spans.filter((sp) => sp.dPick === day).length,
      });
    }
    return out;
  };
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayP = romeParts(now);

  // alerts
  const open = all.filter((o) => ["delivered", "awaiting_pickup", "pickup_assigned", "out_for_pickup"].includes(o.status));
  const overdue = open.filter((o) =>
    o.pickup_at ? t(o.pickup_at) < now.getTime() : t(o.delivery_at) < now.getTime() - DAY,
  );
  const in48h = now.getTime() + 48 * 3600e3;
  const in24h = now.getTime() + 24 * 3600e3;
  const alerts = {
    overdue_pickups: {
      orders: overdue.length,
      radios: overdue.reduce((acc, o) => acc + radiosOf(o), 0),
      oldest_days: overdue.length
        ? Math.max(...overdue.map((o) => Math.floor((now.getTime() - t(o.pickup_at ?? o.delivery_at)) / DAY)))
        : 0,
    },
    unassigned_deliveries: all.filter(
      (o) => o.status === "received" && !o.delivery_rider_id && t(o.delivery_at) >= now.getTime() && t(o.delivery_at) < in48h,
    ).length,
    unassigned_pickups: all.filter(
      (o) =>
        !o.pickup_rider_id &&
        o.pickup_at &&
        t(o.pickup_at) >= now.getTime() &&
        t(o.pickup_at) < in24h &&
        !["picked_up", "cancelled"].includes(o.status),
    ).length,
  };

  // stops by weekday and hour
  const stops = new Map();
  const bump = (iso) => {
    const p = romeParts(new Date(iso));
    const k = `${ISO_DOW[p.weekday]}|${p.h}`;
    stops.set(k, (stops.get(k) ?? 0) + 1);
  };
  live.forEach((o) => bump(o.delivery_at));
  pickups.forEach((o) => bump(o.pickup_at));

  // guides
  const firstAt = new Map();
  for (const o of nonCancelled) {
    const k = key(o);
    if (!firstAt.has(k) || t(o.delivery_at) < firstAt.get(k)) firstAt.set(k, t(o.delivery_at));
  }
  const liveByGuide = group(live, key);
  const guidesTop = [...liveByGuide.values()]
    .map((rows) => ({
      name: rows[0].guide_name,
      orders: rows.length,
      revenue: sum(rows, "balance"),
      radios: rows.reduce((acc, o) => acc + radiosOf(o), 0),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
    .slice(0, 8);
  const newKeys = [...liveByGuide.keys()].filter((k) => firstAt.get(k) >= start.getTime());
  const life = [...group(nonCancelled, key).values()].map((rows) => {
    const past = rows.filter((o) => t(o.delivery_at) < now.getTime());
    const lastAt = past.length ? Math.max(...past.map((o) => t(o.delivery_at))) : null;
    return {
      name: rows[0].guide_name,
      orders: rows.length,
      revenue: sum(rows, "balance"),
      lastAt,
      hasFuture: rows.some((o) => t(o.delivery_at) >= now.getTime()),
    };
  });
  const dayNum = (isoDay) => Date.UTC(+isoDay.slice(0, 4), +isoDay.slice(5, 7) - 1, +isoDay.slice(8, 10)) / DAY;
  const winBack = life
    .filter(
      (g) =>
        g.orders >= 2 && !g.hasFuture && g.lastAt !== null && g.lastAt < now.getTime() - 45 * DAY && g.lastAt >= now.getTime() - 540 * DAY,
    )
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((g) => ({
      name: g.name,
      orders: g.orders,
      revenue: g.revenue,
      last_order: romeDay(new Date(g.lastAt)),
      days_since: dayNum(romeDay(now)) - dayNum(romeDay(new Date(g.lastAt))),
    }));
  const losses = [...liveByGuide.values()]
    .map((rows) => ({ name: rows[0].guide_name, lost: sum(rows, "lost_radios"), radios: rows.reduce((acc, o) => acc + radiosOf(o), 0) }))
    .filter((g) => g.lost > 0)
    .sort((a, b) => b.lost - a.lost || b.radios - a.radios || (a.name < b.name ? -1 : 1))
    .slice(0, 5);

  // operations
  const lead = live.map((o) => Math.max(0, t(o.delivery_at) - t(o.created_at)));
  const lead_time = {
    same_day: lead.filter((l) => l < DAY).length,
    days_1_2: lead.filter((l) => l >= DAY && l < 3 * DAY).length,
    days_3_7: lead.filter((l) => l >= 3 * DAY && l < 8 * DAY).length,
    days_8_30: lead.filter((l) => l >= 8 * DAY && l < 31 * DAY).length,
    over_30: lead.filter((l) => l >= 31 * DAY).length,
  };
  const sources = [...group(cur, (o) => o.source)]
    .map(([source, rows]) => {
      const ok = rows.filter((o) => o.status !== "cancelled");
      return { source, orders: ok.length, revenue: sum(ok, "balance"), cancelled: rows.length - ok.length };
    })
    .sort((a, b) => b.orders - a.orders);
  const withPickup = live.filter((o) => o.picked_up_at ?? o.pickup_at);
  const avg_days_out = withPickup.length
    ? Math.round(
        (withPickup.reduce((acc, o) => acc + (t(o.picked_up_at ?? o.pickup_at) - t(o.delivery_at)) / DAY, 0) / withPickup.length) * 10,
      ) / 10
    : null;
  const riders = db.profiles
    .map((p) => {
      const rows = nonCancelled.filter(
        (o) =>
          (o.delivery_rider_id === p.id || o.pickup_rider_id === p.id) &&
          (inRange(o, start, cut) || (o.pickup_at && t(o.pickup_at) >= start.getTime() && t(o.pickup_at) < cut.getTime())),
      );
      const deliveries = rows.filter((o) => o.delivery_rider_id === p.id);
      const pickupLegs = rows.filter(
        (o) => o.pickup_rider_id === p.id && o.pickup_at && t(o.pickup_at) >= start.getTime() && t(o.pickup_at) < cut.getTime(),
      );
      return {
        name: p.full_name,
        stops: deliveries.length + pickupLegs.length,
        deliveries: deliveries.length,
        delivered: deliveries.filter((o) => o.delivered_at).length,
        on_time: deliveries.filter(onTime).length,
        any: rows.length,
      };
    })
    .filter((r) => r.any > 0)
    .sort((a, b) => b.stops - a.stops)
    .slice(0, 10)
    .map(({ any, ...r }) => r);

  const locations = [...group(live, (o) => o.delivery_address.trim().toLowerCase()).values()]
    .map((rows) => ({
      location: rows[0].delivery_address,
      orders: rows.length,
      revenue: sum(rows, "balance"),
      radios: rows.reduce((acc, o) => acc + radiosOf(o), 0),
    }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
    .slice(0, 8);

  const ahead = nonCancelled.filter((o) => inRange(o, cut, end));
  return {
    month: monthStr,
    timezone: db.tenant.timezone,
    in_progress: cut.getTime() < end.getTime(),
    through: romeDay(new Date(cut.getTime() - 1000)),
    booked_ahead: {
      orders: ahead.length,
      revenue: sum(ahead, "balance"),
      radios: ahead.reduce((acc, o) => acc + radiosOf(o), 0),
    },
    current: snapshot(live, cur),
    previous: snapshot(prev, prevAll),
    trend,
    capacity: {
      channels: Math.max(0, tz.channel_max - tz.channel_min + 1 - tz.disabled_channels.length),
      exclusive: tz.channels_exclusive,
      days: concurrency({ y, m, d: 1 }, daysInMonth),
      upcoming: concurrency(todayP, 14),
    },
    alerts,
    stops: [...stops]
      .map(([k, count]) => {
        const [weekday, hour] = k.split("|").map(Number);
        return { weekday, hour, count };
      })
      .sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
    guides: {
      top: guidesTop,
      active: liveByGuide.size,
      new: newKeys.length,
      new_revenue: newKeys.reduce((acc, k) => acc + sum(liveByGuide.get(k), "balance"), 0),
      win_back: winBack,
      losses,
    },
    operations: { lead_time, sources, avg_days_out, riders },
    locations,
  };
}
