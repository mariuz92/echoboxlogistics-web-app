import { fmtDateTime } from "../../lib/dates";
import { ORDER_STATUS_META, type Order } from "../../types/domain";

/** Exports the given orders as a landscape PDF. jsPDF is loaded on demand (it is large). */
export async function exportOrdersPdf(orders: Order[], timezone: string, title: string) {
  const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new JsPdf({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(`Ordini · ${title}`, 14, 14);

  autoTable(doc, {
    startY: 20,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [29, 95, 168] },
    head: [
      [
        "Guida",
        "Telefono",
        "Stato",
        "Consegna",
        "Luogo consegna",
        "Rider consegna",
        "Ritiro",
        "Luogo ritiro",
        "Rider ritiro",
        "Radio",
        "Canale",
      ],
    ],
    body: orders.map((o) => [
      o.guide_name,
      o.guide_phone ?? "",
      ORDER_STATUS_META[o.status].label,
      fmtDateTime(o.delivery_at, timezone),
      o.delivery_address,
      o.delivery_rider?.full_name ?? "",
      o.pickup_at ? fmtDateTime(o.pickup_at, timezone) : "",
      o.pickup_address ?? "",
      o.pickup_rider?.full_name ?? "",
      String(o.radios_count + o.extra_radios),
      o.radio_channel === null ? "" : String(o.radio_channel),
    ]),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`ordini_${stamp}.pdf`);
}
