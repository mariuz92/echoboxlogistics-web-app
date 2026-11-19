// Demo data for the landing-page screenshots.
//
// A fictional Rome tour-equipment company with riders, guides and ~2 months of
// orders around a fixed "now". Rows follow the real table shapes
// (src/types/database.types.ts) and the derived views/RPCs are computed the same
// way the SQL does it (rider_activity, get_channel_status, get_dashboard_stats).
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

export function buildDemo(now) {
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
    radio_channels_total: 30,
    disabled_channels: [13],
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
    const createdAt = new Date(delivery_at.getTime() - between(2, 20) * 86400e3 - between(0, 600) * 60e3);
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
      row.delivered_at = iso(new Date(delivery_at.getTime() - between(2, 12) * 60e3));
    }
    if (row.status === "picked_up") {
      row.picked_up_at = iso(new Date((pickup_at ?? delivery_at).getTime() + between(0, 25) * 60e3));
    }
    if (row.source === "public_form") row.created_by = null;
    orders.push(row);
    return row;
  }

  // --- history: last 6 weeks, almost everything closed --------------------------
  const usedPlaces = places.slice(0, 15);
  for (let off = -110; off <= -1; off++) {
    const date = dayAt(off, 12, 0);
    const dow = ISO_DOW[romeParts(date).weekday];
    // Autumn: the further back, the busier (September > October > November).
    const season = 1 + -off / 160;
    const n = Math.round((dow >= 6 ? between(11, 17) : between(7, 13)) * season);
    for (let i = 0; i < n; i++) {
      const h = between(7, 15);
      const delivery = dayAt(off, h, pick([0, 15, 30, 45]));
      const cancelled = rnd() < 0.04;
      const rider = pick(riders);
      add({
        delivery,
        where: pick(usedPlaces),
        status: cancelled ? "cancelled" : "picked_up",
        channel: between(0, 30) === 13 ? 12 : between(0, 30),
        deliveryRider: cancelled ? null : rider,
        pickupRider: cancelled ? null : rnd() < 0.6 ? rider : pick(riders),
        lost: !cancelled && rnd() < 0.05 ? 1 : 0,
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
    pickup: T(17, 30), status: "received", channel: 20, source: "public_form", notes: null });
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
    for (let c = 0; c <= tenant.radio_channels_total; c++) {
      if (c === 0 || busy.has(c) || tenant.disabled_channels.includes(c)) continue;
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

export function channelStatus(db) {
  const rows = [];
  for (let c = 0; c <= db.tenant.radio_channels_total; c++) {
    const o = db.orders.find((x) => x.radio_channel === c && !["picked_up", "cancelled"].includes(x.status));
    rows.push({
      channel: c,
      state: db.tenant.disabled_channels.includes(c) ? "disabled" : o ? "busy" : "free",
      order_id: o?.id ?? null,
      guide_name: o?.guide_name ?? null,
      delivery_at: o?.delivery_at ?? null,
      status: o?.status ?? null,
    });
  }
  return rows;
}

export function dashboardStats(db, monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = rome(y, m, 1);
  const end = rome(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1);
  const pStart = rome(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, 1);
  const inRange = (o, a, b) => new Date(o.delivery_at) >= a && new Date(o.delivery_at) < b;
  const cur = db.orders.filter((o) => inRange(o, start, end));
  const live = cur.filter((o) => o.status !== "cancelled");
  const prev = db.orders.filter((o) => inRange(o, pStart, start) && o.status !== "cancelled");
  const pickups = db.orders.filter(
    (o) => o.pickup_at && new Date(o.pickup_at) >= start && new Date(o.pickup_at) < end && o.status !== "cancelled",
  );
  const sum = (rows, f) => rows.reduce((s, r) => s + Number(r[f]), 0);
  const hour = (iso) => romeParts(new Date(iso)).h;
  const groupCount = (rows, keyFn) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      const e = map.get(k) ?? { rows: [] };
      e.rows.push(r);
      map.set(k, e);
    }
    return map;
  };

  const status = [...groupCount(cur, (o) => o.status)].map(([status, e]) => ({ status, count: e.rows.length }));
  status.sort((a, b) => b.count - a.count);

  const daily = new Map();
  for (const o of live) {
    const d = romeDay(new Date(o.delivery_at));
    const e = daily.get(d) ?? { date: d, deliveries: 0, pickups: 0, revenue: 0 };
    e.deliveries += 1;
    e.revenue += Number(o.balance);
    daily.set(d, e);
  }
  for (const o of pickups) {
    const d = romeDay(new Date(o.pickup_at));
    const e = daily.get(d) ?? { date: d, deliveries: 0, pickups: 0, revenue: 0 };
    e.pickups += 1;
    daily.set(d, e);
  }

  const weekStart = (iso) => {
    const p = romeParts(new Date(iso));
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d - (ISO_DOW[p.weekday] - 1)));
    return dt.toISOString().slice(0, 10);
  };
  const weekly = [...groupCount(live, (o) => weekStart(o.delivery_at))]
    .map(([week_start, e]) => ({ week_start, orders: e.rows.length, revenue: sum(e.rows, "balance") }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start));

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    deliveries: live.filter((o) => hour(o.delivery_at) === h).length,
    pickups: pickups.filter((o) => hour(o.pickup_at) === h).length,
  }));

  const heatmap = [...groupCount(live, (o) => `${ISO_DOW[romeParts(new Date(o.delivery_at)).weekday]}|${hour(o.delivery_at)}`)].map(
    ([k, e]) => {
      const [weekday, h] = k.split("|").map(Number);
      return { weekday, hour: h, count: e.rows.length };
    },
  );

  const top_guides = [...groupCount(live, (o) => o.guide_name.toLowerCase())]
    .map(([, e]) => ({
      name: e.rows[0].guide_name,
      orders: e.rows.length,
      revenue: sum(e.rows, "balance"),
      radios: sum(e.rows, "radios_count"),
    }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
    .slice(0, 10);

  const channels = [...groupCount(live.filter((o) => o.radio_channel !== null), (o) => o.radio_channel)]
    .map(([channel, e]) => ({ channel, orders: e.rows.length }))
    .sort((a, b) => a.channel - b.channel);

  const top_locations = [...groupCount(live, (o) => o.delivery_address)]
    .map(([location, e]) => ({ location, orders: e.rows.length }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  return {
    month: monthStr,
    timezone: db.tenant.timezone,
    current: {
      orders: live.length,
      revenue: sum(live, "balance"),
      radios: sum(live, "radios_count"),
      extras: sum(live, "extra_radios"),
      lost: sum(live, "lost_radios"),
      avg_order_value: live.length ? Math.round((sum(live, "balance") / live.length) * 100) / 100 : 0,
      cancelled: cur.filter((o) => o.status === "cancelled").length,
    },
    previous: { orders: prev.length, revenue: sum(prev, "balance") },
    status_distribution: status,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    weekly,
    hourly,
    heatmap,
    top_guides,
    channels,
    top_locations,
  };
}
