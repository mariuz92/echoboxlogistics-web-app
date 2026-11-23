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

export const SECTION_IDS = ["orders", "channels", "riders", "pickups", "booking", "stats"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

interface Item {
  title: string;
  text: string;
}

interface ProductSection {
  label: string;
  title: string;
  text: string;
  points: string[];
}

export interface Dict {
  meta: { title: string; description: string };
  nav: { product: string; start: string; faq: string; contact: string; demo: string; menu: string; language: string };
  hero: {
    kicker: string;
    title: string;
    subtitle: string;
    primary: string;
    secondary: string;
    note: string;
    imageAlt: string;
    phoneAlt: string;
    webLabel: string;
    mobileLabel: string;
  };
  day: { label: string; title: string; intro: string; items: { time: string; text: string }[]; outro: string };
  product: {
    label: string;
    title: string;
    note: string;
    enlarge: string;
    close: string;
    sections: Record<SectionId, ProductSection>;
    moreTitle: string;
    more: Item[];
  };
  start: { label: string; title: string; steps: Item[]; cta: string };
  faq: { label: string; title: string; items: { q: string; a: string }[] };
  contact: {
    label: string;
    title: string;
    subtitle: string;
    direct: string;
    mailTitle: string;
    mailText: string;
    mailCta: string;
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
    errors: { name: string; email: string; message: string; consent: string; rate: string; generic: string };
  };
  footer: { tagline: string; product: string; legal: string; privacy: string; terms: string; cookies: string; rights: string };
}

const it: Dict = {
  meta: {
    title: "EchoBox Logistics · Gestionale per il noleggio di radioguide",
    description:
      "Ordini, canali radio, rider e ritiri delle radioguide in un unico posto. Per chi noleggia radioguide a guide e gruppi turistici.",
  },
  nav: {
    product: "Il prodotto",
    start: "Come si parte",
    faq: "Domande",
    contact: "Contatti",
    demo: "Prenota una demo",
    menu: "Menu",
    language: "Lingua",
  },
  hero: {
    kicker: "Web + mobile · per chi noleggia radioguide",
    title: "Consegne e ritiri di radioguide, gestiti da un'unica schermata.",
    subtitle:
      "EchoBox è il gestionale web e mobile per chi noleggia radioguide a guide e gruppi. Ordini, canali radio, rider e ritiri stanno nello stesso posto: l'ufficio vede ogni consegna mentre succede, i rider hanno tutto sul telefono e nessun gruppo finisce sul canale di un altro.",
    primary: "Prenota una demo",
    secondary: "Guarda il prodotto",
    note: "L'ufficio lavora dal computer, i rider dal telefono. Tutto nel browser: non c'è niente da installare.",
    imageAlt: "La schermata Ordini di EchoBox con le consegne e i ritiri della giornata",
    phoneAlt: "L'app del rider sul telefono, con le consegne assegnate",
    webLabel: "Web · ufficio",
    mobileLabel: "Mobile · rider",
  },
  day: {
    label: "Il problema",
    title: "Una giornata normale, prima di EchoBox",
    intro: "Le chat di gruppo e i fogli Excel reggono finché la giornata è tranquilla. In alta stagione succede questo:",
    items: [
      {
        time: "07:50",
        text: "Il rider chiama per la terza volta: la consegna al Colosseo è alle 8:15 o alle 8:45? Nella chat ci sono due messaggi diversi.",
      },
      {
        time: "10:40",
        text: "Due gruppi davanti a San Pietro sono sullo stesso canale. Le guide si sentono a vicenda e la visita salta.",
      },
      {
        time: "18:00",
        text: "In magazzino mancano 26 radio. Erano di un tour di martedì e nessuno è passato a ritirarle.",
      },
    ],
    outro: "EchoBox mette ordini, canali e ritiri nello stesso posto, visibile a tutto il team. Queste telefonate non servono più.",
  },
  product: {
    label: "Il prodotto",
    title: "Tutto il lavoro di una giornata, dall'ordine al rientro delle radio",
    note: "Le schermate mostrano dati di esempio: nomi, numeri e indirizzi sono inventati.",
    enlarge: "Ingrandisci",
    close: "Chiudi",
    sections: {
      orders: {
        label: "Ordini",
        title: "La giornata intera in una schermata",
        text: "Consegne e ritiri di oggi con orario, luogo, canale, rider e incasso. Cerchi una guida, filtri per stato, passi alla settimana o al mese e stampi il PDF per chi è in strada.",
        points: [
          "Ogni ordine ha la sua cronologia: chi l'ha creato, assegnato e consegnato, e quando",
          "Gli ordini arrivati dal modulo delle guide si riconoscono a colpo d'occhio",
        ],
      },
      channels: {
        label: "Canali radio",
        title: "Qualsiasi radioguida, da 1 a 10.000 canali",
        text: "Imposti i canali dei tuoi apparecchi, qualunque modello usi. Un canale è occupato solo mentre il gruppo ha le radio, dalla consegna al ritiro: lo stesso canale può servire un gruppo la mattina e un altro il pomeriggio.",
        points: [
          "Scrivi il canale nell'ordine: EchoBox ti dice subito se è libero o chi lo sta usando",
          "Due gruppi sullo stesso canale alla stessa ora vengono bloccati, se i tuoi apparecchi non possono condividerlo",
          "Canali guasti o riservati esclusi in un attimo",
        ],
      },
      riders: {
        label: "Rider",
        title: "Sul telefono del rider, solo quello che serve",
        text: "Il rider vede i lavori assegnati a lui, con indirizzo, numero della guida, quantità di radio e canale. Un pulsante per ogni passaggio, dalla partenza al ritiro.",
        points: ["Al ritiro segnala le radio mancanti", "L'ufficio vede il nuovo stato nello stesso momento"],
      },
      pickups: {
        label: "Ritiri",
        title: "Nessuna radio resta in giro",
        text: "I ritiri restano in cima alla pagina degli ordini finché qualcuno non li chiude. Quelli senza data o in ritardo vengono segnalati ogni giorno, anche se il tour era la settimana scorsa.",
        points: ["Chi ha consegnato e dove, a portata di clic"],
      },
      booking: {
        label: "Prenotazioni",
        title: "Le guide prenotano da sole",
        text: "Condividi il link di prenotazione della tua azienda. La guida inserisce nome del gruppo, telefono, numero di radio, orari e luoghi: l'ordine compare nella tua lista già compilato.",
        points: ["La guida non deve creare un account", "Puoi chiudere le prenotazioni online quando vuoi"],
      },
      stats: {
        label: "Dashboard",
        title: "Dai numeri alle decisioni",
        text: "Non solo incassi: la dashboard confronta il mese con il precedente e te lo spiega in parole semplici. Quante radio servono nei giorni di punta, quando servono più rider, da quali guide dipende l'incasso e quali hanno smesso di prenotare.",
        points: ["Avvisi su ritiri in ritardo e consegne senza rider", "Stagionalità degli ultimi 12 mesi, per pianificare", "Esportazione CSV dal calendario"],
      },
    },
    moreTitle: "E inoltre",
    more: [
      { title: "Calendario", text: "Consegne e ritiri di ogni giorno del mese, con l'incasso." },
      { title: "Team e ruoli", text: "Inviti via email, ruoli amministratore e rider, e chi è in servizio adesso." },
      { title: "Rubrica delle guide", text: "Le guide con cui lavori, con telefono, email e note." },
      { title: "Dati separati", text: "Ogni azienda vede solo i propri ordini, rider e guide." },
      { title: "Chiaro o scuro", text: "Ognuno sceglie il tema che preferisce." },
      { title: "Esportazioni", text: "Il PDF della giornata, il CSV del mese." },
    ],
  },
  start: {
    label: "Come si parte",
    title: "Si parte in tre passi",
    steps: [
      { title: "Attiviamo la tua azienda", text: "Dopo la demo creiamo l'azienda e invitiamo l'amministratore. Tu imposti i canali delle tue radioguide." },
      { title: "Invita i rider", text: "Ricevono un'email, scelgono una password e lavorano dal telefono." },
      { title: "Condividi il link", text: "Manda alle guide il link di prenotazione: gli ordini iniziano ad arrivare da soli." },
    ],
    cta: "Vuoi vederlo prima? Prenota una demo",
  },
  faq: {
    label: "Domande",
    title: "Domande frequenti",
    items: [
      { q: "Bisogna installare qualcosa?", a: "No. EchoBox si apre dal browser su computer, tablet e telefono. I rider lo usano dal telefono come un normale sito." },
      { q: "Funziona con le mie radioguide?", a: "Sì, con qualsiasi modello: imposti la numerazione dei tuoi canali, da 1 a 10.000, e disabiliti quelli guasti o riservati. Scegli tu se un canale serve un solo gruppo alla volta o se più gruppi possono condividerlo." },
      { q: "Le guide devono registrarsi?", a: "No. Usano il link di prenotazione della tua azienda e compilano un modulo che richiede un minuto. L'ordine arriva subito a te." },
      { q: "I nostri dati sono separati da quelli di altre aziende?", a: "Sì. Ogni azienda vede solo i propri ordini, rider e guide, e la separazione è applicata direttamente nel database." },
      { q: "In che lingua è l'applicazione?", a: "L'applicazione è in italiano e in inglese, e si cambia lingua dal menu in alto. Questo sito è anche in tedesco e francese: se il tuo team lavora in un'altra lingua, scrivici." },
      { q: "Quanto costa?", a: "Dipende da quanti rider e ordini gestite. Raccontaci il tuo servizio e ti mandiamo una proposta." },
    ],
  },
  contact: {
    label: "Contatti",
    title: "Vediamo EchoBox su una giornata come la tua",
    subtitle:
      "Scrivici quante radioguide gestisci, quanti rider avete e come vi organizzate oggi. Ti ricontattiamo per fissare una demo.",
    direct: "Oppure scrivi a",
    mailTitle: "Scrivici un'email",
    mailText: "Raccontaci quante radioguide gestisci, quanti rider avete e come vi organizzate oggi. Ti ricontattiamo per fissare una demo.",
    mailCta: "Scrivi a EchoBox",
    name: "Nome e cognome",
    email: "Email",
    company: "Azienda",
    phone: "Telefono",
    optional: "facoltativo",
    message: "Messaggio",
    messagePlaceholder: "Es. noleggiamo 400 radioguide a Roma con 4 rider e vorremmo smettere di organizzarci in chat…",
    consentBefore: "Ho letto l'",
    consentLink: "informativa sulla privacy",
    consentAfter: " e acconsento a essere ricontattato.",
    submit: "Invia messaggio",
    sending: "Invio in corso…",
    successTitle: "Messaggio inviato, grazie.",
    successText: "Ti risponderemo all'indirizzo email che ci hai lasciato.",
    again: "Invia un altro messaggio",
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
  },
};

const en: Dict = {
  meta: {
    title: "EchoBox Logistics · Software for audio-guide rentals",
    description:
      "Orders, radio channels, riders and pickups of tour radio sets in one place. For companies that rent audio guides to tour guides and groups.",
  },
  nav: {
    product: "Product",
    start: "Getting started",
    faq: "Questions",
    contact: "Contact",
    demo: "Book a demo",
    menu: "Menu",
    language: "Language",
  },
  hero: {
    kicker: "Web + mobile · for audio-guide rental companies",
    title: "Run audio-guide deliveries and pickups from one screen.",
    subtitle:
      "EchoBox is the web and mobile operations app for companies that rent radio sets to tour guides and groups. Orders, radio channels, riders and pickups live in one place: the office sees every delivery as it happens, riders have everything on their phone, and no group ends up on another group's channel.",
    primary: "Book a demo",
    secondary: "See the product",
    note: "The office works on a computer, riders on their phone. All in the browser: nothing to install.",
    imageAlt: "The EchoBox Orders screen with the day's deliveries and pickups",
    phoneAlt: "The rider app on a phone, with the assigned deliveries",
    webLabel: "Web · office",
    mobileLabel: "Mobile · riders",
  },
  day: {
    label: "The problem",
    title: "An ordinary day, before EchoBox",
    intro: "Group chats and spreadsheets hold up while the day is quiet. In high season, this happens:",
    items: [
      {
        time: "07:50",
        text: "The rider calls for the third time: is the Colosseum drop-off at 8:15 or 8:45? The chat has two different messages.",
      },
      {
        time: "10:40",
        text: "Two groups outside St Peter's are on the same channel. The guides hear each other and the tour falls apart.",
      },
      {
        time: "18:00",
        text: "26 radio sets are missing from the stockroom. They belonged to Tuesday's tour, and nobody went to collect them.",
      },
    ],
    outro: "EchoBox puts orders, channels and pickups in one place the whole team can see. Those phone calls stop.",
  },
  product: {
    label: "Product",
    title: "A whole working day, from the order to the radios coming back",
    note: "The screens show sample data: names, numbers and addresses are made up. The app's interface is in Italian.",
    enlarge: "Enlarge",
    close: "Close",
    sections: {
      orders: {
        label: "Orders",
        title: "The whole day on one screen",
        text: "Today's deliveries and pickups with time, place, channel, rider and revenue. Search for a guide, filter by status, switch to the week or month, and print a PDF for the team on the street.",
        points: [
          "Every order keeps its history: who created, assigned and delivered it, and when",
          "Orders that came in through the guides' booking form are easy to spot",
        ],
      },
      channels: {
        label: "Radio channels",
        title: "Any radioguide system, from 1 to 10,000 channels",
        text: "Set up the channels of your equipment, whatever model you use. A channel is busy only while a group has the radios, from delivery to pickup: the same channel can serve one group in the morning and another in the afternoon.",
        points: [
          "Type the channel on the order: EchoBox tells you right away whether it is free or who is using it",
          "Two groups on the same channel at the same time are blocked, if your equipment cannot share channels",
          "Faulty or reserved channels excluded in a moment",
        ],
      },
      riders: {
        label: "Riders",
        title: "Only what the rider needs, on their phone",
        text: "Riders see the jobs assigned to them, with the address, the guide's number, the radio count and the channel. One button for each step, from setting off to collecting.",
        points: ["Missing radios are reported at pickup", "The office sees the new status at the same moment"],
      },
      pickups: {
        label: "Pickups",
        title: "No radio set left behind",
        text: "Pickups stay at the top of the orders page until someone closes them. Unscheduled or late ones are flagged every day, even if the tour was last week.",
        points: ["Who delivered, and where, one click away"],
      },
      booking: {
        label: "Bookings",
        title: "Guides book on their own",
        text: "Share your company's booking link. The guide enters the group name, phone, number of radios, times and places, and the order appears in your list already filled in.",
        points: ["Guides don't need an account", "Close online bookings whenever you want"],
      },
      stats: {
        label: "Dashboard",
        title: "From numbers to decisions",
        text: "More than totals: the dashboard compares the month with the last one and explains it in plain words. How many radios you need on peak days, when you need more riders, which guides your revenue depends on, and which have stopped booking.",
        points: ["Alerts for late pickups and deliveries without a rider", "Twelve months of seasonality, to plan ahead", "CSV export from the calendar"],
      },
    },
    moreTitle: "Also included",
    more: [
      { title: "Calendar", text: "Every day's deliveries and pickups, with revenue." },
      { title: "Team and roles", text: "Email invitations, admin and rider roles, and who is on duty now." },
      { title: "Guide directory", text: "The guides you work with, with phone, email and notes." },
      { title: "Separate data", text: "Each company only sees its own orders, riders and guides." },
      { title: "Light or dark", text: "Everyone picks the theme they prefer." },
      { title: "Exports", text: "A PDF of the day, a CSV of the month." },
    ],
  },
  start: {
    label: "Getting started",
    title: "Up and running in three steps",
    steps: [
      { title: "We set up your company", text: "After the demo we create your company and invite its administrator. You set up the channels of your radioguides." },
      { title: "Invite your riders", text: "They get an email, choose a password and work from their phone." },
      { title: "Share your link", text: "Send guides your booking link and orders start arriving on their own." },
    ],
    cta: "Want to see it first? Book a demo",
  },
  faq: {
    label: "Questions",
    title: "Frequently asked questions",
    items: [
      { q: "Do we need to install anything?", a: "No. EchoBox opens in the browser on computers, tablets and phones. Riders use it on their phone like any website." },
      { q: "Does it work with our radioguides?", a: "Yes, with any model: set how your channels are numbered, from 1 to 10,000, and disable faulty or reserved ones. You choose whether a channel serves one group at a time or can be shared." },
      { q: "Do guides need to sign up?", a: "No. They use your company's booking link and fill in a form that takes a minute. The order reaches you straight away." },
      { q: "Is our data kept apart from other companies?", a: "Yes. Each company only sees its own orders, riders and guides, and the separation is enforced in the database itself." },
      { q: "What language is the app in?", a: "The app is in Italian and English, and you switch language from the header. This website is also in German and French: if your team works in another language, get in touch." },
      { q: "How much does it cost?", a: "It depends on how many riders and orders you handle. Tell us about your service and we will send you a proposal." },
    ],
  },
  contact: {
    label: "Contact",
    title: "Let's look at EchoBox on a day like yours",
    subtitle:
      "Tell us how many radio sets you manage, how many riders you have and how you organise things today. We'll get back to you to set up a demo.",
    direct: "Or email",
    mailTitle: "Send us an email",
    mailText: "Tell us how many radio sets you manage, how many riders you have and how you organise things today. We will get back to you to set up a demo.",
    mailCta: "Email EchoBox",
    name: "Full name",
    email: "Email",
    company: "Company",
    phone: "Phone",
    optional: "optional",
    message: "Message",
    messagePlaceholder: "E.g. we rent 400 radio sets in Rome with 4 riders and want to stop organising everything in a group chat…",
    consentBefore: "I have read the ",
    consentLink: "privacy policy",
    consentAfter: " and agree to be contacted.",
    submit: "Send message",
    sending: "Sending…",
    successTitle: "Message sent, thank you.",
    successText: "We will reply to the email address you gave us.",
    again: "Send another message",
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
    tagline: "Operations software for companies renting audio guides to tour guides and groups.",
    product: "Product",
    legal: "Legal",
    privacy: "Privacy",
    terms: "Terms and conditions",
    cookies: "Cookies",
    rights: "All rights reserved.",
  },
};

const de: Dict = {
  meta: {
    title: "EchoBox Logistics · Software für den Verleih von Führungsanlagen",
    description:
      "Aufträge, Funkkanäle, Fahrer und Abholungen von Führungsanlagen an einem Ort. Für Unternehmen, die Audioguides an Gästeführer und Reisegruppen vermieten.",
  },
  nav: {
    product: "Produkt",
    start: "Einstieg",
    faq: "Fragen",
    contact: "Kontakt",
    demo: "Demo vereinbaren",
    menu: "Menü",
    language: "Sprache",
  },
  hero: {
    kicker: "Web + Mobil · für Verleiher von Führungsanlagen",
    title: "Lieferung und Abholung Ihrer Führungsanlagen, auf einem Bildschirm.",
    subtitle:
      "EchoBox ist die Web- und Mobil-Software für Unternehmen, die Führungsanlagen an Gästeführer und Gruppen vermieten. Aufträge, Funkkanäle, Fahrer und Abholungen an einem Ort: Das Büro sieht jede Lieferung, während sie passiert, die Fahrer haben alles auf dem Handy, und keine Gruppe landet auf dem Kanal einer anderen.",
    primary: "Demo vereinbaren",
    secondary: "Produkt ansehen",
    note: "Das Büro arbeitet am Computer, die Fahrer am Handy. Alles im Browser: nichts zu installieren.",
    imageAlt: "Die Auftragsansicht von EchoBox mit den Lieferungen und Abholungen des Tages",
    phoneAlt: "Die Fahrer-App auf dem Handy mit den zugewiesenen Lieferungen",
    webLabel: "Web · Büro",
    mobileLabel: "Mobil · Fahrer",
  },
  day: {
    label: "Das Problem",
    title: "Ein ganz normaler Tag, vor EchoBox",
    intro: "Gruppenchats und Tabellen halten, solange der Tag ruhig ist. In der Hochsaison passiert das:",
    items: [
      {
        time: "07:50",
        text: "Der Fahrer ruft zum dritten Mal an: Ist die Lieferung am Kolosseum um 8:15 oder um 8:45? Im Chat stehen zwei verschiedene Nachrichten.",
      },
      {
        time: "10:40",
        text: "Zwei Gruppen vor dem Petersdom sind auf demselben Kanal. Die Gästeführer hören sich gegenseitig, die Führung ist gelaufen.",
      },
      {
        time: "18:00",
        text: "Im Lager fehlen 26 Empfänger. Sie gehörten zur Tour vom Dienstag, und niemand hat sie abgeholt.",
      },
    ],
    outro: "EchoBox bringt Aufträge, Kanäle und Abholungen an einen Ort, den das ganze Team sieht. Diese Anrufe braucht es nicht mehr.",
  },
  product: {
    label: "Produkt",
    title: "Ein ganzer Arbeitstag, vom Auftrag bis zur Rückgabe der Geräte",
    note: "Die Bildschirme zeigen Beispieldaten: Namen, Nummern und Adressen sind erfunden. Die Oberfläche der App ist auf Italienisch.",
    enlarge: "Vergrößern",
    close: "Schließen",
    sections: {
      orders: {
        label: "Aufträge",
        title: "Der ganze Tag auf einem Bildschirm",
        text: "Lieferungen und Abholungen von heute mit Uhrzeit, Ort, Kanal, Fahrer und Umsatz. Gästeführer suchen, nach Status filtern, zur Woche oder zum Monat wechseln und ein PDF für das Team unterwegs drucken.",
        points: [
          "Jeder Auftrag hat seinen Verlauf: wer ihn angelegt, zugewiesen und geliefert hat, und wann",
          "Aufträge aus dem Buchungsformular der Gästeführer erkennt man auf einen Blick",
        ],
      },
      channels: {
        label: "Funkkanäle",
        title: "Jede Führungsanlage, von 1 bis 10.000 Kanälen",
        text: "Sie legen die Kanäle Ihrer Geräte fest, egal welches Modell. Ein Kanal ist nur belegt, solange eine Gruppe die Geräte hat, von der Lieferung bis zur Abholung: Derselbe Kanal kann morgens eine Gruppe und nachmittags eine andere bedienen.",
        points: [
          "Kanal im Auftrag eintragen: EchoBox zeigt sofort, ob er frei ist oder wer ihn nutzt",
          "Zwei Gruppen zur selben Zeit auf demselben Kanal werden blockiert, wenn Ihre Geräte keine Kanäle teilen können",
          "Defekte oder reservierte Kanäle im Handumdrehen ausschließen",
        ],
      },
      riders: {
        label: "Fahrer",
        title: "Auf dem Handy des Fahrers nur das Nötige",
        text: "Fahrer sehen ihre eigenen Aufträge mit Adresse, Nummer des Gästeführers, Anzahl der Geräte und Kanal. Ein Knopf für jeden Schritt, von der Abfahrt bis zur Abholung.",
        points: ["Fehlende Geräte werden bei der Abholung gemeldet", "Das Büro sieht den neuen Status im selben Moment"],
      },
      pickups: {
        label: "Abholungen",
        title: "Kein Gerät bleibt liegen",
        text: "Abholungen bleiben oben auf der Auftragsseite, bis jemand sie erledigt. Ungeplante oder verspätete werden jeden Tag markiert, auch wenn die Tour letzte Woche war.",
        points: ["Wer geliefert hat und wo, mit einem Klick"],
      },
      booking: {
        label: "Buchungen",
        title: "Gästeführer buchen selbst",
        text: "Teilen Sie den Buchungslink Ihrer Firma. Der Gästeführer gibt Gruppenname, Telefon, Anzahl der Geräte, Zeiten und Orte ein, und der Auftrag steht fertig ausgefüllt in Ihrer Liste.",
        points: ["Gästeführer brauchen kein Konto", "Online-Buchungen jederzeit schließen"],
      },
      stats: {
        label: "Dashboard",
        title: "Von Zahlen zu Entscheidungen",
        text: "Mehr als Summen: Das Dashboard vergleicht den Monat mit dem Vormonat und erklärt es in einfachen Worten. Wie viele Geräte Sie an Spitzentagen brauchen, wann mehr Fahrer nötig sind, von welchen Gästeführern Ihr Umsatz abhängt und welche nicht mehr buchen.",
        points: ["Hinweise auf verspätete Abholungen und Lieferungen ohne Fahrer", "Saisonverlauf der letzten 12 Monate zum Planen", "CSV-Export aus dem Kalender"],
      },
    },
    moreTitle: "Außerdem dabei",
    more: [
      { title: "Kalender", text: "Lieferungen und Abholungen jedes Tages, mit Umsatz." },
      { title: "Team und Rollen", text: "Einladungen per E-Mail, Rollen für Admins und Fahrer, und wer gerade im Dienst ist." },
      { title: "Gästeführer-Verzeichnis", text: "Ihre Gästeführer mit Telefon, E-Mail und Notizen." },
      { title: "Getrennte Daten", text: "Jede Firma sieht nur ihre eigenen Aufträge, Fahrer und Gästeführer." },
      { title: "Hell oder dunkel", text: "Jeder wählt das Design, das ihm liegt." },
      { title: "Exporte", text: "Ein PDF des Tages, eine CSV des Monats." },
    ],
  },
  start: {
    label: "Einstieg",
    title: "In drei Schritten startklar",
    steps: [
      { title: "Wir richten Ihre Firma ein", text: "Nach der Demo legen wir Ihre Firma an und laden den Administrator ein. Sie legen die Kanäle Ihrer Geräte fest." },
      { title: "Fahrer einladen", text: "Sie bekommen eine E-Mail, wählen ein Passwort und arbeiten vom Handy aus." },
      { title: "Link teilen", text: "Schicken Sie den Gästeführern Ihren Buchungslink, und die Aufträge kommen von selbst." },
    ],
    cta: "Lieber erst ansehen? Demo vereinbaren",
  },
  faq: {
    label: "Fragen",
    title: "Häufige Fragen",
    items: [
      { q: "Müssen wir etwas installieren?", a: "Nein. EchoBox öffnet sich im Browser auf Computer, Tablet und Handy. Fahrer nutzen es auf dem Handy wie eine normale Website." },
      { q: "Funktioniert es mit unseren Geräten?", a: "Ja, mit jedem Modell: Sie legen die Nummerierung Ihrer Kanäle fest, von 1 bis 10.000, und sperren defekte oder reservierte. Sie entscheiden, ob ein Kanal nur einer Gruppe gleichzeitig dient oder geteilt werden kann." },
      { q: "Müssen sich Gästeführer registrieren?", a: "Nein. Sie nutzen den Buchungslink Ihrer Firma und füllen ein Formular aus, das eine Minute dauert. Der Auftrag ist sofort bei Ihnen." },
      { q: "Sind unsere Daten von anderen Firmen getrennt?", a: "Ja. Jede Firma sieht nur ihre eigenen Aufträge, Fahrer und Gästeführer, und die Trennung wird direkt in der Datenbank durchgesetzt." },
      { q: "In welcher Sprache ist die App?", a: "Die App gibt es auf Italienisch und Englisch; die Sprache wechseln Sie oben in der Kopfzeile. Diese Website gibt es auch auf Deutsch und Französisch: Arbeitet Ihr Team in einer anderen Sprache, schreiben Sie uns." },
      { q: "Was kostet es?", a: "Das hängt davon ab, wie viele Fahrer und Aufträge Sie haben. Erzählen Sie uns von Ihrem Service, und wir schicken Ihnen ein Angebot." },
    ],
  },
  contact: {
    label: "Kontakt",
    title: "Schauen wir uns EchoBox an einem Tag wie Ihrem an",
    subtitle:
      "Schreiben Sie uns, wie viele Geräte Sie verwalten, wie viele Fahrer Sie haben und wie Sie heute organisiert sind. Wir melden uns, um eine Demo zu vereinbaren.",
    direct: "Oder per E-Mail an",
    mailTitle: "Schreiben Sie uns",
    mailText: "Erzählen Sie uns, wie viele Geräte Sie verwalten, wie viele Fahrer Sie haben und wie Sie heute organisiert sind. Wir melden uns, um eine Demo zu vereinbaren.",
    mailCta: "E-Mail an EchoBox",
    name: "Vor- und Nachname",
    email: "E-Mail",
    company: "Firma",
    phone: "Telefon",
    optional: "optional",
    message: "Nachricht",
    messagePlaceholder: "Z. B. wir vermieten 400 Empfänger in Rom mit 4 Fahrern und möchten nicht mehr alles im Gruppenchat organisieren…",
    consentBefore: "Ich habe die ",
    consentLink: "Datenschutzerklärung",
    consentAfter: " gelesen und bin mit einer Kontaktaufnahme einverstanden.",
    submit: "Nachricht senden",
    sending: "Wird gesendet…",
    successTitle: "Nachricht gesendet, vielen Dank.",
    successText: "Wir antworten an die angegebene E-Mail-Adresse.",
    again: "Weitere Nachricht senden",
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
  },
};

const fr: Dict = {
  meta: {
    title: "EchoBox Logistics · Logiciel pour la location d'audioguides",
    description:
      "Commandes, canaux radio, livreurs et retraits des récepteurs au même endroit. Pour les entreprises qui louent des audioguides aux guides et aux groupes.",
  },
  nav: {
    product: "Le produit",
    start: "Démarrer",
    faq: "Questions",
    contact: "Contact",
    demo: "Réserver une démo",
    menu: "Menu",
    language: "Langue",
  },
  hero: {
    kicker: "Web + mobile · pour les loueurs d'audioguides",
    title: "Livraisons et retraits d'audioguides, gérés depuis un seul écran.",
    subtitle:
      "EchoBox est le logiciel web et mobile des entreprises qui louent des récepteurs aux guides et aux groupes. Commandes, canaux radio, livreurs et retraits au même endroit : le bureau voit chaque livraison au moment où elle a lieu, les livreurs ont tout sur leur téléphone, et aucun groupe ne se retrouve sur le canal d'un autre.",
    primary: "Réserver une démo",
    secondary: "Voir le produit",
    note: "Le bureau travaille sur ordinateur, les livreurs sur leur téléphone. Tout dans le navigateur : rien à installer.",
    imageAlt: "L'écran Commandes d'EchoBox avec les livraisons et retraits de la journée",
    phoneAlt: "L'application du livreur sur téléphone, avec les livraisons attribuées",
    webLabel: "Web · bureau",
    mobileLabel: "Mobile · livreurs",
  },
  day: {
    label: "Le problème",
    title: "Une journée ordinaire, avant EchoBox",
    intro: "Les groupes de messagerie et les tableurs tiennent tant que la journée est calme. En haute saison, voilà ce qui arrive :",
    items: [
      {
        time: "07:50",
        text: "Le livreur appelle pour la troisième fois : la livraison au Colisée, c'est 8 h 15 ou 8 h 45 ? Il y a deux messages différents dans le groupe.",
      },
      {
        time: "10:40",
        text: "Deux groupes devant Saint-Pierre sont sur le même canal. Les guides s'entendent mutuellement et la visite tombe à l'eau.",
      },
      {
        time: "18:00",
        text: "Il manque 26 récepteurs au dépôt. Ils étaient au tour de mardi, et personne n'est passé les récupérer.",
      },
    ],
    outro: "EchoBox réunit commandes, canaux et retraits au même endroit, visible par toute l'équipe. Ces appels deviennent inutiles.",
  },
  product: {
    label: "Le produit",
    title: "Toute une journée de travail, de la commande au retour des récepteurs",
    note: "Les écrans montrent des données d'exemple : noms, numéros et adresses sont inventés. L'interface de l'application est en italien.",
    enlarge: "Agrandir",
    close: "Fermer",
    sections: {
      orders: {
        label: "Commandes",
        title: "Toute la journée sur un seul écran",
        text: "Les livraisons et retraits du jour avec horaire, lieu, canal, livreur et chiffre d'affaires. Cherchez un guide, filtrez par statut, passez à la semaine ou au mois, et imprimez un PDF pour l'équipe sur le terrain.",
        points: [
          "Chaque commande garde son historique : qui l'a créée, attribuée, livrée, et quand",
          "Les commandes arrivées par le formulaire des guides se repèrent d'un coup d'œil",
        ],
      },
      channels: {
        label: "Canaux radio",
        title: "Tout système d'audioguide, de 1 à 10 000 canaux",
        text: "Vous configurez les canaux de vos appareils, quel que soit le modèle. Un canal n'est occupé que pendant que le groupe a les récepteurs, de la livraison au retrait : le même canal peut servir un groupe le matin et un autre l'après-midi.",
        points: [
          "Saisissez le canal dans la commande : EchoBox indique aussitôt s'il est libre ou qui l'utilise",
          "Deux groupes sur le même canal au même moment sont bloqués, si vos appareils ne peuvent pas partager les canaux",
          "Canaux défectueux ou réservés exclus en un instant",
        ],
      },
      riders: {
        label: "Livreurs",
        title: "Sur le téléphone du livreur, seulement l'essentiel",
        text: "Le livreur voit les missions qui lui sont attribuées, avec l'adresse, le numéro du guide, le nombre de récepteurs et le canal. Un bouton pour chaque étape, du départ au retrait.",
        points: ["Les récepteurs manquants sont signalés au retrait", "Le bureau voit le nouveau statut au même moment"],
      },
      pickups: {
        label: "Retraits",
        title: "Aucun récepteur oublié",
        text: "Les retraits restent en haut de la page des commandes jusqu'à ce que quelqu'un les clôture. Ceux sans date ou en retard sont signalés chaque jour, même si la visite date de la semaine dernière.",
        points: ["Qui a livré, et où, en un clic"],
      },
      booking: {
        label: "Réservations",
        title: "Les guides réservent eux-mêmes",
        text: "Partagez le lien de réservation de votre entreprise. Le guide saisit le nom du groupe, son téléphone, le nombre de récepteurs, les horaires et les lieux : la commande arrive dans votre liste, déjà remplie.",
        points: ["Pas de compte à créer pour le guide", "Fermez les réservations en ligne quand vous voulez"],
      },
      stats: {
        label: "Tableau de bord",
        title: "Des chiffres aux décisions",
        text: "Plus que des totaux : le tableau de bord compare le mois au précédent et l'explique en mots simples. Combien de récepteurs il faut les jours de pointe, quand il faut plus de livreurs, de quels guides dépend votre chiffre d'affaires et lesquels ne réservent plus.",
        points: ["Alertes sur les retraits en retard et les livraisons sans livreur", "Douze mois de saisonnalité pour planifier", "Export CSV depuis le calendrier"],
      },
    },
    moreTitle: "Également inclus",
    more: [
      { title: "Calendrier", text: "Les livraisons et retraits de chaque jour, avec le chiffre d'affaires." },
      { title: "Équipe et rôles", text: "Invitations par e-mail, rôles administrateur et livreur, et qui est en service maintenant." },
      { title: "Annuaire des guides", text: "Les guides avec qui vous travaillez, avec téléphone, e-mail et notes." },
      { title: "Données séparées", text: "Chaque entreprise ne voit que ses commandes, livreurs et guides." },
      { title: "Clair ou sombre", text: "Chacun choisit le thème qu'il préfère." },
      { title: "Exports", text: "Un PDF de la journée, un CSV du mois." },
    ],
  },
  start: {
    label: "Démarrer",
    title: "Opérationnel en trois étapes",
    steps: [
      { title: "Nous créons votre entreprise", text: "Après la démo, nous créons votre entreprise et invitons son administrateur. Vous configurez les canaux de vos audioguides." },
      { title: "Invitez vos livreurs", text: "Ils reçoivent un e-mail, choisissent un mot de passe et travaillent depuis leur téléphone." },
      { title: "Partagez votre lien", text: "Envoyez votre lien de réservation aux guides : les commandes arrivent toutes seules." },
    ],
    cta: "Envie de le voir d'abord ? Réservez une démo",
  },
  faq: {
    label: "Questions",
    title: "Questions fréquentes",
    items: [
      { q: "Faut-il installer quelque chose ?", a: "Non. EchoBox s'ouvre dans le navigateur, sur ordinateur, tablette et téléphone. Les livreurs l'utilisent sur leur téléphone comme n'importe quel site." },
      { q: "Est-ce compatible avec nos audioguides ?", a: "Oui, avec tous les modèles : indiquez la numérotation de vos canaux, de 1 à 10 000, et désactivez ceux qui sont défectueux ou réservés. Vous choisissez si un canal sert un seul groupe à la fois ou peut être partagé." },
      { q: "Les guides doivent-ils s'inscrire ?", a: "Non. Ils utilisent le lien de réservation de votre entreprise et remplissent un formulaire d'une minute. La commande vous parvient aussitôt." },
      { q: "Nos données sont-elles séparées de celles des autres entreprises ?", a: "Oui. Chaque entreprise ne voit que ses commandes, livreurs et guides, et la séparation est appliquée dans la base de données elle-même." },
      { q: "Dans quelle langue est l'application ?", a: "L'application est en italien et en anglais, et on change de langue depuis l'en-tête. Ce site existe aussi en allemand et en français : si votre équipe travaille dans une autre langue, écrivez-nous." },
      { q: "Combien ça coûte ?", a: "Cela dépend du nombre de livreurs et de commandes. Décrivez-nous votre service et nous vous enverrons une offre." },
    ],
  },
  contact: {
    label: "Contact",
    title: "Regardons EchoBox sur une journée comme la vôtre",
    subtitle:
      "Dites-nous combien de récepteurs vous gérez, combien de livreurs vous avez et comment vous vous organisez aujourd'hui. Nous revenons vers vous pour fixer une démo.",
    direct: "Ou écrivez à",
    mailTitle: "Écrivez-nous",
    mailText: "Dites-nous combien de récepteurs vous gérez, combien de livreurs vous avez et comment vous vous organisez aujourd'hui. Nous revenons vers vous pour fixer une démo.",
    mailCta: "Écrire à EchoBox",
    name: "Prénom et nom",
    email: "E-mail",
    company: "Entreprise",
    phone: "Téléphone",
    optional: "facultatif",
    message: "Message",
    messagePlaceholder: "Ex. nous louons 400 récepteurs à Rome avec 4 livreurs et voulons arrêter de tout organiser par messagerie…",
    consentBefore: "J'ai lu la ",
    consentLink: "politique de confidentialité",
    consentAfter: " et j'accepte d'être recontacté.",
    submit: "Envoyer le message",
    sending: "Envoi en cours…",
    successTitle: "Message envoyé, merci.",
    successText: "Nous vous répondrons à l'adresse e-mail indiquée.",
    again: "Envoyer un autre message",
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
