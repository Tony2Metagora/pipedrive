/**
 * Templates de messages (email & SMS) pour la prospection.
 * Basé sur le fichier "Messages type.xlsx" de Tony.
 */

export interface MessageTemplate {
  id: string;
  type: "email" | "sms";
  name: string;
  context: string;
  content: string;
}

export const TEMPLATES: MessageTemplate[] = [
  // ─── SMS / WhatsApp ────────────────────────────────────
  {
    id: "sms-premier-contact",
    type: "sms",
    name: "Premier contact – WhatsApp",
    context: "Premier message WhatsApp après un événement/rencontre",
    content: `Hello {prenom},

C'est Tony de Metagora. Nous nous étions rencontrés au {evenement}, j'espère que tout va bien de ton côté.

Je te contacte pour organiser prochainement une démo de ce que nous faisons sur la formation des conseillers de vente.

J'ai pas mal de choses récentes à te montrer. Aurais-tu une disponibilité dans les 2 prochaines semaines ?

Très bonne journée à toi`,
  },
  {
    id: "sms-relance-demo",
    type: "sms",
    name: "Relance démo – WhatsApp",
    context: "Relance après un premier contact pour planifier une démo",
    content: `Hello {prenom},

C'est Tony de Metagora. Je reviens vers toi suite à notre échange. J'aimerais te partager nos dernières nouveautés sur le client virtuel et le coach virtuel pour le retail.

En visio ou autour d'un café si ton temps le permet.

Très belle journée à toi

Tony`,
  },
  {
    id: "sms-post-salon",
    type: "sms",
    name: "Post-salon / événement – WhatsApp",
    context: "Message après un salon ou dîner professionnel",
    content: `Bonjour {prenom},

Je suis Tony de Metagora, j'espère que l'événement ne vous a pas trop fatigué ! Merci d'être venu(e).

Je serais ravi de vous partager ce que nous faisons sur le client virtuel et plus récemment le coach virtuel pour le retail.

En visio ou autour d'un café / petit déjeuner si votre temps le permet.

Très belle journée à vous

Tony`,
  },
  {
    id: "sms-integration-yoobic",
    type: "sms",
    name: "Accroche intégration Yoobic – WhatsApp",
    context: "Pour les prospects qui utilisent Yoobic ou des outils opérationnels magasin",
    content: `Hello {prenom},

C'est Tony de Metagora. Je te contacte parce qu'on peut s'intégrer maintenant directement à Yoobic.

J'échangeais aussi récemment sur des solutions de Business Intelligence dans lesquelles on peut intégrer les données Metagora.

Je te propose un café prochainement de visu idéalement pour parler de ces sujets 🙂

Très bonne journée.

Tony`,
  },

  // ─── Emails ────────────────────────────────────────────
  {
    id: "email-followup-demo",
    type: "email",
    name: "Follow-up après démo",
    context: "Email de suivi après une première démo",
    content: `Hello {prenom},

C'est Tony de Metagora. Je reviens vers toi pour planifier un meeting pour échanger sur Metagora et l'écosystème d'excellence opérationnelle magasin.

Vu que tu es sur ces sujets d'intégration et sur les enjeux de formation je serai ravi d'échanger avec toi.

Aurais-tu une dispo prochainement ?

Très bonne journée`,
  },
  {
    id: "email-proposition-commerciale",
    type: "email",
    name: "Proposition commerciale",
    context: "Email avec proposition tarifaire suite à une discussion avancée",
    content: `Bonjour {prenom},

Suite à notre échange, je reviens vers vous avec notre proposition.

Pour simplifier l'échange et accélérer je vous propose de simplifier l'offre :
- Setup : à définir selon le périmètre
- Abonnement mensuel par magasin sur 6 mois

Notre priorité est de lancer une expérimentation à fort ROI avec vous et nous sommes à votre disposition pour revoir le cadrage du POC si ça vous permet de faire sauter certains freins au lancement.

Je vous partage aussi notre nouvel outil de coaching vendeur qui va entrer en test : https://www.youtube.com/watch?v=HrwISMqdfSo

Très bonne journée à vous,

Tony`,
  },
  {
    id: "email-relance-froide",
    type: "email",
    name: "Relance froide",
    context: "Relance d'un prospect qui n'a pas répondu",
    content: `Bonjour {prenom},

J'espère que tout va bien de votre côté. Je me permets de revenir vers vous concernant Metagora et notre solution de formation immersive par l'IA pour les équipes retail.

Nous avons récemment lancé de nouvelles fonctionnalités qui pourraient vous intéresser, notamment notre coach virtuel IA.

Seriez-vous disponible pour un échange rapide dans les prochains jours ?

Bien cordialement,

Tony`,
  },
  {
    id: "email-intro-rh",
    type: "email",
    name: "Introduction DRH / Responsable Formation",
    context: "Premier email pour un contact RH ou formation",
    content: `Bonjour {prenom},

Je suis Tony, cofondateur de Metagora. Nous développons une solution de formation immersive par IA qui permet aux conseillers de vente de s'entraîner avec des clients virtuels ultra-réalistes.

Nos résultats : +30% de performance commerciale, déploiement en 1 jour, 100% de taux de complétion.

Nous travaillons déjà avec plusieurs grandes maisons du luxe et du retail et je serais ravi de vous présenter notre approche.

Auriez-vous 30 minutes pour un échange ?

Bien cordialement,

Tony
Metagora – metagora.tech`,
  },
];

/** Accroches par secteur / temporalité */
export const ACCROCHES = [
  { secteur: "Boisson / Food", accroche: "Période de Pâques / accords" },
  { secteur: "Luxe / Bijoux", accroche: "Fête des mères" },
];

/** Récupère les templates par type */
export function getTemplatesByType(type: "email" | "sms"): MessageTemplate[] {
  return TEMPLATES.filter((t) => t.type === type);
}

/** Récupère un template par ID */
export function getTemplateById(id: string): MessageTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
