/**
 * Maps backend errors (Postgres / PostgREST / Supabase Auth / Edge Functions)
 * to messages for the user. The database raises short machine-readable codes
 * (see supabase/migrations/*_rpcs.sql); everything else falls back to a
 * generic message.
 */

const MESSAGES: Record<string, string> = {
  // Radio channels (raised by private.orders_guard / private.tenants_channel_guard)
  channel_busy: "Questo canale è già usato da un altro gruppo negli stessi orari. Scegline un altro.",
  channel_out_of_range: "Questo canale non esiste: è fuori dall'intervallo configurato.",
  channel_disabled: "Questo canale è disabilitato.",
  channel_used_by_open_order:
    "Un ordine aperto usa uno dei canali che vuoi togliere o disabilitare. Cambia prima il canale di quell'ordine.",
  channel_conflicts_exist:
    "Alcuni ordini aperti condividono lo stesso canale negli stessi orari: separali prima di rendere i canali esclusivi.",
  // Onboarding / auth
  company_exists:
    "Esiste già un'azienda con questo nome. Chiedi a un amministratore di invitarti.",
  company_suspended: "L’azienda è sospesa. Contatta il supporto EchoBox.",
  write_not_applied: "L’operazione non è consentita o il record non è più disponibile.",
  company_access_restricted: "Questa operazione non è disponibile con l’accesso attuale dell’azienda.",
  invitation_required: "Per accedere a un’azienda è necessario un invito.",
  invitation_unavailable: "L’invito non è valido o è scaduto.",
  invitation_password_required: "Completa la scelta della password prima di accettare l’invito.",
  transfer_company_owner_first: "Trasferisci prima la proprietà dell’azienda.",
  no_company:
    "Il tuo account non è collegato a nessuna azienda. Registra la tua azienda o chiedi un invito.",
  email_not_confirmed: "Conferma prima il tuo indirizzo email.",
  not_authenticated: "Sessione scaduta. Accedi di nuovo.",
  already_registered: "Questa email è già registrata.",
  invalid_email: "Indirizzo email non valido.",
  invalid_roles: "Seleziona almeno un ruolo valido.",
  email_failed: "Non è stato possibile inviare l'email di invito.",
  invitation_failed: "Non è stato possibile creare l'invito.",

  // Members
  last_admin: "Deve rimanere almeno un amministratore attivo.",
  rider_has_active_orders:
    "Il rider ha ordini in corso. Riassegnali prima di disattivarlo.",
  member_not_found: "Utente non trovato.",

  // Orders
  order_not_found: "Ordine non trovato.",
  order_cancelled: "L'ordine è annullato.",
  rider_invalid: "Il rider selezionato non è valido o è disattivato.",
  delivery_not_reassignable:
    "La consegna è già in corso o completata: non si può riassegnare.",
  pickup_not_assignable:
    "Il ritiro si può assegnare solo dopo la consegna.",
  pickup_details_missing:
    "Imposta data/ora e luogo di ritiro prima di assegnare il ritiro.",
  transition_not_allowed: "Questa azione non è consentita nello stato attuale.",
  use_assign_order: "Per questo stato assegna un rider.",
  order_not_claimable: "Questo ritiro non è più disponibile.",
  invalid_lost_count: "Il numero di radioline perse non è valido.",
  unknown_action: "Azione non riconosciuta.",

  // Public booking
  booking_unavailable: "Le prenotazioni online non sono disponibili al momento.",
  invalid_guide_name: "Inserisci un nome valido (almeno 2 caratteri).",
  invalid_phone: "Inserisci un numero di telefono valido.",
  invalid_radios_count: "Il numero di radioguide deve essere tra 1 e 500.",
  invalid_delivery_time: "La data di consegna non è valida.",
  invalid_pickup_time: "Il ritiro non può essere prima della consegna.",
  invalid_address: "Inserisci un indirizzo valido.",
  too_many_requests: "Troppe richieste ravvicinate. Riprova tra qualche minuto.",
};

// Supabase Auth error codes (error.code) / messages
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o password non corretti.",
  email_not_confirmed: "Conferma prima il tuo indirizzo email.",
  user_already_exists: "Questa email è già registrata.",
  email_exists: "Questa email è già registrata.",
  weak_password: "La password è troppo debole.",
  over_email_send_rate_limit:
    "Troppe email inviate. Riprova tra qualche minuto.",
  over_request_rate_limit: "Troppi tentativi. Riprova tra qualche minuto.",
  same_password: "La nuova password deve essere diversa da quella attuale.",
  user_banned: "Il tuo account è stato disabilitato. Contatta il supporto.",
  signup_disabled: "Le registrazioni sono temporaneamente disabilitate.",
  validation_failed: "I dati inseriti non sono validi.",
};

const SQLSTATE_MESSAGES: Record<string, string> = {
  "42501": "Non hai i permessi per eseguire questa operazione.",
  "23505": "Esiste già un elemento con questi dati.",
  "23514": "I dati inseriti non sono validi.",
  "23503": "L'elemento è collegato ad altri dati e non può essere modificato.",
  PGRST301: "Sessione scaduta. Accedi di nuovo.",
  PGRST303: "Sessione scaduta. Accedi di nuovo.",
};

interface ErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  context?: unknown;
}

/** True when the error means "your session is no longer valid". */
export function isAuthError(error: unknown): boolean {
  const e = error as ErrorLike | null;
  return Boolean(
    e && (e.status === 401 || e.code === "PGRST301" || e.code === "PGRST303"),
  );
}

export function getErrorMessage(
  error: unknown,
  fallback = "Si è verificato un errore. Riprova.",
): string {
  if (!error) return fallback;
  if (typeof error === "string") return MESSAGES[error] ?? error;

  const e = error as ErrorLike;
  const message = (e.message ?? "").trim();

  // 1) machine code raised by our SQL functions / Edge Functions
  if (message && MESSAGES[message]) return MESSAGES[message];

  // 2) Supabase Auth
  if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code];

  // 3) Constraint violations with a precise message
  if (e.code === "23514" && /tenants_channel_range/.test(message)) {
    return "Intervallo di canali non valido: al massimo 10.000 canali, numerati da 0 in su.";
  }
  if (e.code === "23514" && /orders_pickup_after_delivery/.test(message)) {
    return "Il ritiro non può essere prima della consegna.";
  }

  // 4) Generic SQLSTATE
  if (e.code && SQLSTATE_MESSAGES[e.code]) return SQLSTATE_MESSAGES[e.code];

  // 5) Network
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Impossibile contattare il server. Controlla la connessione.";
  }

  return fallback;
}
