/**
 * Text of the public "delete your account and data" page (/delete-account).
 * Google Play asks for this URL in the Data safety form. It must name the app as it appears on the
 * store listing, show the steps to request deletion, and say which data is deleted, which is kept
 * and for how long. Keep the Play listing name and `appName` in configuration.ts identical.
 *
 * Italian is the reference; the other languages have the same shape.
 */
import type { Lang } from "./i18n";

export interface DeleteContent {
  meta: { title: string; description: string };
  home: string;
  title: string;
  lead: string;
  stepsTitle: string;
  steps: { title: string; text: string }[];
  mail: { button: string; subject: string; body: string };
  who: { title: string; items: string[] };
  deletedTitle: string;
  deleted: string[];
  keptTitle: string;
  keptIntro: string;
  kept: { what: string; why: string; how: string }[];
  timingTitle: string;
  timing: string[];
  contactTitle: string;
  contactText: string;
  updated: string;
  footerLink: string;
}

const it: DeleteContent = {
  meta: {
    title: "Elimina il tuo account e i tuoi dati · EchoBox Logistics",
    description:
      "Come chiedere l'eliminazione dell'account e dei dati personali dell'app EchoBox Logistics: passaggi, dati eliminati, dati conservati e tempi.",
  },
  home: "Torna al sito",
  title: "Elimina il tuo account e i tuoi dati",
  lead: "Questa pagina riguarda l'app EchoBox Logistics (web e mobile). Qui trovi come chiedere l'eliminazione del tuo account, quali dati cancelliamo, quali conserviamo e per quanto tempo.",
  stepsTitle: "Come chiedere l'eliminazione",
  steps: [
    {
      title: "Scrivici dall'indirizzo del tuo account",
      text: "Invia un'e-mail a support@echoboxlogistics.com dall'indirizzo con cui accedi a EchoBox Logistics, con oggetto «Eliminazione account EchoBox Logistics». Indica il tuo nome, il nome dell'azienda per cui lavori e se vuoi eliminare solo il tuo account o anche i dati dell'intera azienda.",
    },
    {
      title: "Verifichiamo che la richiesta sia tua",
      text: "Rispondiamo alla stessa e-mail per confermare l'identità. Per eliminare i dati di un'intera azienda serve la conferma di un amministratore dell'azienda. Non ti chiediamo mai la password.",
    },
    {
      title: "Eliminiamo e ti confermiamo",
      text: "Cancelliamo l'account e i dati indicati qui sotto entro 30 giorni dalla richiesta, di solito molto prima, e ti scriviamo quando è fatto.",
    },
  ],
  mail: {
    button: "Scrivi la richiesta",
    subject: "Eliminazione account EchoBox Logistics",
    body: "Vorrei eliminare il mio account EchoBox Logistics.\n\nNome:\nAzienda:\nVoglio eliminare: solo il mio account / anche i dati dell'azienda\n",
  },
  who: {
    title: "Chi può chiedere",
    items: [
      "**Rider e collaboratori** invitati da un'azienda: possono chiedere l'eliminazione del proprio account.",
      "**Amministratori**: possono chiedere l'eliminazione del proprio account oppure di tutta l'azienda (ordini, squadra, impostazioni).",
      "**Guide e clienti** che hanno prenotato tramite il link di un'azienda e non hanno un account: possono chiedere la cancellazione dei propri recapiti (nome, telefono, e-mail) scrivendo allo stesso indirizzo. Se possibile indica l'azienda a cui hai fatto la prenotazione.",
    ],
  },
  deletedTitle: "Dati che eliminiamo",
  deleted: [
    "Account di accesso: indirizzo e-mail, password (conservata in forma cifrata) e dati di accesso.",
    "Profilo: nome, telefono, foto, ruolo e data dell'ultimo accesso.",
    "Inviti ancora in sospeso a tuo nome.",
    "Messaggi inviati dal modulo di contatto del sito.",
    "Per le guide e i clienti senza account: nome, telefono ed e-mail registrati nella rubrica dell'azienda.",
    "Se elimini l'intera azienda: ordini, canali, ritiri, rubrica, squadra e impostazioni dell'azienda.",
  ],
  keptTitle: "Dati che possiamo conservare",
  keptIntro: "Alcuni dati restano perché servono all'azienda per la contabilità e per eventuali contestazioni, oppure perché la legge ci obbliga a conservarli.",
  kept: [
    {
      what: "Storico degli ordini dell'azienda (consegne, ritiri, canali, importi)",
      why: "Contabilità, fatturazione e gestione di eventuali contestazioni dell'azienda.",
      how: "Il tuo nome viene tolto: il rider assegnato diventa «utente eliminato». Resta fino a 10 anni se serve per obblighi contabili, poi viene cancellato.",
    },
    {
      what: "Dati di fatturazione e registri richiesti dalla legge",
      why: "Obblighi fiscali e contabili italiani.",
      how: "Fino a 10 anni, solo per quello scopo.",
    },
    {
      what: "Copie di sicurezza (backup)",
      why: "Ripristino in caso di guasto.",
      how: "I dati eliminati escono dai backup man mano che questi vengono sostituiti, entro 35 giorni circa.",
    },
  ],
  timingTitle: "Tempi",
  timing: [
    "Rispondiamo alla richiesta entro pochi giorni lavorativi.",
    "L'eliminazione è completata entro 30 giorni dalla richiesta.",
    "L'eliminazione è definitiva: non possiamo recuperare l'account dopo la cancellazione. Se in futuro vuoi usare di nuovo EchoBox Logistics, l'azienda deve invitarti di nuovo.",
  ],
  contactTitle: "Domande",
  contactText: "Per qualsiasi dubbio sulla tua privacy scrivi a",
  updated: "Ultimo aggiornamento: novembre 2026",
  footerLink: "Elimina account",
};

