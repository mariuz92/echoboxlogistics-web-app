import { describe, expect, it } from "vitest";
import { getErrorMessage, isAuthError } from "./errors";

describe("getErrorMessage", () => {
  it("translates machine codes raised by the database", () => {
    expect(getErrorMessage({ message: "company_exists" })).toMatch(/esiste già/i);
    expect(getErrorMessage({ message: "pickup_details_missing" })).toMatch(/ritiro/i);
    expect(getErrorMessage({ message: "last_admin" })).toMatch(/amministratore/i);
  });

  it("explains radio channel conflicts and settings errors", () => {
    expect(getErrorMessage({ code: "23P01", message: "channel_busy" })).toMatch(/stessi orari/i);
    expect(getErrorMessage({ code: "23514", message: "channel_disabled" })).toMatch(/disabilitato/i);
    expect(getErrorMessage({ code: "23514", message: "channel_used_by_open_order" })).toMatch(/ordine aperto/i);
    expect(
      getErrorMessage({ code: "23514", message: 'new row for relation "tenants" violates check constraint "tenants_channel_range"' }),
    ).toMatch(/10\.000 canali/);
  });

  it("maps Supabase Auth error codes", () => {
    expect(getErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
      "Email o password non corretti.",
    );
  });

  it("maps permission errors", () => {
    expect(getErrorMessage({ code: "42501", message: "permission denied" })).toMatch(/permessi/i);
  });

  it("reports network failures", () => {
    expect(getErrorMessage(new TypeError("Failed to fetch"))).toMatch(/connessione/i);
  });

  it("falls back to a generic message and never leaks raw SQL errors", () => {
    expect(getErrorMessage({ message: "syntax error at or near SELECT" }, "Errore")).toBe("Errore");
    expect(getErrorMessage(null, "Errore")).toBe("Errore");
  });
});

describe("isAuthError", () => {
  it("detects expired sessions", () => {
    expect(isAuthError({ status: 401 })).toBe(true);
    expect(isAuthError({ code: "PGRST301" })).toBe(true);
    expect(isAuthError({ status: 500 })).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });
});
