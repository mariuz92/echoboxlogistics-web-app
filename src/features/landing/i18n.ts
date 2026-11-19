/**
 * Texts of the marketing site in Italian, English, German and French.
 *
 * Italian is the reference: the other languages must have exactly the same shape
 * (TypeScript enforces it). The app itself is in Italian; only the landing page is
 * translated.
 */

export const LANGS = ["it", "en", "de", "fr"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = {
  it: "Italiano",
  en: "English",
  de: "Deutsch",
  fr: "Français",
};

export type ScreenId =
  | "web-orders"
  | "web-order-detail"
  | "web-channels"
  | "web-dashboard"
  | "web-calendar"
  | "web-team"
  | "mobile-rider"
  | "mobile-orders"
  | "mobile-booking";

interface Item {
  title: string;
  text: string;
}

export interface Dict {
  meta: { title: string; description: string };
  nav: { features: string; screens: string; how: string; faq: string; contact: string; login: string; demo: string; menu: string };
  hero: {
    eyebrow: string;
    title: string;
    accent: string;
    subtitle: string;
    primary: string;
    secondary: string;
    points: string[];
    liveBadge: string;
  };
  audience: { label: string; items: string[] };
  problems: { label: string; title: string; subtitle: string; before: string; after: string; items: { problem: string; solution: string }[] };
  features: { label: string; title: string; subtitle: string; items: Item[] };
  screens: { label: string; title: string; subtitle: string; web: string; mobile: string; enlarge: string; close: string; note: string; items: Record<ScreenId, Item> };
  how: { label: string; title: string; steps: Item[] };
  roles: { label: string; title: string; items: { role: string; title: string; points: string[] }[] };
  faq: { label: string; title: string; items: { q: string; a: string }[] };
  contact: {
    label: string;
    title: string;
    subtitle: string;
    perks: string[];
    name: string;
    email: string;
    company: string;
    phone: string;
    optional: string;
    message: string;
    messagePlaceholder: string;
    consentBefore: string;
    consentLink: string;
    consentAfter: string;
    submit: string;
    sending: string;
    successTitle: string;
    successText: string;
    again: string;
    direct: string;
    errors: { name: string; email: string; message: string; consent: string; rate: string; generic: string };
  };
  footer: { tagline: string; product: string; legal: string; privacy: string; terms: string; cookies: string; rights: string; language: string; login: string };
}

const it: Dict = {
  meta: {
    title: "EchoBox Logistics — Gestionale per il noleggio di radioguide",
    description:
      "Ordini, canali radio, consegne e ritiri delle radioguide in un unico posto. Per chi noleggia sistemi audio a guide e gruppi turistici.",
  },
  nav: { features: "Funzioni", screens: "Il prodotto", how: "Come funziona", faq: "FAQ", contact: "Contatti", login: "Accedi", demo: "Richiedi una demo", menu: "Menu" },
  hero: {
    eyebrow: "Per chi noleggia radioguide a guide e gruppi",
    title: "Radioguide consegnate in orario.",
    accent: "Nessun canale doppio. Nessun ritiro dimenticato.",
    subtitle:
      "EchoBox Logistics organizza tutto il servizio: le prenotazioni delle guide, l'assegnazione dei canali radio, i rider che consegnano e ritirano, e i numeri di fine mese.",
    primary: "Richiedi una demo",
    secondary: "Guarda il prodotto",
    points: ["Funziona nel browser, anche sul telefono", "Aggiornamenti in tempo reale", "Dati separati per ogni azienda"],
    liveBadge: "In tempo reale",
  },
  audience: {
    label: "Pensato per",
    items: ["Noleggio radioguide e whisper", "Tour operator e agenzie", "Escursioni da crociera", "Gruppi scolastici e congressi"],
  },
  problems: {
    label: "Perché",
    title: "Dalla chat di gruppo a un unico posto",
    subtitle: "Fogli Excel, messaggi e telefonate funzionano finché la giornata è tranquilla. Poi arriva l'alta stagione.",
    before: "Prima",
    after: "Con EchoBox",
    items: [
      {
        problem: "Due gruppi sullo stesso canale: le guide si sovrappongono e il tour è rovinato.",
        solution: "Ogni ordine aperto occupa il suo canale. Il sistema impedisce i doppioni e libera il canale al ritiro.",
      },
      {
        problem: "Radioguide consegnate e mai ritirate. Te ne accorgi giorni dopo, quando mancano.",
        solution: "I ritiri restano in evidenza finché non sono chiusi; quelli in ritardo o senza data vengono segnalati.",
      },
      {
        problem: "«Dov'è il rider?», «A chi le ho date?»: telefonate continue per sapere a che punto siamo.",
        solution: "Ogni rider aggiorna lo stato dal telefono con un tocco: l'ufficio vede tutto mentre succede.",
      },
    ],
  },
  features: {
    label: "Funzioni",
    title: "Tutto il servizio, dall'ordine al rientro delle radio",
    subtitle: "Pensato per chi consegna radioguide ogni giorno nei centri storici, non un gestionale generico adattato.",
    items: [
      { title: "Ordini e giornata", text: "Vista per giorno, settimana, mese o anno, con ricerca, filtri per stato ed esportazione PDF." },
      { title: "Mappa dei canali radio", text: "Canali liberi, occupati e disabilitati a colpo d'occhio. Un canale non può essere assegnato due volte." },
      { title: "App per i rider", text: "I rider vedono solo i propri lavori e avanzano consegna e ritiro con un tocco, anche sotto il sole di agosto." },
      { title: "Ritiri sotto controllo", text: "Ritiri da pianificare, in ritardo o da assegnare: in cima alla pagina finché qualcuno non li chiude." },
      { title: "Prenotazione per le guide", text: "Un link pubblico con il nome della tua azienda: le guide prenotano da sole e l'ordine arriva già compilato." },
      { title: "Dashboard e statistiche", text: "Incassi, radioguide consegnate e perse, orari di punta, guide e luoghi più frequenti, mese su mese." },
      { title: "Team e ruoli", text: "Inviti via email, ruoli amministratore e rider, e chi è in servizio adesso e dove sta andando." },
      { title: "Cronologia di ogni ordine", text: "Chi ha creato, assegnato, consegnato o modificato cosa, e quando. Utile quando qualcosa non torna." },
    ],
  },
  screens: {
    label: "Il prodotto",
    title: "Guarda come si lavora con EchoBox",
    subtitle: "Schermate reali dell'applicazione, con dati di esempio di una giornata a Roma.",
    web: "Ufficio (web)",
    mobile: "Rider e guide (mobile)",
    enlarge: "Ingrandisci",
    close: "Chiudi",
    note: "Dati dimostrativi: nomi, numeri e indirizzi sono di fantasia.",
    items: {
      "web-orders": { title: "La giornata in un colpo d'occhio", text: "Consegne e ritiri del giorno, con stato, rider assegnati, incasso e ritiri da sistemare." },
      "web-order-detail": { title: "Ogni ordine, con la sua storia", text: "Guida, canale, radioguide, orari e luoghi, più la cronologia completa di ogni cambiamento." },
      "web-channels": { title: "Mappa dei canali radio", text: "Liberi, in uso e disabilitati. Un clic per escludere un canale guasto." },
      "web-dashboard": { title: "I numeri del mese", text: "Incassi e ordini rispetto al mese precedente, andamento giornaliero, perdite e orari di punta." },
      "web-calendar": { title: "Calendario", text: "Consegne e ritiri di ogni giorno del mese. Un clic sul giorno apre i suoi ordini." },
      "web-team": { title: "Team e rider in servizio", text: "Chi sta consegnando, chi sta ritirando e dove, con gli inviti e i ruoli del team." },
      "mobile-rider": { title: "L'app del rider", text: "Solo i lavori assegnati, con indirizzo, telefono della guida e un grande pulsante per avanzare." },
      "mobile-orders": { title: "L'ufficio in tasca", text: "Tutta la gestione ordini funziona anche dal telefono, quando non sei alla scrivania." },
      "mobile-booking": { title: "Il modulo per le guide", text: "Le guide prenotano dal tuo link pubblico: l'ordine compare subito nell'elenco." },
    },
  },
  how: {
    label: "Come funziona",
    title: "Quattro passaggi, ogni giorno",
    steps: [
      { title: "Arriva l'ordine", text: "Lo inserisci tu o la guida lo prenota dal tuo link pubblico: radioguide, orari e luoghi di consegna e ritiro." },
      { title: "Canale e rider", text: "Scegli un canale libero e assegni consegna e ritiro ai rider. I conflitti sono impossibili." },
      { title: "Consegna e ritiro", text: "Il rider parte, consegna e ritira aggiornando lo stato dal telefono. Segnala anche le radio perse." },
      { title: "Tutto tracciato", text: "Canale liberato, incasso registrato, statistiche aggiornate. Il giorno dopo si riparte da una lista pulita." },
    ],
  },
  roles: {
    label: "Per tutto il team",
    title: "Una piattaforma, tre punti di vista",
    items: [
      { role: "Ufficio", title: "Pianifica e controlla", points: ["Ordini, canali e assegnazioni", "Ritiri in ritardo in evidenza", "Statistiche ed esportazioni"] },
      { role: "Rider", title: "Sa sempre cosa fare", points: ["Solo i propri lavori", "Indirizzi e telefono della guida", "Un tocco per ogni passaggio"] },
      { role: "Guide", title: "Prenotano in un minuto", points: ["Link pubblico della tua azienda", "Nessun account da creare", "Conferma immediata"] },
    ],
  },
  faq: {
    label: "FAQ",
    title: "Domande frequenti",
    items: [
      { q: "Devo installare qualcosa?", a: "No. EchoBox funziona nel browser, su computer, tablet e telefono. I rider la aprono dal telefono come una normale pagina web." },
      { q: "Quanti canali radio posso gestire?", a: "Quanti ne hai: imposti il numero totale e puoi disabilitare i canali guasti o riservati. Ogni canale può essere usato da un solo ordine aperto alla volta." },
      { q: "Le guide devono registrarsi?", a: "No. Condividi il link di prenotazione della tua azienda: la guida inserisce nome, telefono, radioguide e orari, e l'ordine arriva subito a te." },
      { q: "I miei dati sono separati da quelli di altre aziende?", a: "Sì. Ogni azienda vede solo i propri ordini, rider e guide. Le regole di accesso sono applicate direttamente nel database." },
      { q: "In che lingua è l'applicazione?", a: "L'interfaccia di lavoro è in italiano; questo sito è disponibile anche in inglese, tedesco e francese. Se il tuo team lavora in un'altra lingua, scrivici." },
      { q: "Quanto costa?", a: "Dipende dal numero di rider e di ordini. Scrivici due righe sul tuo servizio e ti prepariamo una proposta." },
    ],
  },
  contact: {
    label: "Contatti",
    title: "Parliamo del tuo servizio",
    subtitle: "Raccontaci quante radioguide gestisci e come lavori oggi. Ti rispondiamo il prima possibile.",
    perks: ["Demo dal vivo sui tuoi casi reali", "Configurazione di canali e rider insieme a te", "Nessun impegno"],
    name: "Nome e cognome",
    email: "Email",
    company: "Azienda",
    phone: "Telefono",
    optional: "facoltativo",
    message: "Messaggio",
    messagePlaceholder: "Es. noleggiamo 400 radioguide a Roma con 4 rider e vorremmo smettere di usare la chat di gruppo…",
    consentBefore: "Ho letto l'",
    consentLink: "informativa sulla privacy",
    consentAfter: " e acconsento a essere ricontattato.",
    submit: "Invia messaggio",
    sending: "Invio in corso…",
    successTitle: "Messaggio inviato, grazie!",
    successText: "Ti risponderemo all'indirizzo email che ci hai lasciato.",
    again: "Invia un altro messaggio",
    direct: "Preferisci l'email?",
    errors: {
      name: "Inserisci il tuo nome.",
      email: "Inserisci un indirizzo email valido.",
      message: "Scrivi almeno qualche parola (10 caratteri).",
      consent: "Serve il consenso per poterti rispondere.",
      rate: "Hai inviato molti messaggi in poco tempo. Riprova tra un'ora o scrivici via email.",
      generic: "Non siamo riusciti a inviare il messaggio. Riprova o scrivici via email.",
    },
  },
  footer: {
    tagline: "Il gestionale per chi noleggia radioguide a guide e gruppi turistici.",
    product: "Prodotto",
    legal: "Note legali",
    privacy: "Privacy",
    terms: "Termini e condizioni",
    cookies: "Cookie",
    rights: "Tutti i diritti riservati.",
    language: "Lingua",
    login: "Accedi alla piattaforma",
  },
};

const en: Dict = {
  meta: {
    title: "EchoBox Logistics — Software for audio-guide rental companies",
    description:
      "Orders, radio channels, deliveries and pickups of tour-guide radio sets in one place. Built for companies that rent audio systems to guides and tour groups.",
  },
  nav: { features: "Features", screens: "Product", how: "How it works", faq: "FAQ", contact: "Contact", login: "Log in", demo: "Request a demo", menu: "Menu" },
  hero: {
    eyebrow: "For companies renting audio guides to tour groups",
    title: "Radio sets delivered on time.",
    accent: "No channel clashes. No forgotten pickups.",
    subtitle:
      "EchoBox Logistics runs your whole service: guide bookings, radio-channel allocation, the riders who deliver and collect, and the numbers at the end of the month.",
    primary: "Request a demo",
    secondary: "See the product",
    points: ["Runs in the browser, phones included", "Real-time updates", "Each company's data kept apart"],
    liveBadge: "Live",
  },
  audience: {
    label: "Built for",
    items: ["Audio-guide & whisper rental", "Tour operators & agencies", "Cruise shore excursions", "School groups & conferences"],
  },
  problems: {
    label: "Why",
    title: "From the group chat to a single place",
    subtitle: "Spreadsheets, messages and phone calls work while the day is quiet. Then high season arrives.",
    before: "Before",
    after: "With EchoBox",
    items: [
      {
        problem: "Two groups on the same channel: the guides talk over each other and the tour is ruined.",
        solution: "Every open order holds its own channel. Duplicates are blocked and the channel is released at pickup.",
      },
      {
        problem: "Radio sets delivered and never collected. You notice days later, when they are missing.",
        solution: "Pickups stay on screen until they are closed; late or unscheduled ones are flagged.",
      },
      {
        problem: "“Where is the rider?” “Who did I give them to?” Endless calls just to know where things stand.",
        solution: "Riders update the status from their phone with one tap: the office sees everything as it happens.",
      },
    ],
  },
  features: {
    label: "Features",
    title: "The whole service, from the order to the radios coming back",
    subtitle: "Designed for teams delivering radio sets in busy city centres every day, not a generic back-office tool.",
    items: [
      { title: "Orders and daily plan", text: "Day, week, month or year views with search, status filters and PDF export." },
      { title: "Radio channel map", text: "Free, busy and disabled channels at a glance. A channel can never be assigned twice." },
      { title: "Rider app", text: "Riders only see their own jobs and move deliveries and pickups forward with a single tap." },
      { title: "Pickups under control", text: "Pickups that are late, unscheduled or unassigned stay at the top of the page until someone closes them." },
      { title: "Booking link for guides", text: "A public link with your company name: guides book on their own and the order arrives ready to go." },
      { title: "Dashboard and statistics", text: "Revenue, radios delivered and lost, peak hours, top guides and locations, month over month." },
      { title: "Team and roles", text: "Email invitations, admin and rider roles, and who is on duty right now and where they are heading." },
      { title: "Full order history", text: "Who created, assigned, delivered or changed what, and when. Handy when something does not add up." },
    ],
  },
  screens: {
    label: "Product",
    title: "See how work gets done in EchoBox",
    subtitle: "Real screens of the application, with sample data from a working day in Rome.",
    web: "Office (web)",
    mobile: "Riders & guides (mobile)",
    enlarge: "Enlarge",
    close: "Close",
    note: "Demo data: names, numbers and addresses are made up. The app interface is in Italian.",
    items: {
      "web-orders": { title: "The whole day at a glance", text: "Today's deliveries and pickups with status, assigned riders, revenue and pickups that need attention." },
      "web-order-detail": { title: "Every order, with its history", text: "Guide, channel, radio sets, times and places, plus the full timeline of every change." },
      "web-channels": { title: "Radio channel map", text: "Free, in use and disabled. One click takes a faulty channel out of service." },
      "web-dashboard": { title: "The month in numbers", text: "Revenue and orders against last month, daily trend, losses and peak hours." },
      "web-calendar": { title: "Calendar", text: "Deliveries and pickups for every day of the month. Click a day to open its orders." },
      "web-team": { title: "Team and riders on duty", text: "Who is delivering, who is collecting and where, plus team invitations and roles." },
      "mobile-rider": { title: "The rider app", text: "Only assigned jobs, with address, the guide's phone and one big button to move on." },
      "mobile-orders": { title: "The office in your pocket", text: "Order management works from the phone too, when you are away from the desk." },
      "mobile-booking": { title: "The guide booking form", text: "Guides book from your public link: the order shows up in your list straight away." },
    },
  },
  how: {
    label: "How it works",
    title: "Four steps, every day",
    steps: [
      { title: "An order comes in", text: "You enter it, or the guide books it from your public link: radio sets, times, delivery and pickup places." },
      { title: "Channel and riders", text: "Pick a free channel and assign delivery and pickup to your riders. Conflicts are impossible." },
      { title: "Delivery and pickup", text: "The rider sets off, delivers and collects, updating the status from the phone and reporting lost sets." },
      { title: "Everything tracked", text: "Channel released, revenue recorded, statistics updated. Tomorrow starts from a clean list." },
    ],
  },
  roles: {
    label: "For the whole team",
    title: "One platform, three points of view",
    items: [
      { role: "Office", title: "Plan and keep control", points: ["Orders, channels and assignments", "Late pickups highlighted", "Statistics and exports"] },
      { role: "Riders", title: "Always know what is next", points: ["Only their own jobs", "Addresses and the guide's phone", "One tap per step"] },
      { role: "Guides", title: "Book in a minute", points: ["Your company's public link", "No account needed", "Instant confirmation"] },
    ],
  },
  faq: {
    label: "FAQ",
    title: "Frequently asked questions",
    items: [
      { q: "Do I need to install anything?", a: "No. EchoBox runs in the browser on computers, tablets and phones. Riders open it on their phone like any web page." },
      { q: "How many radio channels can I manage?", a: "As many as you have: set the total and disable faulty or reserved channels. Each channel can only be used by one open order at a time." },
      { q: "Do guides need to sign up?", a: "No. Share your company's booking link: the guide enters name, phone, radio sets and times, and the order reaches you immediately." },
      { q: "Is my data kept apart from other companies?", a: "Yes. Each company only sees its own orders, riders and guides. Access rules are enforced directly in the database." },
      { q: "What language is the app in?", a: "The working interface is in Italian; this website is also available in English, German and French. If your team works in another language, get in touch." },
      { q: "How much does it cost?", a: "It depends on the number of riders and orders. Tell us a little about your service and we will send you a proposal." },
    ],
  },
  contact: {
    label: "Contact",
    title: "Let's talk about your service",
    subtitle: "Tell us how many radio sets you manage and how you work today. We will get back to you as soon as possible.",
    perks: ["Live demo on your real cases", "Channels and riders set up together with you", "No commitment"],
    name: "Full name",
    email: "Email",
    company: "Company",
    phone: "Phone",
    optional: "optional",
    message: "Message",
    messagePlaceholder: "E.g. we rent 400 radio sets in Rome with 4 riders and want to stop running everything from a group chat…",
    consentBefore: "I have read the ",
    consentLink: "privacy policy",
    consentAfter: " and agree to be contacted.",
    submit: "Send message",
    sending: "Sending…",
    successTitle: "Message sent, thank you!",
    successText: "We will reply to the email address you gave us.",
    again: "Send another message",
    direct: "Prefer email?",
    errors: {
      name: "Please enter your name.",
      email: "Please enter a valid email address.",
      message: "Please write at least a few words (10 characters).",
      consent: "We need your consent to reply to you.",
      rate: "You have sent several messages in a short time. Try again in an hour or email us.",
      generic: "We could not send your message. Please try again or email us.",
    },
  },
  footer: {
    tagline: "Software for companies renting audio guides to tour guides and groups.",
    product: "Product",
    legal: "Legal",
    privacy: "Privacy",
    terms: "Terms and conditions",
    cookies: "Cookies",
    rights: "All rights reserved.",
    language: "Language",
    login: "Log in to the platform",
  },
};

const de: Dict = {
  meta: {
    title: "EchoBox Logistics — Software für den Verleih von Audioguide-Systemen",
    description:
      "Aufträge, Funkkanäle, Lieferungen und Abholungen von Führungsanlagen an einem Ort. Für Unternehmen, die Audiosysteme an Gästeführer und Reisegruppen vermieten.",
  },
  nav: { features: "Funktionen", screens: "Produkt", how: "So funktioniert's", faq: "FAQ", contact: "Kontakt", login: "Anmelden", demo: "Demo anfragen", menu: "Menü" },
  hero: {
    eyebrow: "Für Verleiher von Führungsanlagen und Audioguides",
    title: "Empfänger pünktlich geliefert.",
    accent: "Keine doppelten Kanäle. Keine vergessenen Abholungen.",
    subtitle:
      "EchoBox Logistics organisiert Ihren gesamten Service: Buchungen der Gästeführer, Vergabe der Funkkanäle, die Fahrer, die liefern und abholen, und die Zahlen am Monatsende.",
    primary: "Demo anfragen",
    secondary: "Produkt ansehen",
    points: ["Läuft im Browser, auch auf dem Handy", "Updates in Echtzeit", "Daten jeder Firma getrennt"],
    liveBadge: "Live",
  },
  audience: {
    label: "Gemacht für",
    items: ["Verleih von Führungsanlagen", "Reiseveranstalter & Agenturen", "Landausflüge von Kreuzfahrten", "Schulgruppen & Kongresse"],
  },
  problems: {
    label: "Warum",
    title: "Vom Gruppenchat an einen einzigen Ort",
    subtitle: "Tabellen, Nachrichten und Anrufe funktionieren, solange der Tag ruhig ist. Dann kommt die Hochsaison.",
    before: "Vorher",
    after: "Mit EchoBox",
    items: [
      {
        problem: "Zwei Gruppen auf demselben Kanal: Die Gästeführer reden durcheinander und die Führung ist ruiniert.",
        solution: "Jeder offene Auftrag belegt seinen eigenen Kanal. Doppelte Vergabe ist ausgeschlossen, bei Abholung wird der Kanal frei.",
      },
      {
        problem: "Geräte geliefert und nie abgeholt. Man merkt es Tage später, wenn sie fehlen.",
        solution: "Abholungen bleiben sichtbar, bis sie erledigt sind; verspätete oder ungeplante werden markiert.",
      },
      {
        problem: "„Wo ist der Fahrer?“ „Wem habe ich sie gegeben?“ Ständige Anrufe, nur um den Stand zu kennen.",
        solution: "Die Fahrer aktualisieren den Status mit einem Tippen am Handy: Das Büro sieht alles in dem Moment, in dem es passiert.",
      },
    ],
  },
  features: {
    label: "Funktionen",
    title: "Der ganze Service, vom Auftrag bis zur Rückgabe der Geräte",
    subtitle: "Gemacht für Teams, die täglich Empfänger in belebten Innenstädten ausliefern, keine angepasste Standardsoftware.",
    items: [
      { title: "Aufträge und Tagesplan", text: "Tages-, Wochen-, Monats- oder Jahresansicht mit Suche, Statusfiltern und PDF-Export." },
      { title: "Kanalübersicht", text: "Freie, belegte und gesperrte Kanäle auf einen Blick. Ein Kanal kann nie doppelt vergeben werden." },
      { title: "App für Fahrer", text: "Fahrer sehen nur ihre eigenen Aufträge und schalten Lieferung und Abholung mit einem Tippen weiter." },
      { title: "Abholungen im Griff", text: "Verspätete, ungeplante oder nicht zugewiesene Abholungen bleiben oben, bis jemand sie erledigt." },
      { title: "Buchungslink für Gästeführer", text: "Ein öffentlicher Link mit Ihrem Firmennamen: Gästeführer buchen selbst, der Auftrag kommt fertig ausgefüllt an." },
      { title: "Dashboard und Statistiken", text: "Umsatz, gelieferte und verlorene Geräte, Stoßzeiten, häufigste Gästeführer und Orte, Monat für Monat." },
      { title: "Team und Rollen", text: "Einladungen per E-Mail, Rollen für Admins und Fahrer, und wer gerade im Dienst ist und wohin er fährt." },
      { title: "Verlauf jedes Auftrags", text: "Wer hat was erstellt, zugewiesen, geliefert oder geändert, und wann. Praktisch, wenn etwas nicht stimmt." },
    ],
  },
  screens: {
    label: "Produkt",
    title: "So arbeiten Sie mit EchoBox",
    subtitle: "Echte Bildschirme der Anwendung, mit Beispieldaten eines Arbeitstags in Rom.",
    web: "Büro (Web)",
    mobile: "Fahrer & Gästeführer (mobil)",
    enlarge: "Vergrößern",
    close: "Schließen",
    note: "Demodaten: Namen, Nummern und Adressen sind frei erfunden. Die App-Oberfläche ist auf Italienisch.",
    items: {
      "web-orders": { title: "Der ganze Tag auf einen Blick", text: "Lieferungen und Abholungen des Tages mit Status, Fahrern, Umsatz und offenen Abholungen." },
      "web-order-detail": { title: "Jeder Auftrag mit seiner Geschichte", text: "Gästeführer, Kanal, Geräte, Zeiten und Orte, dazu der vollständige Verlauf jeder Änderung." },
      "web-channels": { title: "Kanalübersicht", text: "Frei, belegt und gesperrt. Ein Klick nimmt einen defekten Kanal aus dem Betrieb." },
      "web-dashboard": { title: "Der Monat in Zahlen", text: "Umsatz und Aufträge im Vergleich zum Vormonat, Tagesverlauf, Verluste und Stoßzeiten." },
      "web-calendar": { title: "Kalender", text: "Lieferungen und Abholungen für jeden Tag des Monats. Ein Klick auf den Tag öffnet seine Aufträge." },
      "web-team": { title: "Team und Fahrer im Dienst", text: "Wer liefert, wer abholt und wo, dazu Einladungen und Rollen im Team." },
      "mobile-rider": { title: "Die Fahrer-App", text: "Nur zugewiesene Aufträge, mit Adresse, Telefon des Gästeführers und einem großen Knopf für den nächsten Schritt." },
      "mobile-orders": { title: "Das Büro in der Tasche", text: "Die Auftragsverwaltung funktioniert auch auf dem Handy, wenn Sie nicht am Schreibtisch sind." },
      "mobile-booking": { title: "Das Buchungsformular", text: "Gästeführer buchen über Ihren öffentlichen Link: Der Auftrag erscheint sofort in Ihrer Liste." },
    },
  },
  how: {
    label: "So funktioniert's",
    title: "Vier Schritte, jeden Tag",
    steps: [
      { title: "Ein Auftrag kommt rein", text: "Sie erfassen ihn, oder der Gästeführer bucht über Ihren Link: Geräte, Zeiten, Liefer- und Abholort." },
      { title: "Kanal und Fahrer", text: "Freien Kanal wählen, Lieferung und Abholung den Fahrern zuweisen. Konflikte sind unmöglich." },
      { title: "Lieferung und Abholung", text: "Der Fahrer liefert und holt ab und aktualisiert den Status am Handy, inklusive verlorener Geräte." },
      { title: "Alles erfasst", text: "Kanal frei, Umsatz gebucht, Statistiken aktualisiert. Morgen beginnt mit einer sauberen Liste." },
    ],
  },
  roles: {
    label: "Für das ganze Team",
    title: "Eine Plattform, drei Blickwinkel",
    items: [
      { role: "Büro", title: "Planen und den Überblick behalten", points: ["Aufträge, Kanäle und Zuweisungen", "Verspätete Abholungen hervorgehoben", "Statistiken und Exporte"] },
      { role: "Fahrer", title: "Wissen immer, was als Nächstes kommt", points: ["Nur die eigenen Aufträge", "Adressen und Telefon des Gästeführers", "Ein Tippen pro Schritt"] },
      { role: "Gästeführer", title: "Buchen in einer Minute", points: ["Öffentlicher Link Ihrer Firma", "Kein Konto nötig", "Sofortige Bestätigung"] },
    ],
  },
  faq: {
    label: "FAQ",
    title: "Häufige Fragen",
    items: [
      { q: "Muss ich etwas installieren?", a: "Nein. EchoBox läuft im Browser auf Computer, Tablet und Handy. Fahrer öffnen es auf dem Handy wie eine normale Webseite." },
      { q: "Wie viele Funkkanäle kann ich verwalten?", a: "So viele, wie Sie haben: Gesamtzahl festlegen und defekte oder reservierte Kanäle sperren. Jeder Kanal gehört immer nur einem offenen Auftrag." },
      { q: "Müssen sich Gästeführer registrieren?", a: "Nein. Teilen Sie den Buchungslink Ihrer Firma: Der Gästeführer gibt Name, Telefon, Geräte und Zeiten ein, und der Auftrag ist sofort bei Ihnen." },
      { q: "Sind meine Daten von anderen Firmen getrennt?", a: "Ja. Jede Firma sieht nur ihre eigenen Aufträge, Fahrer und Gästeführer. Die Zugriffsregeln werden direkt in der Datenbank durchgesetzt." },
      { q: "In welcher Sprache ist die App?", a: "Die Arbeitsoberfläche ist auf Italienisch; diese Website gibt es auch auf Englisch, Deutsch und Französisch. Arbeitet Ihr Team in einer anderen Sprache, schreiben Sie uns." },
      { q: "Was kostet es?", a: "Das hängt von der Zahl der Fahrer und Aufträge ab. Erzählen Sie uns kurz von Ihrem Service, und wir schicken Ihnen ein Angebot." },
    ],
  },
  contact: {
    label: "Kontakt",
    title: "Sprechen wir über Ihren Service",
    subtitle: "Erzählen Sie uns, wie viele Geräte Sie verwalten und wie Sie heute arbeiten. Wir melden uns so bald wie möglich.",
    perks: ["Live-Demo mit Ihren echten Fällen", "Einrichtung von Kanälen und Fahrern gemeinsam mit Ihnen", "Unverbindlich"],
    name: "Vor- und Nachname",
    email: "E-Mail",
    company: "Firma",
    phone: "Telefon",
    optional: "optional",
    message: "Nachricht",
    messagePlaceholder: "Z. B. wir vermieten 400 Empfänger in Rom mit 4 Fahrern und möchten weg vom Gruppenchat…",
    consentBefore: "Ich habe die ",
    consentLink: "Datenschutzerklärung",
    consentAfter: " gelesen und bin mit einer Kontaktaufnahme einverstanden.",
    submit: "Nachricht senden",
    sending: "Wird gesendet…",
    successTitle: "Nachricht gesendet, vielen Dank!",
    successText: "Wir antworten an die angegebene E-Mail-Adresse.",
    again: "Weitere Nachricht senden",
    direct: "Lieber per E-Mail?",
    errors: {
      name: "Bitte geben Sie Ihren Namen ein.",
      email: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      message: "Bitte schreiben Sie ein paar Worte (mindestens 10 Zeichen).",
      consent: "Ohne Ihre Einwilligung können wir nicht antworten.",
      rate: "Sie haben in kurzer Zeit viele Nachrichten gesendet. Versuchen Sie es in einer Stunde erneut oder schreiben Sie uns eine E-Mail.",
      generic: "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie uns eine E-Mail.",
    },
  },
  footer: {
    tagline: "Die Software für Verleiher von Führungsanlagen an Gästeführer und Reisegruppen.",
    product: "Produkt",
    legal: "Rechtliches",
    privacy: "Datenschutz",
    terms: "AGB",
    cookies: "Cookies",
    rights: "Alle Rechte vorbehalten.",
    language: "Sprache",
    login: "Zur Plattform",
  },
};

const fr: Dict = {
  meta: {
    title: "EchoBox Logistics — Logiciel pour la location d'audioguides",
    description:
      "Commandes, canaux radio, livraisons et retraits des récepteurs au même endroit. Pour les entreprises qui louent des systèmes audio aux guides et aux groupes.",
  },
  nav: { features: "Fonctions", screens: "Le produit", how: "Comment ça marche", faq: "FAQ", contact: "Contact", login: "Connexion", demo: "Demander une démo", menu: "Menu" },
  hero: {
    eyebrow: "Pour les loueurs d'audioguides aux guides et aux groupes",
    title: "Des récepteurs livrés à l'heure.",
    accent: "Aucun canal en double. Aucun retrait oublié.",
    subtitle:
      "EchoBox Logistics organise tout votre service : les réservations des guides, l'attribution des canaux radio, les livreurs qui livrent et récupèrent, et les chiffres de fin de mois.",
    primary: "Demander une démo",
    secondary: "Voir le produit",
    points: ["Fonctionne dans le navigateur, même sur mobile", "Mises à jour en temps réel", "Données séparées par entreprise"],
    liveBadge: "En direct",
  },
  audience: {
    label: "Conçu pour",
    items: ["Location d'audioguides et whisper", "Tour-opérateurs et agences", "Excursions de croisière", "Groupes scolaires et congrès"],
  },
  problems: {
    label: "Pourquoi",
    title: "Du groupe WhatsApp à un seul outil",
    subtitle: "Tableurs, messages et appels fonctionnent tant que la journée est calme. Puis arrive la haute saison.",
    before: "Avant",
    after: "Avec EchoBox",
    items: [
      {
        problem: "Deux groupes sur le même canal : les guides se superposent et la visite est gâchée.",
        solution: "Chaque commande ouverte occupe son propre canal. Les doublons sont bloqués et le canal est libéré au retrait.",
      },
      {
        problem: "Des récepteurs livrés et jamais récupérés. On s'en aperçoit des jours plus tard, quand ils manquent.",
        solution: "Les retraits restent affichés jusqu'à leur clôture ; ceux en retard ou sans date sont signalés.",
      },
      {
        problem: "« Où est le livreur ? » « À qui les ai-je donnés ? » Des appels sans fin pour savoir où on en est.",
        solution: "Les livreurs mettent à jour le statut depuis leur téléphone en un geste : le bureau voit tout en direct.",
      },
    ],
  },
  features: {
    label: "Fonctions",
    title: "Tout le service, de la commande au retour des récepteurs",
    subtitle: "Pensé pour les équipes qui livrent des récepteurs chaque jour dans les centres-villes, pas un logiciel de gestion générique.",
    items: [
      { title: "Commandes et planning du jour", text: "Vue par jour, semaine, mois ou année, avec recherche, filtres par statut et export PDF." },
      { title: "Carte des canaux radio", text: "Canaux libres, occupés et désactivés d'un coup d'œil. Un canal ne peut jamais être attribué deux fois." },
      { title: "Application livreurs", text: "Les livreurs ne voient que leurs propres missions et font avancer livraison et retrait d'un seul geste." },
      { title: "Retraits sous contrôle", text: "Retraits en retard, non planifiés ou non attribués : en haut de la page jusqu'à ce que quelqu'un les clôture." },
      { title: "Lien de réservation pour les guides", text: "Un lien public au nom de votre entreprise : les guides réservent seuls et la commande arrive déjà remplie." },
      { title: "Tableau de bord et statistiques", text: "Chiffre d'affaires, récepteurs livrés et perdus, heures de pointe, guides et lieux les plus fréquents, mois après mois." },
      { title: "Équipe et rôles", text: "Invitations par e-mail, rôles administrateur et livreur, et qui est en service en ce moment et où il va." },
      { title: "Historique de chaque commande", text: "Qui a créé, attribué, livré ou modifié quoi, et quand. Utile quand quelque chose ne colle pas." },
    ],
  },
  screens: {
    label: "Le produit",
    title: "Découvrez comment on travaille avec EchoBox",
    subtitle: "De vrais écrans de l'application, avec des données d'exemple d'une journée à Rome.",
    web: "Bureau (web)",
    mobile: "Livreurs et guides (mobile)",
    enlarge: "Agrandir",
    close: "Fermer",
    note: "Données de démonstration : noms, numéros et adresses sont fictifs. L'interface de l'application est en italien.",
    items: {
      "web-orders": { title: "Toute la journée d'un coup d'œil", text: "Livraisons et retraits du jour avec statut, livreurs, chiffre d'affaires et retraits à traiter." },
      "web-order-detail": { title: "Chaque commande, avec son histoire", text: "Guide, canal, récepteurs, horaires et lieux, plus l'historique complet de chaque modification." },
      "web-channels": { title: "Carte des canaux radio", text: "Libres, utilisés et désactivés. Un clic pour mettre hors service un canal défectueux." },
      "web-dashboard": { title: "Le mois en chiffres", text: "Chiffre d'affaires et commandes par rapport au mois précédent, tendance quotidienne, pertes et heures de pointe." },
      "web-calendar": { title: "Calendrier", text: "Livraisons et retraits de chaque jour du mois. Un clic sur un jour ouvre ses commandes." },
      "web-team": { title: "Équipe et livreurs en service", text: "Qui livre, qui récupère et où, avec les invitations et les rôles de l'équipe." },
      "mobile-rider": { title: "L'application du livreur", text: "Uniquement les missions attribuées, avec l'adresse, le téléphone du guide et un grand bouton pour avancer." },
      "mobile-orders": { title: "Le bureau dans la poche", text: "La gestion des commandes fonctionne aussi sur mobile, quand vous n'êtes pas au bureau." },
      "mobile-booking": { title: "Le formulaire des guides", text: "Les guides réservent depuis votre lien public : la commande apparaît aussitôt dans votre liste." },
    },
  },
  how: {
    label: "Comment ça marche",
    title: "Quatre étapes, chaque jour",
    steps: [
      { title: "Une commande arrive", text: "Vous la saisissez, ou le guide la réserve depuis votre lien public : récepteurs, horaires, lieux de livraison et de retrait." },
      { title: "Canal et livreurs", text: "Choisissez un canal libre et attribuez livraison et retrait aux livreurs. Les conflits sont impossibles." },
      { title: "Livraison et retrait", text: "Le livreur livre puis récupère en mettant à jour le statut depuis son téléphone, y compris les récepteurs perdus." },
      { title: "Tout est tracé", text: "Canal libéré, chiffre d'affaires enregistré, statistiques à jour. Demain commence avec une liste propre." },
    ],
  },
  roles: {
    label: "Pour toute l'équipe",
    title: "Une plateforme, trois points de vue",
    items: [
      { role: "Bureau", title: "Planifier et garder le contrôle", points: ["Commandes, canaux et attributions", "Retraits en retard mis en évidence", "Statistiques et exports"] },
      { role: "Livreurs", title: "Savent toujours quoi faire", points: ["Uniquement leurs missions", "Adresses et téléphone du guide", "Un geste par étape"] },
      { role: "Guides", title: "Réservent en une minute", points: ["Le lien public de votre entreprise", "Aucun compte à créer", "Confirmation immédiate"] },
    ],
  },
  faq: {
    label: "FAQ",
    title: "Questions fréquentes",
    items: [
      { q: "Dois-je installer quelque chose ?", a: "Non. EchoBox fonctionne dans le navigateur, sur ordinateur, tablette et téléphone. Les livreurs l'ouvrent sur leur téléphone comme une page web." },
      { q: "Combien de canaux radio puis-je gérer ?", a: "Autant que vous en avez : indiquez le total et désactivez les canaux défectueux ou réservés. Chaque canal ne sert qu'à une commande ouverte à la fois." },
      { q: "Les guides doivent-ils s'inscrire ?", a: "Non. Partagez le lien de réservation de votre entreprise : le guide saisit nom, téléphone, récepteurs et horaires, et la commande vous parvient aussitôt." },
      { q: "Mes données sont-elles séparées de celles des autres entreprises ?", a: "Oui. Chaque entreprise ne voit que ses commandes, livreurs et guides. Les règles d'accès sont appliquées directement dans la base de données." },
      { q: "Dans quelle langue est l'application ?", a: "L'interface de travail est en italien ; ce site existe aussi en anglais, allemand et français. Si votre équipe travaille dans une autre langue, écrivez-nous." },
      { q: "Combien ça coûte ?", a: "Cela dépend du nombre de livreurs et de commandes. Décrivez-nous votre service en quelques lignes et nous vous enverrons une offre." },
    ],
  },
  contact: {
    label: "Contact",
    title: "Parlons de votre service",
    subtitle: "Dites-nous combien de récepteurs vous gérez et comment vous travaillez aujourd'hui. Nous vous répondons au plus vite.",
    perks: ["Démo en direct sur vos cas réels", "Configuration des canaux et des livreurs avec vous", "Sans engagement"],
    name: "Prénom et nom",
    email: "E-mail",
    company: "Entreprise",
    phone: "Téléphone",
    optional: "facultatif",
    message: "Message",
    messagePlaceholder: "Ex. nous louons 400 récepteurs à Rome avec 4 livreurs et voulons arrêter de tout gérer par messagerie…",
    consentBefore: "J'ai lu la ",
    consentLink: "politique de confidentialité",
    consentAfter: " et j'accepte d'être recontacté.",
    submit: "Envoyer le message",
    sending: "Envoi en cours…",
    successTitle: "Message envoyé, merci !",
    successText: "Nous vous répondrons à l'adresse e-mail indiquée.",
    again: "Envoyer un autre message",
    direct: "Vous préférez l'e-mail ?",
    errors: {
      name: "Veuillez indiquer votre nom.",
      email: "Veuillez indiquer une adresse e-mail valide.",
      message: "Écrivez au moins quelques mots (10 caractères).",
      consent: "Votre accord est nécessaire pour que nous puissions répondre.",
      rate: "Vous avez envoyé beaucoup de messages en peu de temps. Réessayez dans une heure ou écrivez-nous par e-mail.",
      generic: "Nous n'avons pas pu envoyer votre message. Réessayez ou écrivez-nous par e-mail.",
    },
  },
  footer: {
    tagline: "Le logiciel des loueurs d'audioguides pour guides et groupes touristiques.",
    product: "Produit",
    legal: "Mentions légales",
    privacy: "Confidentialité",
    terms: "Conditions générales",
    cookies: "Cookies",
    rights: "Tous droits réservés.",
    language: "Langue",
    login: "Accéder à la plateforme",
  },
};

export const DICTS: Record<Lang, Dict> = { it, en, de, fr };

const STORAGE_KEY = "echobox-lang";

const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** ?lang= in the URL, then the last choice, then the browser languages; Italian by default. */
export function detectLang(): Lang {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (isLang(fromUrl)) return fromUrl;
  } catch {
    /* ignore */
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage can be blocked */
  }
  const browser = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const tag of browser) {
    const base = tag?.slice(0, 2).toLowerCase();
    if (isLang(base)) return base;
  }
  return browser.length ? "en" : "it";
}

export function rememberLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage can be blocked */
  }
}