const en: DeleteContent = {
  meta: {
    title: "Delete your account and data · EchoBox Logistics",
    description:
      "How to request deletion of your EchoBox Logistics account and personal data: steps, what is deleted, what is kept and for how long.",
  },
  home: "Back to the website",
  title: "Delete your account and data",
  lead: "This page covers the EchoBox Logistics app (web and mobile). It explains how to request deletion of your account, which data we delete, which data we keep and for how long.",
  stepsTitle: "How to request deletion",
  steps: [
    {
      title: "E-mail us from your account address",
      text: "Send an e-mail to support@echoboxlogistics.com from the address you use to sign in to EchoBox Logistics, with the subject “EchoBox Logistics account deletion”. Give your name, the company you work for, and whether you want only your account deleted or the whole company's data too.",
    },
    {
      title: "We check the request is yours",
      text: "We reply to the same e-mail to confirm your identity. Deleting a whole company's data needs confirmation from one of the company's administrators. We never ask for your password.",
    },
    {
      title: "We delete and confirm",
      text: "We delete the account and the data listed below within 30 days of your request, usually much sooner, and write to you when it is done.",
    },
  ],
  mail: {
    button: "Write the request",
    subject: "EchoBox Logistics account deletion",
    body: "I would like to delete my EchoBox Logistics account.\n\nName:\nCompany:\nI want to delete: only my account / also the company's data\n",
  },
  who: {
    title: "Who can ask",
    items: [
      "**Riders and team members** invited by a company can ask to delete their own account.",
      "**Administrators** can ask to delete their own account or the whole company (orders, team, settings).",
      "**Guides and customers** who booked through a company's link and have no account can ask us to delete their contact details (name, phone, e-mail) by writing to the same address. Please mention the company you booked with if you can.",
    ],
  },
  deletedTitle: "Data we delete",
  deleted: [
    "Sign-in account: e-mail address, password (stored encrypted) and sign-in data.",
    "Profile: name, phone number, photo, role and last sign-in date.",
    "Pending invitations in your name.",
    "Messages sent through the website's contact form.",
    "For guides and customers without an account: the name, phone and e-mail saved in the company's address book.",
    "If you delete the whole company: its orders, channels, pickups, address book, team and settings.",
  ],
  keptTitle: "Data we may keep",
  keptIntro: "Some data stays because the company needs it for its accounts and for any disputes, or because the law requires us to keep it.",
  kept: [
    {
      what: "The company's order history (deliveries, pickups, channels, amounts)",
      why: "Bookkeeping, invoicing and handling any dispute of the company.",
      how: "Your name is removed: the assigned rider becomes “deleted user”. It stays for up to 10 years where needed for accounting obligations, then it is deleted.",
    },
    {
      what: "Invoicing data and records required by law",
      why: "Italian tax and accounting obligations.",
      how: "Up to 10 years, only for that purpose.",
    },
    {
      what: "Backups",
      why: "Recovery after a failure.",
      how: "Deleted data leaves the backups as they are replaced, within about 35 days.",
    },
  ],
  timingTitle: "Timing",
  timing: [
    "We answer the request within a few working days.",
    "Deletion is completed within 30 days of the request.",
    "Deletion is permanent: we cannot restore the account afterwards. If you want to use EchoBox Logistics again, the company has to invite you again.",
  ],
  contactTitle: "Questions",
  contactText: "For any question about your privacy write to",
  updated: "Last updated: November 2026",
  footerLink: "Delete account",
};

