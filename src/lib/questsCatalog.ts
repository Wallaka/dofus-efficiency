/**
 * Bundled catalog of Dofus repeatable quests, adapted from the community list at
 * https://tenmalexis.github.io/quetes-repetables/ (source data © its author).
 * Lets the Quêtes page seed a routine without typing every quest by hand.
 *
 * "note" is the free-text reward description ("annexe") — mostly parchemins /
 * consommables that aren't market-priced, so it is shown as-is; a user can still
 * attach a priced resource reward for the few that are real materials.
 * "variantGroup" marks a zone where only one quest per day is doable (alignment /
 * profession choice), so routine totals count only its best quest, not all of them.
 */
import type { QuestPeriod } from "./quests";

export interface QuestSeed {
  name: string;
  period: QuestPeriod;
  zone: string;
  kamas: number;
  url?: string;
  note?: string;
  variable?: boolean;
  variantGroup?: string;
}

export const QUESTS_CATALOG: QuestSeed[] = [
  { name: "Bien velu, c'est Kérubim", period: "daily", zone: "Astrub", kamas: 0, url: "https://www.dofuspourlesnoobs.com/bien-velu-cest-kerubim.html", note: "10 poils de Kérubim" },
  { name: "Il faut que ça brille", period: "weekly", zone: "Astrub", kamas: 43980, url: "https://www.dofuspourlesnoobs.com/il-faut-que-cha-brille.html" },
  { name: "Calendrier de l'almanax", period: "daily", zone: "Astrub", kamas: 0, url: "https://www.dofuspourlesnoobs.com/calendrier-de-lalmanax.html", note: "Gain kamas variable", variable: true },
  { name: "Des fleurs épineuses", period: "daily", zone: "Astrub", kamas: 2380, url: "https://www.dofuspourlesnoobs.com/des-fleurs-epineuses.html", note: "1 Parchemin d'Alchimiste" },
  { name: "De la viande de dragodinde pour la tablée d'Allister", period: "daily", zone: "Amakna", kamas: 4105, url: "https://www.dofuspourlesnoobs.com/de-la-viande-de-dragodinde-pour-la-tablee-d-allister.html", note: "15 parcho chasseur" },
  { name: "La cute école fantastique", period: "weekly", zone: "Amakna", kamas: 43980, url: "https://www.dofuspourlesnoobs.com/leacutecole-fantastique.html", note: "10 Étoffes Mystérieuse" },
  { name: "Chargez !", period: "daily", zone: "Bonta / Neutre / Brak", kamas: 4780, url: "https://www.dofuspourlesnoobs.com/chargez.html", note: "5 Parchemin d'Éleveur", variantGroup: "bonta" },
  { name: "Piétine titine", period: "daily", zone: "Bonta / Neutre / Brak", kamas: 4780, url: "https://www.dofuspourlesnoobs.com/pietine-titine.html", note: "5 Parchemin d'Éleveur", variantGroup: "bonta" },
  { name: "Allez Hue !", period: "daily", zone: "Bonta / Neutre / Brak", kamas: 4780, url: "https://www.dofuspourlesnoobs.com/allez-hue.html", note: "5 Parchemin d'Éleveur", variantGroup: "bonta" },
  { name: "Collier de perles en vinaigrette", period: "daily", zone: "Sufokia", kamas: 2220, url: "https://www.dofuspourlesnoobs.com/collier-de-perles-en-vinaigrette.html" },
  { name: "Pattes aux oeufs frais", period: "daily", zone: "Sufokia", kamas: 4760, url: "https://www.dofuspourlesnoobs.com/pattes-aux-oeufs-frais.html" },
  { name: "C'est du costaud", period: "daily", zone: "Sufokia", kamas: 5810, url: "https://www.dofuspourlesnoobs.com/cest-du-costaud.html" },
  { name: "Comment se mettre au jus", period: "daily", zone: "Sufokia", kamas: 8210, url: "https://www.dofuspourlesnoobs.com/comment-se-mettre-au-jus.html" },
  { name: "Cueillir, c'est votre métier", period: "daily", zone: "Quêtes Métiers (Sufokia)", kamas: 552, url: "https://www.dofuspourlesnoobs.com/cueillir-c-est-votre-metier.html", note: "1 Parchemin d'Alchimiste", variantGroup: "metiers" },
  { name: "Bûcher, c'est votre métier", period: "daily", zone: "Quêtes Métiers (Sufokia)", kamas: 552, url: "https://www.dofuspourlesnoobs.com/bucher-c-est-votre-metier.html", note: "1 Parchemin de Bucheron", variantGroup: "metiers" },
  { name: "Chasser, c'est votre métier", period: "daily", zone: "Quêtes Métiers (Sufokia)", kamas: 552, url: "https://www.dofuspourlesnoobs.com/chasser-c-est-votre-metier.html", note: "1 Parchemin de Chasseur", variantGroup: "metiers" },
  { name: "Piocher, c'est votre métier", period: "daily", zone: "Quêtes Métiers (Sufokia)", kamas: 552, url: "https://www.dofuspourlesnoobs.com/piocher-c-est-votre-metier.html", note: "1 Parchemin de Mineur", variantGroup: "metiers" },
  { name: "Faucher, c'est votre métier", period: "daily", zone: "Quêtes Métiers (Sufokia)", kamas: 552, url: "https://www.dofuspourlesnoobs.com/faucher-cest-votre-meacutetier.html", note: "1 Parchemin de Paysan", variantGroup: "metiers" },
  { name: "Pêcher, c'est votre métier", period: "daily", zone: "Quêtes Métiers (Sufokia)", kamas: 552, url: "https://www.dofuspourlesnoobs.com/pecher-c-est-votre-metier.html", note: "1 Parchemin de Pêcheur", variantGroup: "metiers" },
  { name: "La chasse de Lily", period: "daily", zone: "Île Wabbit", kamas: 3480, url: "https://www.dofuspourlesnoobs.com/la-chasse-de-lily.html", note: "1x Cawotte" },
  { name: "Un peu de Wab", period: "daily", zone: "Île Wabbit", kamas: 4780, url: "https://www.dofuspourlesnoobs.com/un-peu-de-wab.html", note: "1x Cawotte" },
  { name: "Ça rend aimable", period: "daily", zone: "Île Wabbit", kamas: 4780, url: "https://www.dofuspourlesnoobs.com/ccedila-rend-aimable.html", note: "1x Cawotte" },
  { name: "Les pwinces déchus", period: "daily", zone: "Île Wabbit", kamas: 4780, url: "https://www.dofuspourlesnoobs.com/les-pwinces-deacutechus.html", note: "1x Cawotte" },
  { name: "Course polaire", period: "daily", zone: "Montagne Koalak", kamas: 11010, url: "https://www.dofuspourlesnoobs.com/course-polaire.html", note: "Consommables" },
  { name: "Épicerie fine", period: "daily", zone: "Montagne Koalak", kamas: 11010, url: "https://www.dofuspourlesnoobs.com/eacutepicerie-fine.html", note: "Consommables" },
  { name: "Charger la mule", period: "daily", zone: "Montagne Koalak", kamas: 17810, url: "https://www.dofuspourlesnoobs.com/charger-la-mule.html", note: "Consommables" },
  { name: "L'ivresse des profondeurs", period: "daily", zone: "Base Abyssale Sufokia", kamas: 21990, url: "https://www.dofuspourlesnoobs.com/livresse-des-profondeurs.html" },
  { name: "Pêche aux krabouilleurs", period: "daily", zone: "Base Abyssale Sufokia", kamas: 43980, url: "https://www.dofuspourlesnoobs.com/pecircche-aux-krabouilleurs.html" },
  { name: "Les mercemers sont bien outillés", period: "daily", zone: "Base Abyssale Sufokia", kamas: 43980, url: "https://www.dofuspourlesnoobs.com/les-mercemers-sont-bien-outilleacutes.html" },
];
