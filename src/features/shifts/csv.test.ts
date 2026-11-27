import { describe, expect, it } from "vitest";
import { buildHoursCsv, csvCell } from "./csv";
import type { RiderHours } from "./api";

const labels = {
  rider: "Rider", day: "Giorno", from: "Dalle", to: "Alle", hours: "Ore", plannedHours: "Ore previste",
  changed: "Modificato", note: "Nota", total: "Totale", yes: "sì",
};

describe("csvCell", () => {
  it("quotes texts with separators, quotes and new lines", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('di "Mario"')).toBe('"di ""Mario"""');
    expect(csvCell("uno\ndue")).toBe('"uno\ndue"');
    expect(csvCell("semplice")).toBe("semplice");
  });
  it("defuses formulas", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+39 333")).toBe("'+39 333");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
  it("leaves numbers alone", () => {
    expect(csvCell(-5)).toBe("-5");
  });
});

describe("buildHoursCsv", () => {
  const rider: RiderHours = {
    rider_id: "r1", name: "Anna Rossi", paid_minutes: 300, planned_minutes: 240, shifts: 1, adjusted: 1,
    items: [{
      shift_id: "s1", day: "2026-11-25",
      start_at: "2026-11-25T08:00:00Z", end_at: "2026-11-25T13:00:00Z",
      planned_start_at: "2026-11-25T08:00:00Z", planned_end_at: "2026-11-25T12:00:00Z",
      note: "extra; evento",
    }],
  };
  it("writes a header, a line per shift and a total per rider", () => {
    const lines = buildHoursCsv([rider], "Europe/Rome", labels).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Rider;Giorno;Dalle;Alle;Ore;Ore previste;Modificato;Nota");
    expect(lines[1]).toBe('Anna Rossi;2026-11-25;09:00;14:00;5;4;sì;"extra; evento"');
    expect(lines[2]).toBe("Totale Anna Rossi;;;;5;4;;");
  });
});