const de: DeleteContent = {
  meta: {
    title: "Konto und Daten löschen · EchoBox Logistics",
    description:
      "So beantragen Sie die Löschung Ihres EchoBox-Logistics-Kontos und Ihrer personenbezogenen Daten: Schritte, gelöschte und aufbewahrte Daten, Fristen.",
  },
  home: "Zurück zur Website",
  title: "Konto und Daten löschen",
  lead: "Diese Seite betrifft die App EchoBox Logistics (Web und mobil). Sie erklärt, wie Sie die Löschung Ihres Kontos beantragen, welche Daten wir löschen, welche wir aufbewahren und wie lange.",
  stepsTitle: "So beantragen Sie die Löschung",
  steps: [
    {
      title: "Schreiben Sie uns von Ihrer Konto-Adresse",
      text: "Senden Sie eine E-Mail an support@echoboxlogistics.com von der Adresse, mit der Sie sich bei EchoBox Logistics anmelden, mit dem Betreff „Kontolöschung EchoBox Logistics“. Nennen Sie Ihren Namen, das Unternehmen, für das Sie arbeiten, und ob nur Ihr Konto oder auch die Daten des gesamten Unternehmens gelöscht werden sollen.",
    },
    {
      title: "Wir prüfen, dass die Anfrage von Ihnen stammt",
      text: "Wir antworten an dieselbe Adresse, um Ihre Identität zu bestätigen. Für die Löschung der Daten eines ganzen Unternehmens ist die Bestätigung einer Administratorin oder eines Administrators des Unternehmens nötig. Wir fragen nie nach Ihrem Passwort.",
    },
    {
      title: "Wir löschen und bestätigen",
      text: "Wir löschen das Konto und die unten genannten Daten innerhalb von 30 Tagen nach Ihrer Anfrage, meist deutlich früher, und schreiben Ihnen, sobald es erledigt ist.",
    },
  ],
  mail: {
    button: "Anfrage schreiben",
    subject: "Kontolöschung EchoBox Logistics",
    body: "Ich möchte mein EchoBox-Logistics-Konto löschen.\n\nName:\nUnternehmen:\nIch möchte löschen: nur mein Konto / auch die Daten des Unternehmens\n",
  },
  who: {
    title: "Wer kann die Löschung beantragen",
    items: [
      "**Fahrer und Teammitglieder**, die von einem Unternehmen eingeladen wurden, können die Löschung ihres eigenen Kontos beantragen.",
      "**Administratoren** können die Löschung ihres eigenen Kontos oder des gesamten Unternehmens beantragen (Aufträge, Team, Einstellungen).",
      "**Guides und Kunden**, die über den Link eines Unternehmens gebucht haben und kein Konto besitzen, können die Löschung ihrer Kontaktdaten (Name, Telefon, E-Mail) an dieselbe Adresse beantragen. Nennen Sie nach Möglichkeit das Unternehmen, bei dem Sie gebucht haben.",
    ],
  },
  deletedTitle: "Daten, die wir löschen",
  deleted: [
    "Anmeldekonto: E-Mail-Adresse, Passwort (verschlüsselt gespeichert) und Anmeldedaten.",
    "Profil: Name, Telefonnummer, Foto, Rolle und Datum der letzten Anmeldung.",
    "Offene Einladungen auf Ihren Namen.",
    "Nachrichten aus dem Kontaktformular der Website.",
    "Bei Guides und Kunden ohne Konto: Name, Telefon und E-Mail im Adressbuch des Unternehmens.",
    "Wenn Sie das gesamte Unternehmen löschen: dessen Aufträge, Kanäle, Abholungen, Adressbuch, Team und Einstellungen.",
  ],
  keptTitle: "Daten, die wir aufbewahren können",
  keptIntro: "Einige Daten bleiben bestehen, weil das Unternehmen sie für seine Buchhaltung und für mögliche Streitfälle braucht oder weil das Gesetz die Aufbewahrung verlangt.",
  kept: [
    {
      what: "Auftragshistorie des Unternehmens (Lieferungen, Abholungen, Kanäle, Beträge)",
      why: "Buchhaltung, Rechnungsstellung und Klärung möglicher Streitfälle des Unternehmens.",
      how: "Ihr Name wird entfernt: Der zugewiesene Fahrer wird zu „gelöschter Nutzer“. Die Daten bleiben bis zu 10 Jahre, wenn buchhalterische Pflichten dies verlangen, und werden dann gelöscht.",
    },
    {
      what: "Rechnungsdaten und gesetzlich vorgeschriebene Aufzeichnungen",
      why: "Italienische steuer- und buchhaltungsrechtliche Pflichten.",
      how: "Bis zu 10 Jahre, nur für diesen Zweck.",
    },
    {
      what: "Sicherungskopien (Backups)",
      why: "Wiederherstellung nach einer Störung.",
      how: "Gelöschte Daten verschwinden aus den Backups, sobald diese ersetzt werden, nach etwa 35 Tagen.",
    },
  ],
  timingTitle: "Fristen",
  timing: [
    "Wir antworten innerhalb weniger Werktage.",
    "Die Löschung ist innerhalb von 30 Tagen nach der Anfrage abgeschlossen.",
    "Die Löschung ist endgültig: Wir können das Konto danach nicht wiederherstellen. Wenn Sie EchoBox Logistics wieder nutzen möchten, muss das Unternehmen Sie erneut einladen.",
  ],
  contactTitle: "Fragen",
  contactText: "Bei Fragen zum Datenschutz schreiben Sie an",
  updated: "Zuletzt aktualisiert: November 2026",
  footerLink: "Konto löschen",
};

const fr: DeleteContent = {
  meta: {
    title: "Supprimer votre compte et vos données · EchoBox Logistics",
    description:
      "Comment demander la suppression de votre compte EchoBox Logistics et de vos données personnelles : étapes, données supprimées, données conservées et délais.",
  },
  home: "Retour au site",
  title: "Supprimer votre compte et vos données",
  lead: "Cette page concerne l'application EchoBox Logistics (web et mobile). Elle explique comment demander la suppression de votre compte, quelles données nous supprimons, lesquelles nous conservons et pour combien de temps.",
  stepsTitle: "Comment demander la suppression",
  steps: [
    {
      title: "Écrivez-nous depuis l'adresse de votre compte",
      text: "Envoyez un e-mail à support@echoboxlogistics.com depuis l'adresse avec laquelle vous vous connectez à EchoBox Logistics, avec l'objet « Suppression de compte EchoBox Logistics ». Indiquez votre nom, l'entreprise pour laquelle vous travaillez et si vous voulez supprimer seulement votre compte ou aussi les données de toute l'entreprise.",
    },
    {
      title: "Nous vérifions que la demande vient de vous",
      text: "Nous répondons à la même adresse pour confirmer votre identité. Supprimer les données d'une entreprise entière demande la confirmation d'un administrateur de l'entreprise. Nous ne demandons jamais votre mot de passe.",
    },
    {
      title: "Nous supprimons et nous confirmons",
      text: "Nous supprimons le compte et les données listées ci-dessous dans les 30 jours suivant votre demande, le plus souvent bien avant, et nous vous écrivons quand c'est fait.",
    },
  ],
  mail: {
    button: "Écrire la demande",
    subject: "Suppression de compte EchoBox Logistics",
    body: "Je souhaite supprimer mon compte EchoBox Logistics.\n\nNom :\nEntreprise :\nJe veux supprimer : seulement mon compte / aussi les données de l'entreprise\n",
  },
  who: {
    title: "Qui peut demander",
    items: [
      "**Les livreurs et membres de l'équipe** invités par une entreprise peuvent demander la suppression de leur propre compte.",
      "**Les administrateurs** peuvent demander la suppression de leur propre compte ou de toute l'entreprise (commandes, équipe, réglages).",
      "**Les guides et clients** qui ont réservé via le lien d'une entreprise et n'ont pas de compte peuvent demander la suppression de leurs coordonnées (nom, téléphone, e-mail) en écrivant à la même adresse. Si possible, indiquez l'entreprise auprès de laquelle vous avez réservé.",
    ],
  },
  deletedTitle: "Données que nous supprimons",
  deleted: [
    "Compte de connexion : adresse e-mail, mot de passe (stocké chiffré) et données de connexion.",
    "Profil : nom, téléphone, photo, rôle et date de la dernière connexion.",
    "Invitations en attente à votre nom.",
    "Messages envoyés par le formulaire de contact du site.",
    "Pour les guides et clients sans compte : nom, téléphone et e-mail enregistrés dans le carnet d'adresses de l'entreprise.",
    "Si vous supprimez toute l'entreprise : ses commandes, canaux, reprises, carnet d'adresses, équipe et réglages.",
  ],
  keptTitle: "Données que nous pouvons conserver",
  keptIntro: "Certaines données restent parce que l'entreprise en a besoin pour sa comptabilité et pour d'éventuels litiges, ou parce que la loi nous oblige à les conserver.",
  kept: [
    {
      what: "Historique des commandes de l'entreprise (livraisons, reprises, canaux, montants)",
      why: "Comptabilité, facturation et traitement d'éventuels litiges de l'entreprise.",
      how: "Votre nom est retiré : le livreur affecté devient « utilisateur supprimé ». Les données restent jusqu'à 10 ans si des obligations comptables l'exigent, puis sont supprimées.",
    },
    {
      what: "Données de facturation et registres exigés par la loi",
      why: "Obligations fiscales et comptables italiennes.",
      how: "Jusqu'à 10 ans, uniquement pour cet objectif.",
    },
    {
      what: "Sauvegardes",
      why: "Restauration après une panne.",
      how: "Les données supprimées disparaissent des sauvegardes à mesure qu'elles sont remplacées, en 35 jours environ.",
    },
  ],
  timingTitle: "Délais",
  timing: [
    "Nous répondons à la demande sous quelques jours ouvrés.",
    "La suppression est terminée dans les 30 jours suivant la demande.",
    "La suppression est définitive : nous ne pouvons pas restaurer le compte ensuite. Si vous voulez utiliser de nouveau EchoBox Logistics, l'entreprise doit vous inviter à nouveau.",
  ],
  contactTitle: "Questions",
  contactText: "Pour toute question sur votre vie privée, écrivez à",
  updated: "Dernière mise à jour : novembre 2026",
  footerLink: "Supprimer le compte",
};

export const DELETE_CONTENT: Record<Lang, DeleteContent> = { it, en, de, fr };
