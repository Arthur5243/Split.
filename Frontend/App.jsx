import React, { useState, useEffect, useRef, useCallback } from "react";
import cs2ManualResults from "./cs2-manual-results.json";
import {
  Home,
  Trophy,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Mail,
  Lock,
  X,
  CalendarDays,
  Chrome,
  Target,
  ChevronUp,
  Play,
  User,
  Edit3,
  Search,
  Camera,
  Plus,
  ArrowLeft,
  Bell,
  CreditCard,
  LogOut,
  Eye,
  EyeOff,
  Gift,
  UserPlus,
  Users,
  Info,
  Zap,
  Award,
  ListChecks,
  CheckCircle,
  Crosshair,
  MessageCircle,
  Share2,
  Send,
  Shield,
  Settings,
  Square,
  ArrowUp,
  Clock,
  MoreHorizontal,
} from "lucide-react";

const SPLIT_LOGO = "/split-logo.png";
const NEWS_IMAGE = "/news-image.jpg";
const NEWS_EWC_IMAGE = "/news-ewc.png";
const REWARDS_BANNER = "/rewards-banner.png";

// Logos de catégorie (nav du bas + onglets à venir), dans l'ordre
// Valorant / CS2 / Rocket League — fichiers fournis par l'utilisateur.
const NAV_VALORANT_IMG = "/Valo(1).png";
const NAV_CSGO_IMG = "/Cs2(2).png";
const NAV_RL_IMG = "/Rl(1).png";

[NEWS_IMAGE, NEWS_EWC_IMAGE, REWARDS_BANNER].forEach(src => { const img = new Image(); img.src = src; });

// Régions VCT suivies par l'app (couleurs d'accent par région)
const REGIONS = [
  { key: "EMEA", accent: "#C4F000" },
  { key: "AMERICAS", accent: "#FF5A1F" },
  { key: "PACIFIC", accent: "#1DE9D8" },
  { key: "CN", accent: "#FF2D6B" },
];

// Chaînes Twitch officielles par région (pattern valorant_[region])
const REGION_TWITCH = {
  EMEA: "valorant_emea",
  AMERICAS: "valorant_americas",
  PACIFIC: "valorant_pacific",
  CN: "valorantesports_cn",
};

// Liens replay YouTube officiels par région, pour le bouton "Replay" une fois
// le match terminé (chaque région a son propre handle et paramètre "si").
const REGION_YOUTUBE = {
  EMEA: "https://youtube.com/@vctemea?si=BpA8cbVamLTFSN78",
  AMERICAS: "https://youtube.com/@valorant_americas?si=ZgRee5FljnA9F5XG",
  PACIFIC: "https://youtube.com/@vctpacific?si=BpA8cbVamLTFSN78",
  CN: "https://youtube.com/@valorantesportscn?si=H2cxjYM4lYVN-Oks",
};

// Liens du direct YouTube (pas le replay) par région, pour le choix
// Twitch/YouTube proposé au clic sur "LIVE".
const REGION_YOUTUBE_LIVE = {
  EMEA: "https://www.youtube.com/@vctemea/live",
  AMERICAS: "https://www.youtube.com/@valorant_americas/live",
  PACIFIC: "https://www.youtube.com/@VCTPacific/live",
  CN: "https://www.youtube.com/@VALORANTEsportsCN/live",
};

function daysAgoText(beginAt) {
  if (!beginAt) return null;
  const d = new Date(beginAt);
  if (isNaN(d)) return null;
  const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  if (diff === 0) return "Regarder le replay d'aujourd'hui";
  if (diff === 1) return "Regarder le replay d'hier";
  return "Regarder le replay d'il y a " + diff + " jour" + (diff > 1 ? "s" : "");
}
const _ytCache = new Map();
async function fetchYouTubeReplay(team1, team2, date, game, league) {
  const key = [team1, team2, date, game, league].join("|");
  if (_ytCache.has(key)) return _ytCache.get(key);
  try {
    const p = new URLSearchParams({ team1, team2, date: date || "", game: game || "", league: league || "" });
    const res = await fetch(API_BASE + "/api/youtube-replay?" + p);
    const data = await res.json();
    const url = data.url || null;
    _ytCache.set(key, url);
    return url;
  } catch { return null; }
}
async function fetchYouTubeLive(team1, team2, game) {
  const key = "live|" + [team1, team2, game].join("|");
  if (_ytCache.has(key)) return _ytCache.get(key);
  try {
    const p = new URLSearchParams({ team1, team2, game: game || "" });
    const res = await fetch(API_BASE + "/api/youtube-live?" + p);
    const data = await res.json();
    const url = data.url || null;
    _ytCache.set(key, url);
    return url;
  } catch { return null; }
}

// Catégories de jeux affichées dans le classement
const CATS = ["VALORANT", "CSGO", "RL"];
const SCORE_CATS = ["tout","valo","cs2","rl"];
const BIO_BLOCKED_WORDS = ["pute","merde","connard","connasse","enculé","fdp","ntm","nique","salope","batard","bâtard","putain","pd","encule","tg","ftg","suce","bite","couille","chier"];
const BIO_LINK_RE = /https?:\/\/|www\.|\.com|\.fr|\.gg|\.tv|\.io|discord\.|twitch\.|twitter\.|instagram\./i;

// Logos d'équipe personnalisés (fallback si l'API PandaScore n'en fournit pas) ;
// utilisés en priorité sur match.team1Logo/team2Logo quand présents ci-dessous.
const LOGOS = {
  XIP: "/logos/xe.png",
  XE: "/logos/xe.png",
  TS: "/logos/ts.png",
  DRX: "/logos/drx.png",
  W7M: "/logos/w7m.png",
  FUT: "/logos/fut.png",
  AT: "/logos/at.png",
  KBG: "/logos/kbg.png",
  ENCE: "/logos/ence.webp",
  FORZ: "/logos/forz.webp",
  NOIR: "/logos/noir.png",
  FORT: "/logos/fort.webp",
  YL: "/logos/yl.webp",
  BANG: "/logos/bang.png",
  ENVY: "/logos/envy.png",
  "EX-M": "/logos/mana.png",
  "EX-S": "/logos/exs.png",
  MELL: "/logos/mell.png",
  NORD: "/logos/nord.jpg",
  PAIN: "/logos/pain.png",
  ZETA: "/logos/zeta.png",
  TL: "/logos/tl.png",
  KC: "/logos/kc.png",
  MIBR: "/logos/mibr.png",
  EG: "/logos/eg.png",
  ONG: "/logos/ong.png",
  BST: "/logos/bst.png",
  G2: "/logos/g2.png",
  PR: "/logos/pr.png",
  JL: "/logos/jl.png",
  TH: "/logos/th.png",
  B8: "/logos/b8.png",
  VARR: "/logos/varr.png",
  ICE: "/logos/ice.png",
  VIT: "/logos/vit.png",
  GM: "/logos/gm.png",
  M8: "/logos/m8.webp",
  GENT: "/logos/m8.webp",
  NRG: "/logos/nrg.png",
  TSM: "/logos/tsm.png",
  NIP: "/logos/nip.png",
  SR: "/logos/sr.png",
  SP: "/logos/tspirit.png",
  TSPIRIT: "/logos/tspirit.png",
  SPIR: "/logos/tspirit.png",
  NAVI: "/logos/envy.png",
  "5S": "/logos/5s.png",
  R8: "/logos/r8.png",
  WC: "/logos/wc.png",
  BIG: "/logos/big.png",
};

const VLR_LOGOS = {
  "team liquid": "/logos/tl.png",
  "karmine corp": "/logos/kc.png",
  "g2 esports": "/logos/g2.png",
  "paper rex": "/logos/pr.png",
  "joblife": "/logos/jl.png",
  "team heretics": "/logos/th.png",
  "b8 esports": "/logos/b8.png",
  "bleed esports": "/logos/bst.png",
  "mibr": "/logos/mibr.png",
  "evil geniuses": "/logos/eg.png",
  "enterprise esports": null,
  "onic esports": "/logos/ong.png",
  "fut esports": "/logos/fut.png",
  "zeta division": "/logos/zeta.png",
  "team vitality": "/logos/vit.png",
  "ice esports": "/logos/ice.png",
  "pain gaming": "/logos/pain.png",
  "varrel": "/logos/varr.png",
  "kiwoom drx": "/logos/drx.png",
  "drx": "/logos/drx.png",
  "gentle mates": "/logos/m8.webp",
  "nrg": "/logos/nrg.png",
  "nrg esports": "/logos/nrg.png",
  "natus vincere": "/logos/envy.png",
  "eintracht frankfurt": "/logos/fort.webp",
  "xerxia esports": "/logos/xe.png",
  "talon esports": "/logos/ts.png",
  "w7m esports": "/logos/w7m.png",
  "fluxo w7m": "/logos/w7m.png",
  "envy": "/logos/envy.png",
};
function vlrTeamLogo(name) {
  return VLR_LOGOS[(name || "").toLowerCase()] || null;
}

// Langues disponibles dans le sélecteur
const LANGS = [
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "cn", flag: "🇨🇳", label: "中文" },
];

// Locale Intl pour le formatage des dates par langue
const LOCALE_MAP = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  it: "it-IT",
  ja: "ja-JP",
  de: "de-DE",
  cn: "zh-CN",
};

const STR = {
  fr: {
    navHome: "Accueil", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Classement",
    newsLabel: "News", newsBadge: "Valorant", newsTitle: "3 MASTERS EN 2027", newsSub: "Un troisième tournoi Masters s'ajouterait au calendrier de la saison prochaine.",
    news2Badge: "CS2", news2Title: "2 MILLIONS $ EN JEU", news2Sub: "Finale Esports World Cup 2026 CS2 · 23 août · Paris 🇫🇷",
    classementLabel: "Classement", seeAll: "Tout voir", classementEmptyHome: "0 pronostiqueur classé pour le moment. Sois le premier !",
    calendarLabel: "Calendrier", calendarCardTitle: "Calendrier VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendrier CS2", cs2CalendarCardSub: "Stages · IEM · Playoffs · Major",
    cs2CalendarModalTitle: "Programme CS2 2026", cs2CalendarEmpty: "Aucun évènement à afficher.",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronostics BO3 · toutes les ligues",
    bracketShow: "Voir le Bracket", bracketHide: "Masquer le Bracket", bracketUpper: "Upper Bracket", bracketLower: "Lower Bracket", bracketGrandFinal: "Grande Finale", bracketTBD: "TBD", bracketGroupStage: "Phase de groupes", bracketPlayIns: "Play-ins", bracketPlayoffs: "Playoffs", bracketKickoff: "Kickoff", bracketStage: "Stage", bracketMasters: "Masters", bracketChampions: "Champions", bracketNoEvent: "Aucun event disponible", bracketTeams: "Équipes", bracketStandings: "Classement", bracketHistory: "Historique", bracketQualified: "Qualifié", bracketPoints: "Points Championship",
    regionAll: "Tout", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "Chine",
    cs2Title: "CS2", cs2Subtitle: "Pronostics BO3 · circuit mondial",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    rlTitle: "ROCKET LEAGUE", rlSubtitle: "Résultats RLCS · toutes les régions",
    rlRegionEurope: "Europe", rlRegionAmericas: "Americas", rlRegionOceania: "Océanie",
    cs2CircuitToggleShow: "Voir le circuit CS2", cs2CircuitToggleHide: "Masquer le circuit",
    cs2BracketShow: "Voir le Bracket", cs2BracketMajor: "Major", cs2BracketIEM: "IEM", cs2BracketBlast: "Blast", cs2BracketESL: "ESL", cs2BracketPGL: "PGL", cs2BracketGroupStage: "Phase de groupes", cs2BracketPlayoffs: "Playoffs", cs2BracketPlayIns: "Play-ins", cs2BracketFinal: "Finale", cs2BracketStage1: "Stage 1", cs2BracketStage2: "Stage 2", cs2BracketStage3: "Stage 3", cs2BracketNoEvent: "Aucun event CS2 disponible",
    cs2CircuitTitle: "Circuit CS2", cs2CircuitIntro: "Inspiré du système régional de Valorant, mais sans ligues fermées : les équipes progressent par classement, pas par franchise.",
    cs2CircuitRegions: "Régions", cs2CircuitRegionsDesc: "3 grandes régions suivies : Europe, Americas, Asia.",
    cs2CircuitRanking: "Ranking régional", cs2CircuitRankingDesc: "Chaque équipe est classée dans sa région selon ses résultats récents.",
    cs2CircuitQualifiers: "Invitations & Qualifiers", cs2CircuitQualifiersDesc: "Les mieux classées de chaque région obtiennent une place ; la répartition varie selon les performances régionales.",
    cs2CircuitStages: "Stages communs", cs2CircuitStagesDesc: "Les équipes qualifiées de toutes les régions se retrouvent dans les mêmes stages — jamais séparées par région.",
    cs2CircuitPlayoffs: "Playoffs", cs2CircuitPlayoffsDesc: "Les meilleures équipes des stages communs s'affrontent pour une place en finale.",
    cs2CircuitChampions: "Champions", cs2CircuitChampionsDesc: "Le sommet du circuit, toutes régions confondues.",
    cs2RankingTitle: "Classement régional", cs2RankingSubtitle: "Basé sur les résultats récents de chaque équipe", cs2RankingEmpty: "Pas encore assez de résultats pour établir un classement.",
    today: "Aujourd'hui", tomorrow: "Demain",
    teamsTbc: "Équipes à confirmer",
    seriesHint: "Saisis un score de série valide ci-dessus (ex. 2-0, 2-1).",
    liveReveal: "Voir",
    createPost: "Créer un post", postWrite: "Écrire", postHistory: "Historique", postPlaceholder: "Partagez vos résultats, analyses...", postPublish: "Publier", postEmpty: "Aucun post", postFeed: "Fil d'actualité",
    messagesTitle: "Discussion", msgCommunity: "Communauté", msgDms: "Messages", msgEmpty: "Aucun message", msgNoDms: "Aucune conversation", msgPlaceholder: "Message...", msgDmPlaceholder: "Message chiffré...",
    scoreInvalid: "13 pts min, 2 pts d'écart après 12",
    alreadyWonSuffix: "aurait déjà gagné si tu mets ce score",
    mustWinLastMap: "doit gagner la dernière map",
    mustWinAllMaps: "doit gagner cette map dans un 2-0",
    betLocked: "Pari verrouillé",
    myPoints: "Mes points", myPointsSub: "Pronostics corrects, en attendant la connexion",
    placeholderSoon: "Bientôt disponible. On prépare les pronostics {label}, reviens vite !",
    classementTitle: "Classement", classementSubtitle: "Meilleurs pronostiqueurs de la saison", classementEmptyTitle: "0 utilisateur classé",
    classementEmptySub: "Personne n'a encore fait de pronostic. Sois le premier à grimper au classement !",
    catFilterLabel: "Catégories",
    profileTitle: "Mon profil", profilePseudo: "Pseudo", profileBio: "Bio", profileAvatar: "Avatar",
    profileFavValo: "Equipe favorite Valorant", profileFavCs2: "Equipe favorite CS2", profileFavRl: "Equipe favorite RL",
    profileSave: "Enregistrer", profileEdit: "Modifier", profileCreate: "Crée ton profil",
    profileCreateSub: "Choisis un pseudo, un avatar et tes équipes favorites pour apparaître au classement.",
    scoreTout: "TOUT", scoreValo: "VALO", scoreCs2: "CS2", scoreRl: "RL",
    bioError: "Pas de liens, insultes ou gros mots.",
    profileAmis: "Amis", profileTop: "Top", profilePoint: "Point",
    profileModify: "Modifier le profil", profileHistory: "Historique :", profileFavLabel: "Équipes préférées",
    profileExact: "Exact", profileBon: "Bon", profileParie: "Parié",
    profileVoir: "voir", profileAddFriend: "Ajouter un ami",
    friendTabSearch: "Rechercher", friendTabFollowing: "Abonnements", friendTabFollowers: "Abonnés",
    friendSearchPlaceholder: "Pseudo du joueur...", friendFollow: "Suivre", friendUnfollow: "Suivi",
    friendNoResults: "Aucun résultat.", friendNotFound: "Joueur introuvable.",
    friendEmpty: "Personne pour l'instant.", friendViewers: "Ont vu ton profil",
    profileBlock: "Bloquer",
    settingsTitle: "Réglages", settingsNotifGames: "Notifications par jeu",
    settingsNotifRegions: "Régions",
    settingsFavTeam: "Équipe favorite", settingsFavTeamNone: "Aucune équipe sélectionnée", settingsAccount: "Compte",
    settingsGoogle: "Continuer avec Google", settingsOr: "ou", settingsEmail: "Adresse e-mail", settingsPassword: "Mot de passe", settingsLogin: "Connexion",
    settingsPseudo: "Pseudo", settingsPlan: "Forfait", settingsPlanFree: "Gratuit", settingsPlanDesc: "Tu utilises le forfait gratuit.", settingsNotifications: "Notifications", settingsLogout: "Déconnexion", settingsForgotPwd: "Mot de passe oublié ?", settingsForgotSent: "Fonctionnalité bientôt disponible.", settingsChangePwd: "Modifier", settingsPwdPlaceholder: "••••••••", settingsRewards: "Récompenses", settingsRewardsDesc: "Bientôt disponible — gagne des récompenses en pronostiquant !", rewardsTitle: "Récompenses", rewardsGoal: "Première récompense débloquée à 1 000 inscrits !", rewardsRegistered: "inscrits",
    calendarModalTitle: "Calendrier VCT 2026", calendarDone: "Terminé", calendarSoon: "Bientôt", calendarLive: "En cours",
    calendarShowDetail: "Voir le détail par région", calendarHideDetail: "Masquer le détail",
    statusUpcoming: "Matchs à venir",
    yourBet: "Ton pari", replay: "Replay",
    questTitle: "Quêtes", questDaily: "Quotidiennes", questWeekly: "Hebdomadaire", questCompleted: "Terminée", questClaim: "Réclamer", questProgress: "en cours",
    questBetToday: "Fais un pronostic aujourd'hui", questBet2Games: "Pronostique sur 2 jeux différents", questUseAllSlots: "Utilise tes 4 pronos du jour", questViewBracket: "Consulte un bracket", questAddAvatar: "Ajoute une photo de profil", questAddBio: "Rédige ta bio", questChooseFav: "Choisis ton équipe favorite", questInviteFriend: "Invite un ami", questOpenNewTab: "Découvre un nouvel onglet jeu", questViewClassement: "Consulte le classement", questExactScore: "Devine le score exact d'un Bo3", questWeekly5Wins: "Gagne 5 pronos cette semaine", questWeekly3Exact: "3 scores exacts cette semaine",
    streakTitle: "Streak", streakDesc: "Fais au moins 1 prono par jour pour maintenir ta flamme !", streakDays: "jours", streakBest: "Record", streakEarned: "Flamme maintenue !",
    nexiumBox: "Nexium Box", nexiumOpen: "Ouvrir", nexiumRare: "Rare", nexiumEpic: "Épique", nexiumLegendary: "Légendaire", nexiumUltra: "Ultra", nexiumNew: "Nouveau !", nexiumOwned: "Possédé",
    cashprizeTitle: "Cashprize", cashprizeRules: "Top 1, 2 et 3 gagnent un cashprize !", cashprizeUnlock: "Disponible à partir de 1 000 installations", cashprizeInstalls: "installations", cashprizeWinners: "Gagnants",
    predLimit: "Tout est joué !", predRemaining: "pronos dispo", predActive: "pronos actifs", predLimitPopup: "Tu as utilisé tes 4 pronos du jour. Reviens demain ou attends qu'un match se termine !",
    slideMatchDay: "Match du jour", slideCommunity: "ont parié sur", slideCountdown: "Compte à rebours",
    rewardsFree: "Récompenses", rewardsCash: "Cashprize",
    inventoryTitle: "Inventaire", inventoryEmpty: "Aucun objet pour le moment",
    streakExplain: "Fais au moins 1 pronostic par jour pour entretenir ta flamme. Si tu rates un jour, ta streak repart à 0 !",
    notifTitle: "Notifications", notifEmpty: "Aucune notification pour le moment", notifFriendReq: "Demande d'ami", notifBigMatch: "Match important", notifTeamQualified: "Équipe qualifiée",
    questProgressLabel: "Progression",
    questBet3Matches: "Pronostique 3 matchs", questBetCs2: "Fais un prono CS2", questBetValo: "Fais un prono Valorant", questFollowSomeone: "Suis un joueur", questVisitProfile: "Visite un profil", questCheckLive: "Regarde un match live", questBetUnderdog: "Mise sur l'outsider", questShareApp: "Partage Split", questWeekly10Bets: "10 pronos cette semaine",
    xpLabel: "XP", xpEarned: "XP gagnés !", tierLabel: "Palier", tierCurrent: "Palier actuel", tierScrollUp: "Remonter",
    streakExpired: "Streak perdue !", streakExpiredDesc: "Tu n'as pas pronostiqué hier. Ta streak repart à 0.", streakExpiring: "Ta streak expire bientôt !",
    rewardsTierFree: "GRATUIT", rewardsTierLocked: "Verrouillé",
  },
  en: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Standings",
    newsLabel: "News", newsBadge: "Valorant", newsTitle: "3 MASTERS IN 2027", newsSub: "A third Masters tournament could be added to next season's calendar.",
    news2Badge: "CS2", news2Title: "$2 MILLION ON THE LINE", news2Sub: "Esports World Cup 2026 CS2 Finals · Aug 23 · Paris 🇫🇷",
    classementLabel: "Standings", seeAll: "See all", classementEmptyHome: "0 ranked predictors so far. Be the first!",
    calendarLabel: "Calendar", calendarCardTitle: "VCT 2026 Calendar", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2 Calendar", cs2CalendarCardSub: "Stages · IEM · Playoffs · Major",
    cs2CalendarModalTitle: "CS2 Program 2026", cs2CalendarEmpty: "No events to display.",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3 predictions · all leagues",
    bracketShow: "View Bracket", bracketHide: "Hide Bracket", bracketUpper: "Upper Bracket", bracketLower: "Lower Bracket", bracketGrandFinal: "Grand Final", bracketTBD: "TBD", bracketGroupStage: "Group Stage", bracketPlayIns: "Play-ins", bracketPlayoffs: "Playoffs", bracketKickoff: "Kickoff", bracketStage: "Stage", bracketMasters: "Masters", bracketChampions: "Champions", bracketNoEvent: "No event available", bracketTeams: "Teams", bracketStandings: "Standings", bracketHistory: "History", bracketQualified: "Qualified", bracketPoints: "Championship Points",
    regionAll: "All", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    cs2Title: "CS2", cs2Subtitle: "BO3 predictions · worldwide circuit",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    rlTitle: "ROCKET LEAGUE", rlSubtitle: "RLCS results · all regions",
    rlRegionEurope: "Europe", rlRegionAmericas: "Americas", rlRegionOceania: "Oceania",
    cs2CircuitToggleShow: "View the CS2 circuit", cs2CircuitToggleHide: "Hide the circuit",
    cs2BracketShow: "View Bracket", cs2BracketMajor: "Major", cs2BracketIEM: "IEM", cs2BracketBlast: "Blast", cs2BracketESL: "ESL", cs2BracketPGL: "PGL", cs2BracketGroupStage: "Group Stage", cs2BracketPlayoffs: "Playoffs", cs2BracketPlayIns: "Play-ins", cs2BracketFinal: "Final", cs2BracketStage1: "Stage 1", cs2BracketStage2: "Stage 2", cs2BracketStage3: "Stage 3", cs2BracketNoEvent: "No CS2 event available",
    cs2CircuitTitle: "CS2 Circuit", cs2CircuitIntro: "Inspired by Valorant's regional system, but without closed leagues: teams progress through rankings, not franchising.",
    cs2CircuitRegions: "Regions", cs2CircuitRegionsDesc: "3 major regions tracked: Europe, Americas, Asia.",
    cs2CircuitRanking: "Regional ranking", cs2CircuitRankingDesc: "Each team is ranked within its region based on recent results.",
    cs2CircuitQualifiers: "Invites & Qualifiers", cs2CircuitQualifiersDesc: "The top teams from each region earn a spot; how many spots per region can vary with regional performance.",
    cs2CircuitStages: "Common stages", cs2CircuitStagesDesc: "Qualified teams from every region meet in the same stages — never split by region.",
    cs2CircuitPlayoffs: "Playoffs", cs2CircuitPlayoffsDesc: "The best teams from the common stages fight for a spot in the final.",
    cs2CircuitChampions: "Champions", cs2CircuitChampionsDesc: "The top of the circuit, all regions combined.",
    cs2RankingTitle: "Regional standings", cs2RankingSubtitle: "Based on each team's recent results", cs2RankingEmpty: "Not enough results yet to build a ranking.",
    today: "Today", tomorrow: "Tomorrow",
    teamsTbc: "Teams TBC",
    seriesHint: "Enter a valid series score above (e.g. 2-0, 2-1).",
    liveReveal: "Reveal",
    createPost: "Create a post", postWrite: "Write", postHistory: "History", postPlaceholder: "Share your results, insights...", postPublish: "Publish", postEmpty: "No posts", postFeed: "Feed",
    messagesTitle: "Discussion", msgCommunity: "Community", msgDms: "Messages", msgEmpty: "No messages", msgNoDms: "No conversations", msgPlaceholder: "Message...", msgDmPlaceholder: "Encrypted message...",
    scoreInvalid: "13 pts min, 2 pt gap after 12",
    alreadyWonSuffix: "would have already won with this score",
    mustWinLastMap: "must win the last map",
    mustWinAllMaps: "must win this map in a 2-0",
    betLocked: "Bet locked",
    myPoints: "My points", myPointsSub: "Correct predictions, until login is added",
    placeholderSoon: "Coming soon. We're preparing {label} predictions, check back soon!",
    classementTitle: "Classement", classementSubtitle: "Best predictors of the season", classementEmptyTitle: "0 ranked users",
    classementEmptySub: "No one has made a prediction yet. Be the first to climb the standings!",
    catFilterLabel: "Categories",
    profileTitle: "My profile", profilePseudo: "Username", profileBio: "Bio", profileAvatar: "Avatar",
    profileFavValo: "Favorite Valorant team", profileFavCs2: "Favorite CS2 team", profileFavRl: "Favorite RL team",
    profileSave: "Save", profileEdit: "Edit", profileCreate: "Create your profile",
    profileCreateSub: "Pick a username, an avatar and your favorite teams to appear in the standings.",
    scoreTout: "ALL", scoreValo: "VALO", scoreCs2: "CS2", scoreRl: "RL",
    bioError: "No links, insults or profanity.",
    profileAmis: "Friends", profileTop: "Top", profilePoint: "Point",
    profileModify: "Edit profile", profileHistory: "History:", profileFavLabel: "Favorite teams",
    profileExact: "Exact", profileBon: "Correct", profileParie: "Bet",
    profileVoir: "view", profileAddFriend: "Add friend",
    friendTabSearch: "Search", friendTabFollowing: "Following", friendTabFollowers: "Followers",
    friendSearchPlaceholder: "Player username...", friendFollow: "Follow", friendUnfollow: "Following",
    friendNoResults: "No results.", friendNotFound: "Player not found.",
    friendEmpty: "Nobody yet.", friendViewers: "Viewed your profile",
    profileBlock: "Block",
    settingsTitle: "Settings", settingsNotifGames: "Notifications by game",
    settingsNotifRegions: "Regions",
    settingsFavTeam: "Favorite team", settingsFavTeamNone: "No team selected", settingsAccount: "Account",
    settingsGoogle: "Continue with Google", settingsOr: "or", settingsEmail: "Email address", settingsPassword: "Password", settingsLogin: "Log in",
    settingsPseudo: "Username", settingsPlan: "Plan", settingsPlanFree: "Free", settingsPlanDesc: "You're on the free plan.", settingsNotifications: "Notifications", settingsLogout: "Log out", settingsForgotPwd: "Forgot password?", settingsForgotSent: "Feature coming soon.", settingsChangePwd: "Change", settingsPwdPlaceholder: "••••••••", settingsRewards: "Rewards", settingsRewardsDesc: "Coming soon — earn rewards by predicting!", rewardsTitle: "Rewards", rewardsGoal: "First reward unlocked at 1,000 registered users!", rewardsRegistered: "registered",
    calendarModalTitle: "VCT 2026 Calendar", calendarDone: "Finished", calendarSoon: "Coming soon", calendarLive: "Live now",
    calendarShowDetail: "Show detail by region", calendarHideDetail: "Hide detail",
    statusUpcoming: "Upcoming matches",
    yourBet: "Your bet", replay: "Replay",
    questTitle: "Quests", questDaily: "Daily", questWeekly: "Weekly", questCompleted: "Completed", questClaim: "Claim", questProgress: "in progress",
    questBetToday: "Make a prediction today", questBet2Games: "Predict on 2 different games", questUseAllSlots: "Use all 4 daily predictions", questViewBracket: "Check a bracket", questAddAvatar: "Add a profile picture", questAddBio: "Write your bio", questChooseFav: "Choose your favorite team", questInviteFriend: "Invite a friend", questOpenNewTab: "Discover a new game tab", questViewClassement: "Check the standings", questExactScore: "Guess the exact score of a Bo3", questWeekly5Wins: "Win 5 predictions this week", questWeekly3Exact: "3 exact scores this week",
    streakTitle: "Streak", streakDesc: "Make at least 1 prediction per day to keep your flame!", streakDays: "days", streakBest: "Best", streakEarned: "Flame kept!",
    nexiumBox: "Nexium Box", nexiumOpen: "Open", nexiumRare: "Rare", nexiumEpic: "Epic", nexiumLegendary: "Legendary", nexiumUltra: "Ultra", nexiumNew: "New!", nexiumOwned: "Owned",
    cashprizeTitle: "Cash Prize", cashprizeRules: "Top 1, 2, and 3 win a cash prize!", cashprizeUnlock: "Available from 1,000 installs", cashprizeInstalls: "installs", cashprizeWinners: "Winners",
    predLimit: "All played!", predRemaining: "left", predActive: "active predictions", predLimitPopup: "You've used all 4 predictions for today. Come back tomorrow or wait for a match to finish!",
    slideMatchDay: "Match of the day", slideCommunity: "bet on", slideCountdown: "Countdown",
    rewardsFree: "Rewards", rewardsCash: "Cash Prize",
    inventoryTitle: "Inventory", inventoryEmpty: "No items yet",
    streakExplain: "Make at least 1 prediction per day to keep your flame. Miss a day and your streak resets to 0!",
    notifTitle: "Notifications", notifEmpty: "No notifications yet", notifFriendReq: "Friend request", notifBigMatch: "Big match", notifTeamQualified: "Team qualified",
    questProgressLabel: "Progress",
    questBet3Matches: "Predict 3 matches", questBetCs2: "Make a CS2 prediction", questBetValo: "Make a Valorant prediction", questFollowSomeone: "Follow a player", questVisitProfile: "Visit a profile", questCheckLive: "Watch a live match", questBetUnderdog: "Bet on the underdog", questShareApp: "Share Split", questWeekly10Bets: "10 predictions this week",
    xpLabel: "XP", xpEarned: "XP earned!", tierLabel: "Tier", tierCurrent: "Current tier", tierScrollUp: "Scroll up",
    streakExpired: "Streak lost!", streakExpiredDesc: "You didn't predict yesterday. Your streak resets to 0.", streakExpiring: "Your streak expires soon!",
    rewardsTierFree: "FREE", rewardsTierLocked: "Locked",
  },
  es: {
    navHome: "Inicio", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Clasificación",
    newsLabel: "News", newsBadge: "Valorant", newsTitle: "3 MASTERS EN 2027", newsSub: "Un tercer torneo Masters se añadiría al calendario de la próxima temporada.",
    news2Badge: "CS2", news2Title: "2 MILLONES $ EN JUEGO", news2Sub: "Final Esports World Cup 2026 CS2 · 23 ago · París 🇫🇷",
    classementLabel: "Clasificación", seeAll: "Ver todo", classementEmptyHome: "0 pronosticadores clasificados por ahora. ¡Sé el primero!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendario CS2", cs2CalendarCardSub: "Stages · IEM · Playoffs · Major",
    cs2CalendarModalTitle: "Programa CS2 2026", cs2CalendarEmpty: "Sin eventos para mostrar.",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronósticos BO3 · todas las ligas",
    bracketShow: "Ver Bracket", bracketHide: "Ocultar Bracket", bracketUpper: "Upper Bracket", bracketLower: "Lower Bracket", bracketGrandFinal: "Gran Final", bracketTBD: "TBD", bracketGroupStage: "Fase de grupos", bracketPlayIns: "Play-ins", bracketPlayoffs: "Playoffs", bracketKickoff: "Kickoff", bracketStage: "Stage", bracketMasters: "Masters", bracketChampions: "Champions", bracketNoEvent: "Sin evento disponible", bracketTeams: "Equipos", bracketStandings: "Clasificación", bracketHistory: "Historial", bracketQualified: "Clasificado", bracketPoints: "Puntos Championship",
    regionAll: "Todo", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    cs2Title: "CS2", cs2Subtitle: "Pronósticos BO3 · circuito mundial",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    rlTitle: "ROCKET LEAGUE", rlSubtitle: "Resultados RLCS · todas las regiones",
    rlRegionEurope: "Europe", rlRegionAmericas: "Americas", rlRegionOceania: "Oceanía",
    cs2CircuitToggleShow: "Ver el circuito CS2", cs2CircuitToggleHide: "Ocultar el circuito",
    cs2BracketShow: "Ver Bracket", cs2BracketMajor: "Major", cs2BracketIEM: "IEM", cs2BracketBlast: "Blast", cs2BracketESL: "ESL", cs2BracketPGL: "PGL", cs2BracketGroupStage: "Fase de grupos", cs2BracketPlayoffs: "Playoffs", cs2BracketPlayIns: "Play-ins", cs2BracketFinal: "Final", cs2BracketStage1: "Stage 1", cs2BracketStage2: "Stage 2", cs2BracketStage3: "Stage 3", cs2BracketNoEvent: "Ningún evento CS2 disponible",
    cs2CircuitTitle: "Circuito CS2", cs2CircuitIntro: "Inspirado en el sistema regional de Valorant, pero sin ligas cerradas: los equipos progresan por clasificación, no por franquicia.",
    cs2CircuitRegions: "Regiones", cs2CircuitRegionsDesc: "3 grandes regiones: Europe, Americas, Asia.",
    cs2CircuitRanking: "Ranking regional", cs2CircuitRankingDesc: "Cada equipo se clasifica en su región según sus resultados recientes.",
    cs2CircuitQualifiers: "Invitaciones y Qualifiers", cs2CircuitQualifiersDesc: "Los mejores de cada región obtienen una plaza; el reparto varía según el rendimiento regional.",
    cs2CircuitStages: "Fases comunes", cs2CircuitStagesDesc: "Los equipos clasificados de todas las regiones se reúnen en las mismas fases — nunca separados por región.",
    cs2CircuitPlayoffs: "Playoffs", cs2CircuitPlayoffsDesc: "Los mejores equipos de las fases comunes luchan por un puesto en la final.",
    cs2CircuitChampions: "Champions", cs2CircuitChampionsDesc: "La cima del circuito, todas las regiones combinadas.",
    cs2RankingTitle: "Clasificación regional", cs2RankingSubtitle: "Basada en los resultados recientes de cada equipo", cs2RankingEmpty: "Aún no hay suficientes resultados para una clasificación.",
    today: "Hoy", tomorrow: "Mañana",
    teamsTbc: "Equipos por confirmar",
    seriesHint: "Introduce un marcador de serie válido arriba (ej. 2-0, 2-1).",
    liveReveal: "Ver",
    createPost: "Crear un post", postWrite: "Escribir", postHistory: "Historial", postPlaceholder: "Comparte tus resultados...", postPublish: "Publicar", postEmpty: "Sin posts", postFeed: "Feed",
    messagesTitle: "Discusión", msgCommunity: "Comunidad", msgDms: "Mensajes", msgEmpty: "Sin mensajes", msgNoDms: "Sin conversaciones", msgPlaceholder: "Mensaje...", msgDmPlaceholder: "Mensaje cifrado...",
    scoreInvalid: "13 pts mín, 2 pts de diferencia tras 12",
    alreadyWonSuffix: "ya habría ganado con este marcador",
    mustWinLastMap: "debe ganar el último mapa",
    mustWinAllMaps: "debe ganar este mapa en un 2-0",
    placeholderSoon: "Próximamente. Estamos preparando los pronósticos de {label}, ¡vuelve pronto!",
    classementTitle: "Classement", classementSubtitle: "Mejores pronosticadores de la temporada", classementEmptyTitle: "0 usuarios clasificados",
    classementEmptySub: "Nadie ha hecho un pronóstico todavía. ¡Sé el primero en subir en la clasificación!",
    catFilterLabel: "Categorías",
    profileTitle: "Mi perfil", profilePseudo: "Apodo", profileBio: "Bio", profileAvatar: "Avatar",
    profileFavValo: "Equipo favorito Valorant", profileFavCs2: "Equipo favorito CS2", profileFavRl: "Equipo favorito RL",
    profileSave: "Guardar", profileEdit: "Editar", profileCreate: "Crea tu perfil",
    profileCreateSub: "Elige un apodo, un avatar y tus equipos favoritos para aparecer en la clasificación.",
    scoreTout: "TODO", scoreValo: "VALO", scoreCs2: "CS2", scoreRl: "RL",
    bioError: "Sin enlaces, insultos ni palabrotas.",
    profileAmis: "Amigos", profileTop: "Top", profilePoint: "Punto",
    profileModify: "Editar perfil", profileHistory: "Historial:", profileFavLabel: "Equipos favoritos",
    profileExact: "Exacto", profileBon: "Correcto", profileParie: "Apostado",
    profileVoir: "ver", profileAddFriend: "Añadir amigo",
    friendTabSearch: "Buscar", friendTabFollowing: "Siguiendo", friendTabFollowers: "Seguidores",
    friendSearchPlaceholder: "Pseudo del jugador...", friendFollow: "Seguir", friendUnfollow: "Siguiendo",
    friendNoResults: "Sin resultados.", friendNotFound: "Jugador no encontrado.",
    friendEmpty: "Nadie por ahora.", friendViewers: "Vieron tu perfil",
    profileBlock: "Bloquear",
    settingsTitle: "Ajustes", settingsNotifGames: "Notificaciones por juego",
    settingsNotifRegions: "Regiones",
    settingsFavTeam: "Equipo favorito", settingsFavTeamNone: "Ningún equipo seleccionado", settingsAccount: "Cuenta",
    settingsGoogle: "Continuar con Google", settingsOr: "o", settingsEmail: "Correo electrónico", settingsPassword: "Contraseña", settingsLogin: "Iniciar sesión",
    settingsPseudo: "Nombre de usuario", settingsPlan: "Plan", settingsPlanFree: "Gratis", settingsPlanDesc: "Estás en el plan gratuito.", settingsNotifications: "Notificaciones", settingsLogout: "Cerrar sesión", settingsForgotPwd: "¿Olvidaste tu contraseña?", settingsForgotSent: "Función próximamente.", settingsChangePwd: "Cambiar", settingsPwdPlaceholder: "••••••••", settingsRewards: "Recompensas", settingsRewardsDesc: "Próximamente — ¡gana recompensas pronosticando!", rewardsTitle: "Recompensas", rewardsGoal: "¡Primera recompensa al llegar a 1.000 inscritos!", rewardsRegistered: "inscritos",
    calendarModalTitle: "Calendario VCT 2026", calendarDone: "Finalizado", calendarSoon: "Próximamente", calendarLive: "En curso",
    calendarShowDetail: "Ver detalle por región", calendarHideDetail: "Ocultar detalle",
    statusUpcoming: "Próximos partidos",
    yourBet: "Tu pronóstico", replay: "Replay",
  },
  it: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Classifica",
    newsLabel: "News", newsBadge: "Valorant", newsTitle: "3 MASTERS NEL 2027", newsSub: "Un terzo torneo Masters si aggiungerebbe al calendario della prossima stagione.",
    news2Badge: "CS2", news2Title: "2 MILIONI $ IN PALIO", news2Sub: "Finale Esports World Cup 2026 CS2 · 23 ago · Parigi 🇫🇷",
    classementLabel: "Classifica", seeAll: "Vedi tutto", classementEmptyHome: "0 pronosticatori in classifica per ora. Sii il primo!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendario CS2", cs2CalendarCardSub: "Stages · IEM · Playoffs · Major",
    cs2CalendarModalTitle: "Programma CS2 2026", cs2CalendarEmpty: "Nessun evento da mostrare.",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronostici BO3 · tutte le leghe",
    bracketShow: "Vedi Bracket", bracketHide: "Nascondi Bracket", bracketUpper: "Upper Bracket", bracketLower: "Lower Bracket", bracketGrandFinal: "Gran Finale", bracketTBD: "TBD", bracketGroupStage: "Fase a gironi", bracketPlayIns: "Play-ins", bracketPlayoffs: "Playoffs", bracketKickoff: "Kickoff", bracketStage: "Stage", bracketMasters: "Masters", bracketChampions: "Champions", bracketNoEvent: "Nessun evento disponibile", bracketTeams: "Squadre", bracketStandings: "Classifica", bracketHistory: "Storico", bracketQualified: "Qualificato", bracketPoints: "Punti Championship",
    regionAll: "Tutto", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "Cina",
    cs2Title: "CS2", cs2Subtitle: "Pronostici BO3 · circuito mondiale",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    rlTitle: "ROCKET LEAGUE", rlSubtitle: "Risultati RLCS · tutte le regioni",
    rlRegionEurope: "Europe", rlRegionAmericas: "Americas", rlRegionOceania: "Oceania",
    cs2CircuitToggleShow: "Vedi il circuito CS2", cs2CircuitToggleHide: "Nascondi il circuito",
    cs2BracketShow: "Vedi Bracket", cs2BracketMajor: "Major", cs2BracketIEM: "IEM", cs2BracketBlast: "Blast", cs2BracketESL: "ESL", cs2BracketPGL: "PGL", cs2BracketGroupStage: "Fase a gironi", cs2BracketPlayoffs: "Playoffs", cs2BracketPlayIns: "Play-ins", cs2BracketFinal: "Finale", cs2BracketStage1: "Stage 1", cs2BracketStage2: "Stage 2", cs2BracketStage3: "Stage 3", cs2BracketNoEvent: "Nessun evento CS2 disponibile",
    cs2CircuitTitle: "Circuito CS2", cs2CircuitIntro: "Ispirato al sistema regionale di Valorant, ma senza leghe chiuse: le squadre avanzano tramite il ranking, non per franchising.",
    cs2CircuitRegions: "Regioni", cs2CircuitRegionsDesc: "3 grandi regioni seguite: Europe, Americas, Asia.",
    cs2CircuitRanking: "Ranking regionale", cs2CircuitRankingDesc: "Ogni squadra è classificata nella propria regione in base ai risultati recenti.",
    cs2CircuitQualifiers: "Inviti e Qualifiers", cs2CircuitQualifiersDesc: "Le migliori squadre di ogni regione ottengono un posto; la ripartizione varia in base al rendimento regionale.",
    cs2CircuitStages: "Fasi comuni", cs2CircuitStagesDesc: "Le squadre qualificate da tutte le regioni si ritrovano nelle stesse fasi — mai separate per regione.",
    cs2CircuitPlayoffs: "Playoffs", cs2CircuitPlayoffsDesc: "Le migliori squadre delle fasi comuni si sfidano per un posto in finale.",
    cs2CircuitChampions: "Champions", cs2CircuitChampionsDesc: "Il vertice del circuito, tutte le regioni insieme.",
    cs2RankingTitle: "Classifica regionale", cs2RankingSubtitle: "Basata sui risultati recenti di ogni squadra", cs2RankingEmpty: "Non ci sono ancora abbastanza risultati per una classifica.",
    today: "Oggi", tomorrow: "Domani",
    teamsTbc: "Squadre da confermare",
    seriesHint: "Inserisci un punteggio di serie valido sopra (es. 2-0, 2-1).",
    liveReveal: "Rivela",
    createPost: "Crea un post", postWrite: "Scrivi", postHistory: "Cronologia", postPlaceholder: "Condividi i tuoi risultati...", postPublish: "Pubblica", postEmpty: "Nessun post", postFeed: "Feed",
    messagesTitle: "Discussione", msgCommunity: "Comunità", msgDms: "Messaggi", msgEmpty: "Nessun messaggio", msgNoDms: "Nessuna conversazione", msgPlaceholder: "Messaggio...", msgDmPlaceholder: "Messaggio cifrato...",
    scoreInvalid: "13 pt min, 2 pt di scarto dopo il 12",
    alreadyWonSuffix: "avrebbe già vinto con questo punteggio",
    mustWinLastMap: "deve vincere l'ultima mappa",
    mustWinAllMaps: "deve vincere questa mappa in un 2-0",
    placeholderSoon: "Presto disponibile. Stiamo preparando i pronostici {label}, torna a trovarci!",
    classementTitle: "Classement", classementSubtitle: "Migliori pronosticatori della stagione", classementEmptyTitle: "0 utenti in classifica",
    classementEmptySub: "Nessuno ha ancora fatto un pronostico. Sii il primo a scalare la classifica!",
    catFilterLabel: "Categorie",
    profileTitle: "Il mio profilo", profilePseudo: "Nickname", profileBio: "Bio", profileAvatar: "Avatar",
    profileFavValo: "Squadra preferita Valorant", profileFavCs2: "Squadra preferita CS2", profileFavRl: "Squadra preferita RL",
    profileSave: "Salva", profileEdit: "Modifica", profileCreate: "Crea il tuo profilo",
    profileCreateSub: "Scegli un nickname, un avatar e le tue squadre preferite per apparire in classifica.",
    scoreTout: "TUTTO", scoreValo: "VALO", scoreCs2: "CS2", scoreRl: "RL",
    bioError: "Niente link, insulti o parolacce.",
    profileAmis: "Amici", profileTop: "Top", profilePoint: "Punto",
    profileModify: "Modifica profilo", profileHistory: "Storico:", profileFavLabel: "Squadre preferite",
    profileExact: "Esatto", profileBon: "Giusto", profileParie: "Scommesso",
    profileVoir: "vedi", profileAddFriend: "Aggiungi amico",
    friendTabSearch: "Cerca", friendTabFollowing: "Seguiti", friendTabFollowers: "Follower",
    friendSearchPlaceholder: "Nickname del giocatore...", friendFollow: "Segui", friendUnfollow: "Seguito",
    friendNoResults: "Nessun risultato.", friendNotFound: "Giocatore non trovato.",
    friendEmpty: "Nessuno per ora.", friendViewers: "Hanno visto il tuo profilo",
    profileBlock: "Blocca",
    settingsTitle: "Impostazioni", settingsNotifGames: "Notifiche per gioco",
    settingsNotifRegions: "Regioni",
    settingsFavTeam: "Squadra preferita", settingsFavTeamNone: "Nessuna squadra selezionata", settingsAccount: "Account",
    settingsGoogle: "Continua con Google", settingsOr: "oppure", settingsEmail: "Indirizzo email", settingsPassword: "Password", settingsLogin: "Accedi",
    settingsPseudo: "Nome utente", settingsPlan: "Piano", settingsPlanFree: "Gratuito", settingsPlanDesc: "Stai usando il piano gratuito.", settingsNotifications: "Notifiche", settingsLogout: "Esci", settingsForgotPwd: "Password dimenticata?", settingsForgotSent: "Funzionalità in arrivo.", settingsChangePwd: "Modifica", settingsPwdPlaceholder: "••••••••", settingsRewards: "Premi", settingsRewardsDesc: "In arrivo — guadagna premi pronosticando!", rewardsTitle: "Premi", rewardsGoal: "Primo premio sbloccato a 1.000 iscritti!", rewardsRegistered: "iscritti",
    calendarModalTitle: "Calendario VCT 2026", calendarDone: "Concluso", calendarSoon: "In arrivo", calendarLive: "In corso",
    calendarShowDetail: "Vedi dettagli per regione", calendarHideDetail: "Nascondi dettagli",
    statusUpcoming: "Prossime partite",
    yourBet: "Il tuo pronostico", replay: "Replay",
  },
  ja: {
    navHome: "ホーム", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "ランキング",
    newsLabel: "ニュース", newsBadge: "Valorant", newsTitle: "2027年に3つ目のマスターズ", newsSub: "来シーズン、3つ目のマスターズ大会が開催される見込みです。",
    news2Badge: "CS2", news2Title: "賞金200万ドル", news2Sub: "Esports World Cup 2026 CS2決勝 · 8月23日 · パリ 🇫🇷",
    classementLabel: "ランキング", seeAll: "すべて見る", classementEmptyHome: "現在ランキング登録者は0人です。最初の1人になろう!",
    calendarLabel: "カレンダー", calendarCardTitle: "VCT 2026 カレンダー", calendarCardSub: "Kickoff・Masters・Playoffs・Champions",
    cs2CalendarCardTitle: "CS2カレンダー", cs2CalendarCardSub: "Stages · IEM · Playoffs · Major",
    cs2CalendarModalTitle: "CS2プログラム 2026", cs2CalendarEmpty: "表示するイベントはありません。",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3予想・全リーグ",
    bracketShow: "ブラケットを見る", bracketHide: "ブラケットを隠す", bracketUpper: "アッパーブラケット", bracketLower: "ロワーブラケット", bracketGrandFinal: "グランドファイナル", bracketTBD: "TBD", bracketGroupStage: "グループステージ", bracketPlayIns: "プレイイン", bracketPlayoffs: "プレイオフ", bracketKickoff: "キックオフ", bracketStage: "ステージ", bracketMasters: "マスターズ", bracketChampions: "チャンピオンズ", bracketNoEvent: "イベントなし", bracketTeams: "チーム", bracketStandings: "順位表", bracketHistory: "履歴", bracketQualified: "出場確定", bracketPoints: "チャンピオンシップポイント",
    regionAll: "すべて", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "中国",
    cs2Title: "CS2", cs2Subtitle: "BO3予想・世界サーキット",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    rlTitle: "ROCKET LEAGUE", rlSubtitle: "RLCS結果・全リージョン",
    rlRegionEurope: "Europe", rlRegionAmericas: "Americas", rlRegionOceania: "Oceania",
    cs2CircuitToggleShow: "CS2サーキットを見る", cs2CircuitToggleHide: "サーキットを隠す",
    cs2BracketShow: "ブラケットを見る", cs2BracketMajor: "Major", cs2BracketIEM: "IEM", cs2BracketBlast: "Blast", cs2BracketESL: "ESL", cs2BracketPGL: "PGL", cs2BracketGroupStage: "グループステージ", cs2BracketPlayoffs: "プレイオフ", cs2BracketPlayIns: "プレイイン", cs2BracketFinal: "決勝", cs2BracketStage1: "Stage 1", cs2BracketStage2: "Stage 2", cs2BracketStage3: "Stage 3", cs2BracketNoEvent: "CS2イベントなし",
    cs2CircuitTitle: "CS2サーキット", cs2CircuitIntro: "Valorantの地域制度を参考にしつつ、クローズドリーグはなし：チームはフランチャイズではなくランキングで昇格します。",
    cs2CircuitRegions: "地域", cs2CircuitRegionsDesc: "追跡する3大地域：Europe、Americas、Asia。",
    cs2CircuitRanking: "地域ランキング", cs2CircuitRankingDesc: "各チームは直近の結果に基づき自地域内でランク付けされます。",
    cs2CircuitQualifiers: "招待・予選", cs2CircuitQualifiersDesc: "各地域の上位チームが出場権を得ます。地域ごとの枠数は成績によって変動します。",
    cs2CircuitStages: "共通ステージ", cs2CircuitStagesDesc: "全地域の出場チームが同じステージに集結します — 地域で分けられることはありません。",
    cs2CircuitPlayoffs: "プレーオフ", cs2CircuitPlayoffsDesc: "共通ステージを勝ち抜いた上位チームが決勝進出をかけて対戦します。",
    cs2CircuitChampions: "Champions", cs2CircuitChampionsDesc: "全地域を統合したサーキットの頂点。",
    cs2RankingTitle: "地域別ランキング", cs2RankingSubtitle: "各チームの直近の結果に基づく", cs2RankingEmpty: "ランキングを作成するにはまだ結果が足りません。",
    today: "今日", tomorrow: "明日",
    teamsTbc: "対戦カード未定",
    seriesHint: "上のボックスに有効なシリーズスコアを入力してください(例: 2-0、2-1)。",
    liveReveal: "表示",
    createPost: "投稿する", postWrite: "書く", postHistory: "履歴", postPlaceholder: "結果や分析をシェア...", postPublish: "投稿", postEmpty: "投稿なし", postFeed: "フィード",
    messagesTitle: "ディスカッション", msgCommunity: "コミュニティ", msgDms: "メッセージ", msgEmpty: "メッセージなし", msgNoDms: "会話なし", msgPlaceholder: "メッセージ...", msgDmPlaceholder: "暗号化メッセージ...",
    scoreInvalid: "13点先取、12点以降は2点差が必要",
    alreadyWonSuffix: "はこのスコアだと既に勝利しています",
    mustWinLastMap: "が最終マップを勝たなければなりません",
    mustWinAllMaps: "が2-0でこのマップを勝たなければなりません",
    placeholderSoon: "近日公開。{label}の予想機能を準備中です、お楽しみに!",
    classementTitle: "Classement", classementSubtitle: "シーズン予想王ランキング", classementEmptyTitle: "ランキング登録者0人",
    classementEmptySub: "まだ誰も予想していません。最初にランキングを駆け上がろう!",
    catFilterLabel: "カテゴリー",
    profileTitle: "マイプロフィール", profilePseudo: "ニックネーム", profileBio: "自己紹介", profileAvatar: "アバター",
    profileFavValo: "推しチーム Valorant", profileFavCs2: "推しチーム CS2", profileFavRl: "推しチーム RL",
    profileSave: "保存", profileEdit: "編集", profileCreate: "プロフィールを作成",
    profileCreateSub: "ニックネーム、アバター、推しチームを選んでランキングに参加しよう。",
    scoreTout: "全体", scoreValo: "VALO", scoreCs2: "CS2", scoreRl: "RL",
    bioError: "リンク・暴言・悪口は禁止です。",
    profileAmis: "フレンド", profileTop: "Top", profilePoint: "ポイント",
    profileModify: "プロフィール編集", profileHistory: "履歴：", profileFavLabel: "お気に入りチーム",
    profileExact: "完全一致", profileBon: "的中", profileParie: "予想数",
    profileVoir: "見る", profileAddFriend: "フレンド追加",
    friendTabSearch: "検索", friendTabFollowing: "フォロー中", friendTabFollowers: "フォロワー",
    friendSearchPlaceholder: "プレイヤー名...", friendFollow: "フォロー", friendUnfollow: "フォロー中",
    friendNoResults: "結果なし。", friendNotFound: "プレイヤーが見つかりません。",
    friendEmpty: "まだ誰もいません。", friendViewers: "プロフィールを見た人",
    profileBlock: "ブロック",
    settingsTitle: "設定", settingsNotifGames: "ゲーム別通知",
    settingsNotifRegions: "地域",
    settingsFavTeam: "お気に入りチーム", settingsFavTeamNone: "チーム未選択", settingsAccount: "アカウント",
    settingsGoogle: "Googleで続ける", settingsOr: "または", settingsEmail: "メールアドレス", settingsPassword: "パスワード", settingsLogin: "ログイン",
    settingsPseudo: "ユーザー名", settingsPlan: "プラン", settingsPlanFree: "無料", settingsPlanDesc: "無料プランをご利用中です。", settingsNotifications: "通知", settingsLogout: "ログアウト", settingsForgotPwd: "パスワードをお忘れですか？", settingsForgotSent: "近日公開予定です。", settingsChangePwd: "変更", settingsPwdPlaceholder: "••••••••", settingsRewards: "リワード", settingsRewardsDesc: "近日公開 — 予想して報酬をゲット！", rewardsTitle: "リワード", rewardsGoal: "登録者1,000人で初リワード解禁！", rewardsRegistered: "人登録済み",
    calendarModalTitle: "VCT 2026 カレンダー", calendarDone: "終了", calendarSoon: "開催予定", calendarLive: "開催中",
    calendarShowDetail: "地域別の詳細を見る", calendarHideDetail: "詳細を隠す",
    statusUpcoming: "今後の試合",
    yourBet: "あなたの予想", replay: "リプレイ",
  },
  de: {
    navHome: "Start", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Rangliste",
    newsLabel: "News", newsBadge: "Valorant", newsTitle: "3 MASTERS IN 2027", newsSub: "Ein drittes Masters-Turnier soll im Kalender der nächsten Saison hinzukommen.",
    news2Badge: "CS2", news2Title: "2 MIO. $ PREISGELD", news2Sub: "Esports World Cup 2026 CS2-Finale · 23. Aug. · Paris 🇫🇷",
    classementLabel: "Rangliste", seeAll: "Alle anzeigen", classementEmptyHome: "Bisher 0 platzierte Tipper. Sei der Erste!",
    calendarLabel: "Kalender", calendarCardTitle: "VCT-2026-Kalender", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2-Kalender", cs2CalendarCardSub: "Stages · IEM · Playoffs · Major",
    cs2CalendarModalTitle: "CS2-Programm 2026", cs2CalendarEmpty: "Keine Ereignisse anzuzeigen.",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3-Tipps · alle Ligen",
    bracketShow: "Bracket anzeigen", bracketHide: "Bracket ausblenden", bracketUpper: "Upper Bracket", bracketLower: "Lower Bracket", bracketGrandFinal: "Großes Finale", bracketTBD: "TBD", bracketGroupStage: "Gruppenphase", bracketPlayIns: "Play-ins", bracketPlayoffs: "Playoffs", bracketKickoff: "Kickoff", bracketStage: "Stage", bracketMasters: "Masters", bracketChampions: "Champions", bracketNoEvent: "Kein Event verfügbar", bracketTeams: "Teams", bracketStandings: "Tabelle", bracketHistory: "Verlauf", bracketQualified: "Qualifiziert", bracketPoints: "Championship-Punkte",
    regionAll: "Alle", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    cs2Title: "CS2", cs2Subtitle: "BO3-Tipps · weltweite Circuit",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    rlTitle: "ROCKET LEAGUE", rlSubtitle: "RLCS-Ergebnisse · alle Regionen",
    rlRegionEurope: "Europe", rlRegionAmericas: "Americas", rlRegionOceania: "Ozeanien",
    cs2CircuitToggleShow: "CS2-Circuit anzeigen", cs2CircuitToggleHide: "Circuit ausblenden",
    cs2BracketShow: "Bracket anzeigen", cs2BracketMajor: "Major", cs2BracketIEM: "IEM", cs2BracketBlast: "Blast", cs2BracketESL: "ESL", cs2BracketPGL: "PGL", cs2BracketGroupStage: "Gruppenphase", cs2BracketPlayoffs: "Playoffs", cs2BracketPlayIns: "Play-ins", cs2BracketFinal: "Finale", cs2BracketStage1: "Stage 1", cs2BracketStage2: "Stage 2", cs2BracketStage3: "Stage 3", cs2BracketNoEvent: "Kein CS2-Event verfügbar",
    cs2CircuitTitle: "CS2-Circuit", cs2CircuitIntro: "Inspiriert vom Valorant-Regionalsystem, aber ohne geschlossene Ligen: Teams steigen über das Ranking auf, nicht über ein Franchise.",
    cs2CircuitRegions: "Regionen", cs2CircuitRegionsDesc: "3 große Regionen im Blick: Europe, Americas, Asia.",
    cs2CircuitRanking: "Regionales Ranking", cs2CircuitRankingDesc: "Jedes Team wird innerhalb seiner Region nach den jüngsten Ergebnissen eingestuft.",
    cs2CircuitQualifiers: "Einladungen & Qualifiers", cs2CircuitQualifiersDesc: "Die besten Teams jeder Region erhalten einen Startplatz; die Anzahl der Plätze pro Region hängt von der regionalen Leistung ab.",
    cs2CircuitStages: "Gemeinsame Stages", cs2CircuitStagesDesc: "Qualifizierte Teams aus allen Regionen treffen in denselben Stages aufeinander — nie nach Region getrennt.",
    cs2CircuitPlayoffs: "Playoffs", cs2CircuitPlayoffsDesc: "Die besten Teams der gemeinsamen Stages kämpfen um einen Finalplatz.",
    cs2CircuitChampions: "Champions", cs2CircuitChampionsDesc: "Die Spitze des Circuits, alle Regionen vereint.",
    cs2RankingTitle: "Regionale Tabelle", cs2RankingSubtitle: "Basierend auf den jüngsten Ergebnissen jedes Teams", cs2RankingEmpty: "Noch nicht genug Ergebnisse für eine Rangliste.",
    today: "Heute", tomorrow: "Morgen",
    teamsTbc: "Teams noch offen",
    seriesHint: "Gib oben einen gültigen Serien-Score ein (z. B. 2-0, 2-1).",
    liveReveal: "Anzeigen",
    createPost: "Post erstellen", postWrite: "Schreiben", postHistory: "Verlauf", postPlaceholder: "Teile deine Ergebnisse...", postPublish: "Veröffentlichen", postEmpty: "Keine Posts", postFeed: "Feed",
    messagesTitle: "Diskussion", msgCommunity: "Community", msgDms: "Nachrichten", msgEmpty: "Keine Nachrichten", msgNoDms: "Keine Gespräche", msgPlaceholder: "Nachricht...", msgDmPlaceholder: "Verschlüsselte Nachricht...",
    scoreInvalid: "Mind. 13 Punkte, 2 Punkte Vorsprung nach 12",
    alreadyWonSuffix: "hätte mit diesem Ergebnis bereits gewonnen",
    mustWinLastMap: "muss die letzte Map gewinnen",
    mustWinAllMaps: "muss diese Map bei einem 2-0 gewinnen",
    placeholderSoon: "Bald verfügbar. Wir bereiten die {label}-Tipps vor, schau bald wieder vorbei!",
    classementTitle: "Classement", classementSubtitle: "Beste Tipper der Saison", classementEmptyTitle: "0 platzierte Nutzer",
    classementEmptySub: "Noch niemand hat getippt. Sei der Erste in der Rangliste!",
    catFilterLabel: "Kategorien",
    profileTitle: "Mein Profil", profilePseudo: "Nickname", profileBio: "Bio", profileAvatar: "Avatar",
    profileFavValo: "Lieblingsteam Valorant", profileFavCs2: "Lieblingsteam CS2", profileFavRl: "Lieblingsteam RL",
    profileSave: "Speichern", profileEdit: "Bearbeiten", profileCreate: "Erstelle dein Profil",
    profileCreateSub: "Wähle einen Nickname, ein Avatar und deine Lieblingsteams, um in der Rangliste zu erscheinen.",
    scoreTout: "ALLES", scoreValo: "VALO", scoreCs2: "CS2", scoreRl: "RL",
    bioError: "Keine Links, Beleidigungen oder Schimpfwörter.",
    profileAmis: "Freunde", profileTop: "Top", profilePoint: "Punkt",
    profileModify: "Profil bearbeiten", profileHistory: "Verlauf:", profileFavLabel: "Lieblingsteams",
    profileExact: "Exakt", profileBon: "Richtig", profileParie: "Gewettet",
    profileVoir: "ansehen", profileAddFriend: "Freund hinzufügen",
    friendTabSearch: "Suchen", friendTabFollowing: "Folge ich", friendTabFollowers: "Follower",
    friendSearchPlaceholder: "Spieler-Nickname...", friendFollow: "Folgen", friendUnfollow: "Gefolgt",
    friendNoResults: "Keine Ergebnisse.", friendNotFound: "Spieler nicht gefunden.",
    friendEmpty: "Noch niemand.", friendViewers: "Haben dein Profil gesehen",
    profileBlock: "Blockieren",
    settingsTitle: "Einstellungen", settingsNotifGames: "Benachrichtigungen nach Spiel",
    settingsNotifRegions: "Regionen",
    settingsFavTeam: "Lieblingsteam", settingsFavTeamNone: "Kein Team ausgewählt", settingsAccount: "Konto",
    settingsGoogle: "Weiter mit Google", settingsOr: "oder", settingsEmail: "E-Mail-Adresse", settingsPassword: "Passwort", settingsLogin: "Anmelden",
    settingsPseudo: "Benutzername", settingsPlan: "Abo", settingsPlanFree: "Kostenlos", settingsPlanDesc: "Du nutzt das kostenlose Abo.", settingsNotifications: "Benachrichtigungen", settingsLogout: "Abmelden", settingsForgotPwd: "Passwort vergessen?", settingsForgotSent: "Funktion kommt bald.", settingsChangePwd: "Ändern", settingsPwdPlaceholder: "••••••••", settingsRewards: "Belohnungen", settingsRewardsDesc: "Kommt bald — verdiene Belohnungen durch Tippen!", rewardsTitle: "Belohnungen", rewardsGoal: "Erste Belohnung bei 1.000 Registrierungen!", rewardsRegistered: "registriert",
    calendarModalTitle: "VCT-2026-Kalender", calendarDone: "Beendet", calendarSoon: "Bevorstehend", calendarLive: "Läuft gerade",
    calendarShowDetail: "Details nach Region anzeigen", calendarHideDetail: "Details ausblenden",
    statusUpcoming: "Bevorstehende Spiele",
    yourBet: "Dein Tipp", replay: "Replay",
  },
  cn: {
    navHome: "首页", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "排行榜",
    newsLabel: "资讯", newsBadge: "Valorant", newsTitle: "2027年将迎来第三场大师赛", newsSub: "下赛季日程中可能新增第三场大师赛(Masters)。",
    news2Badge: "CS2", news2Title: "200万美元奖金", news2Sub: "2026电竞世界杯CS2总决赛 · 8月23日 · 巴黎 🇫🇷",
    classementLabel: "排行榜", seeAll: "查看全部", classementEmptyHome: "目前还没有上榜用户，快来当第一人!",
    calendarLabel: "赛程日历", calendarCardTitle: "VCT 2026赛程日历", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2赛程", cs2CalendarCardSub: "Stages · IEM · Playoffs · Major",
    cs2CalendarModalTitle: "CS2赛程 2026", cs2CalendarEmpty: "暂无赛事。",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3竞猜 · 全部赛区",
    bracketShow: "查看赛程", bracketHide: "隐藏赛程", bracketUpper: "胜者组", bracketLower: "败者组", bracketGrandFinal: "总决赛", bracketTBD: "待定", bracketGroupStage: "小组赛", bracketPlayIns: "入围赛", bracketPlayoffs: "季后赛", bracketKickoff: "揭幕战", bracketStage: "常规赛", bracketMasters: "大师赛", bracketChampions: "冠军赛", bracketNoEvent: "暂无赛事", bracketTeams: "战队", bracketStandings: "积分榜", bracketHistory: "历史", bracketQualified: "已晋级", bracketPoints: "冠军积分",
    regionAll: "全部", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "中国",
    cs2Title: "CS2", cs2Subtitle: "BO3竞猜 · 全球赛事体系",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    rlTitle: "ROCKET LEAGUE", rlSubtitle: "RLCS赛果 · 所有赛区",
    rlRegionEurope: "Europe", rlRegionAmericas: "Americas", rlRegionOceania: "大洋洲",
    cs2CircuitToggleShow: "查看CS2赛事体系", cs2CircuitToggleHide: "隐藏赛事体系",
    cs2BracketShow: "查看赛程", cs2BracketMajor: "Major", cs2BracketIEM: "IEM", cs2BracketBlast: "Blast", cs2BracketESL: "ESL", cs2BracketPGL: "PGL", cs2BracketGroupStage: "小组赛", cs2BracketPlayoffs: "淘汰赛", cs2BracketPlayIns: "入围赛", cs2BracketFinal: "决赛", cs2BracketStage1: "Stage 1", cs2BracketStage2: "Stage 2", cs2BracketStage3: "Stage 3", cs2BracketNoEvent: "暂无CS2赛事",
    cs2CircuitTitle: "CS2赛事体系", cs2CircuitIntro: "灵感来自Valorant的分区制度，但没有封闭联赛：战队凭积分晋级，而非特许经营。",
    cs2CircuitRegions: "赛区", cs2CircuitRegionsDesc: "追踪三大赛区：Europe、Americas、Asia。",
    cs2CircuitRanking: "赛区排名", cs2CircuitRankingDesc: "每支战队根据近期战绩在其赛区内排名。",
    cs2CircuitQualifiers: "邀请赛与资格赛", cs2CircuitQualifiersDesc: "各赛区排名靠前的战队获得名额；各赛区名额分配会随赛区整体战绩变化。",
    cs2CircuitStages: "共同赛段", cs2CircuitStagesDesc: "各赛区晋级的战队汇聚到相同的赛段 — 从不按赛区分开。",
    cs2CircuitPlayoffs: "季后赛", cs2CircuitPlayoffsDesc: "共同赛段的最佳战队争夺决赛名额。",
    cs2CircuitChampions: "Champions", cs2CircuitChampionsDesc: "赛事体系的顶点，汇聚所有赛区。",
    cs2RankingTitle: "赛区排行榜", cs2RankingSubtitle: "根据各战队近期战绩计算", cs2RankingEmpty: "战绩数据尚不足以生成排行榜。",
    today: "今天", tomorrow: "明天",
    teamsTbc: "对阵尚未确定",
    seriesHint: "请在上方输入有效的系列赛比分(如2-0、2-1)。",
    liveReveal: "查看",
    createPost: "创建帖子", postWrite: "写", postHistory: "历史", postPlaceholder: "分享你的结果...", postPublish: "发布", postEmpty: "暂无帖子", postFeed: "动态",
    messagesTitle: "讨论", msgCommunity: "社区", msgDms: "私信", msgEmpty: "暂无消息", msgNoDms: "暂无对话", msgPlaceholder: "消息...", msgDmPlaceholder: "加密消息...",
    scoreInvalid: "先得13分，12平后须净胜2分",
    alreadyWonSuffix: "按这个比分已经提前获胜了",
    mustWinLastMap: "必须赢得最后一张地图",
    mustWinAllMaps: "在2-0中必须赢得此地图",
    placeholderSoon: "敬请期待。{label}竞猜功能筹备中，请稍后再来查看!",
    classementTitle: "Classement", classementSubtitle: "本赛季竞猜达人榜", classementEmptyTitle: "0名上榜用户",
    classementEmptySub: "还没有人做出竞猜，快来抢占排行榜第一名!",
    catFilterLabel: "分类",
    profileTitle: "我的资料", profilePseudo: "昵称", profileBio: "简介", profileAvatar: "头像",
    profileFavValo: "最爱Valorant战队", profileFavCs2: "最爱CS2战队", profileFavRl: "最爱RL战队",
    profileSave: "保存", profileEdit: "编辑", profileCreate: "创建你的资料",
    profileCreateSub: "选择昵称、头像和最爱的战队，即可出现在排行榜中。",
    scoreTout: "全部", scoreValo: "VALO", scoreCs2: "CS2", scoreRl: "RL",
    bioError: "链接、侮辱或脏话禁止使用。",
    profileAmis: "好友", profileTop: "排名", profilePoint: "积分",
    profileModify: "编辑资料", profileHistory: "历史记录：", profileFavLabel: "最爱战队",
    profileExact: "精准", profileBon: "正确", profileParie: "已竞猜",
    profileVoir: "查看", profileAddFriend: "添加好友",
    friendTabSearch: "搜索", friendTabFollowing: "关注", friendTabFollowers: "粉丝",
    friendSearchPlaceholder: "玩家昵称...", friendFollow: "关注", friendUnfollow: "已关注",
    friendNoResults: "无结果。", friendNotFound: "未找到该玩家。",
    friendEmpty: "暂无。", friendViewers: "查看了你的资料",
    profileBlock: "屏蔽",
    settingsTitle: "设置", settingsNotifGames: "按游戏通知",
    settingsNotifRegions: "地区",
    settingsFavTeam: "喜爱的战队", settingsFavTeamNone: "未选择战队", settingsAccount: "账户",
    settingsGoogle: "使用Google继续", settingsOr: "或", settingsEmail: "电子邮箱", settingsPassword: "密码", settingsLogin: "登录",
    settingsPseudo: "用户名", settingsPlan: "套餐", settingsPlanFree: "免费", settingsPlanDesc: "你正在使用免费套餐。", settingsNotifications: "通知", settingsLogout: "退出登录", settingsForgotPwd: "忘记密码？", settingsForgotSent: "功能即将上线。", settingsChangePwd: "修改", settingsPwdPlaceholder: "••••••••", settingsRewards: "奖励", settingsRewardsDesc: "即将上线 — 预测赢取奖励！", rewardsTitle: "奖励", rewardsGoal: "注册满1000人解锁首个奖励！", rewardsRegistered: "已注册",
    calendarModalTitle: "VCT 2026赛程日历", calendarDone: "已结束", calendarSoon: "即将开始", calendarLive: "进行中",
    calendarShowDetail: "查看各赛区详情", calendarHideDetail: "收起详情",
    statusUpcoming: "即将进行的比赛",
    yourBet: "你的竞猜", replay: "回放",
  },
};

const TIMELINE_I18N = {
  fr: [
    { key: "kickoff", title: "Kickoff", start: "2026-01-15", end: "2026-02-16", range: "Janvier – Février 2026", detail: [
      { region: "AMERICAS", text: "15 janv. – 16 févr." }, { region: "EMEA", text: "20 janv. – 15 févr." },
      { region: "PACIFIC", text: "22 janv. – 15 févr." }, { region: "CN", text: "21 janv. – 9 févr." } ] },
    { key: "masters1", title: "Masters Santiago", start: "2026-02-28", end: "2026-03-15", range: "28 févr. – 15 mars 2026 · Chili" },
    { key: "masters2", title: "Masters London", start: "2026-06-06", end: "2026-06-21", range: "6 – 21 juin 2026 · Royaume-Uni" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-20", end: "2026-09-06", range: "Fin août 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20 – 31 août" }, { region: "AMERICAS", text: "27 août – 5 sept." },
      { region: "PACIFIC", text: "27 août – 6 sept." }, { region: "CN", text: "Fin du Stage 2 le 23 août" } ] },
    { key: "champions", title: "Champions", start: "2026-09-24", end: "2026-10-18", range: "24 sept. – 18 oct. 2026 · Shanghai, Chine" },
  ],
  en: [
    { key: "kickoff", title: "Kickoff", start: "2026-01-15", end: "2026-02-16", range: "January – February 2026", detail: [
      { region: "AMERICAS", text: "Jan 15 – Feb 16" }, { region: "EMEA", text: "Jan 20 – Feb 15" },
      { region: "PACIFIC", text: "Jan 22 – Feb 15" }, { region: "CN", text: "Jan 21 – Feb 9" } ] },
    { key: "masters1", title: "Masters Santiago", start: "2026-02-28", end: "2026-03-15", range: "Feb 28 – Mar 15, 2026 · Chile" },
    { key: "masters2", title: "Masters London", start: "2026-06-06", end: "2026-06-21", range: "Jun 6–21, 2026 · United Kingdom" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-20", end: "2026-09-06", range: "Late August 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "Aug 20–31" }, { region: "AMERICAS", text: "Aug 27 – Sep 5" },
      { region: "PACIFIC", text: "Aug 27 – Sep 6" }, { region: "CN", text: "Stage 2 ends Aug 23" } ] },
    { key: "champions", title: "Champions", start: "2026-09-24", end: "2026-10-18", range: "Sep 24 – Oct 18, 2026 · Shanghai, China" },
  ],
  es: [
    { key: "kickoff", title: "Kickoff", start: "2026-01-15", end: "2026-02-16", range: "Enero – Febrero 2026", detail: [
      { region: "AMERICAS", text: "15 ene. – 16 feb." }, { region: "EMEA", text: "20 ene. – 15 feb." },
      { region: "PACIFIC", text: "22 ene. – 15 feb." }, { region: "CN", text: "21 ene. – 9 feb." } ] },
    { key: "masters1", title: "Masters Santiago", start: "2026-02-28", end: "2026-03-15", range: "28 feb. – 15 mar. 2026 · Chile" },
    { key: "masters2", title: "Masters London", start: "2026-06-06", end: "2026-06-21", range: "6–21 jun. 2026 · Reino Unido" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-20", end: "2026-09-06", range: "Finales de agosto 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20–31 ago." }, { region: "AMERICAS", text: "27 ago. – 5 sept." },
      { region: "PACIFIC", text: "27 ago. – 6 sept." }, { region: "CN", text: "Fin del Stage 2 el 23 de agosto" } ] },
    { key: "champions", title: "Champions", start: "2026-09-24", end: "2026-10-18", range: "24 sept. – 18 oct. 2026 · Shanghái, China" },
  ],
  it: [
    { key: "kickoff", title: "Kickoff", start: "2026-01-15", end: "2026-02-16", range: "Gennaio – Febbraio 2026", detail: [
      { region: "AMERICAS", text: "15 gen – 16 feb" }, { region: "EMEA", text: "20 gen – 15 feb" },
      { region: "PACIFIC", text: "22 gen – 15 feb" }, { region: "CN", text: "21 gen – 9 feb" } ] },
    { key: "masters1", title: "Masters Santiago", start: "2026-02-28", end: "2026-03-15", range: "28 feb – 15 mar 2026 · Cile" },
    { key: "masters2", title: "Masters London", start: "2026-06-06", end: "2026-06-21", range: "6–21 giu 2026 · Regno Unito" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-20", end: "2026-09-06", range: "Fine agosto 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20–31 ago" }, { region: "AMERICAS", text: "27 ago – 5 set" },
      { region: "PACIFIC", text: "27 ago – 6 set" }, { region: "CN", text: "Fine dello Stage 2 il 23 agosto" } ] },
    { key: "champions", title: "Champions", start: "2026-09-24", end: "2026-10-18", range: "24 set – 18 ott 2026 · Shanghai, Cina" },
  ],
  de: [
    { key: "kickoff", title: "Kickoff", start: "2026-01-15", end: "2026-02-16", range: "Januar – Februar 2026", detail: [
      { region: "AMERICAS", text: "15. Jan. – 16. Feb." }, { region: "EMEA", text: "20. Jan. – 15. Feb." },
      { region: "PACIFIC", text: "22. Jan. – 15. Feb." }, { region: "CN", text: "21. Jan. – 9. Feb." } ] },
    { key: "masters1", title: "Masters Santiago", start: "2026-02-28", end: "2026-03-15", range: "28. Feb. – 15. März 2026 · Chile" },
    { key: "masters2", title: "Masters London", start: "2026-06-06", end: "2026-06-21", range: "6.–21. Juni 2026 · Vereinigtes Königreich" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-20", end: "2026-09-06", range: "Ende August 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20.–31. Aug." }, { region: "AMERICAS", text: "27. Aug. – 5. Sept." },
      { region: "PACIFIC", text: "27. Aug. – 6. Sept." }, { region: "CN", text: "Stage 2 endet am 23. August" } ] },
    { key: "champions", title: "Champions", start: "2026-09-24", end: "2026-10-18", range: "24. Sept. – 18. Okt. 2026 · Shanghai, China" },
  ],
  ja: [
    { key: "kickoff", title: "Kickoff", start: "2026-01-15", end: "2026-02-16", range: "2026年1月~2月", detail: [
      { region: "AMERICAS", text: "1月15日~2月16日" }, { region: "EMEA", text: "1月20日~2月15日" },
      { region: "PACIFIC", text: "1月22日~2月15日" }, { region: "CN", text: "1月21日~2月9日" } ] },
    { key: "masters1", title: "Masters Santiago", start: "2026-02-28", end: "2026-03-15", range: "2026年2月28日~3月15日・チリ" },
    { key: "masters2", title: "Masters London", start: "2026-06-06", end: "2026-06-21", range: "2026年6月6日~21日・イギリス" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-20", end: "2026-09-06", range: "2026年8月下旬・Stage 2", big: true, detail: [
      { region: "EMEA", text: "8月20日~31日" }, { region: "AMERICAS", text: "8月27日~9月5日" },
      { region: "PACIFIC", text: "8月27日~9月6日" }, { region: "CN", text: "Stage 2は8月23日終了" } ] },
    { key: "champions", title: "Champions", start: "2026-09-24", end: "2026-10-18", range: "2026年9月24日~10月18日・中国・上海" },
  ],
  cn: [
    { key: "kickoff", title: "Kickoff", start: "2026-01-15", end: "2026-02-16", range: "2026年1月–2月", detail: [
      { region: "AMERICAS", text: "1月15日–2月16日" }, { region: "EMEA", text: "1月20日–2月15日" },
      { region: "PACIFIC", text: "1月22日–2月15日" }, { region: "CN", text: "1月21日–2月9日" } ] },
    { key: "masters1", title: "Masters Santiago", start: "2026-02-28", end: "2026-03-15", range: "2026年2月28日–3月15日·智利" },
    { key: "masters2", title: "Masters London", start: "2026-06-06", end: "2026-06-21", range: "2026年6月6日–21日·英国" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-20", end: "2026-09-06", range: "2026年8月下旬·Stage 2", big: true, detail: [
      { region: "EMEA", text: "8月20日–31日" }, { region: "AMERICAS", text: "8月27日–9月5日" },
      { region: "PACIFIC", text: "8月27日–9月6日" }, { region: "CN", text: "Stage 2将于8月23日结束" } ] },
    { key: "champions", title: "Champions", start: "2026-09-24", end: "2026-10-18", range: "2026年9月24日–10月18日·中国上海" },
  ],
};

// Statut calculé dynamiquement à partir des dates start/end de chaque étape
// (comparées à aujourd'hui), plutôt qu'un statut "done"/"soon" figé à la
// main dans TIMELINE_I18N — sinon ça devient faux dès que le calendrier
// réel avance (ex: "Playoffs bientôt" alors qu'ils ont déjà commencé).
function computeStageStatus(stage, todayISO) {
  if (!stage.start || !stage.end) return stage.status || "soon"; // repli si jamais une entrée n'a pas de dates
  if (todayISO < stage.start) return "soon";
  if (todayISO > stage.end) return "done";
  return "live";
}

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function getTodayISO() { return isoDate(new Date()); }
function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function dayLabel(dateStr, lang, T) {
  const today = getTodayISO();
  if (dateStr === today) return T.today;
  if (dateStr === addDaysISO(today, 1)) return T.tomorrow;
  const locale = LOCALE_MAP[lang] || "fr-FR";
  const d = new Date(dateStr + "T00:00:00");
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(d);
  } catch (e) {
    return dateStr;
  }
}

function regionLabel(key, T) {
  if (key === "EMEA") return T.regionEmea;
  if (key === "PACIFIC") return T.regionPacific;
  if (key === "AMERICAS") return T.regionAmericas;
  if (key === "CN") return T.regionChine;
  return key;
}

// Régions du circuit CS2 : Europe / Americas / Asia, calquées sur le
// découpage officiel Valve des RMR (Regional Major Rankings). Contrairement
// à REGIONS (VCT), ceci classe des ÉQUIPES, pas des matchs/ligues — un match
// peut très bien opposer une équipe EUROPE à une équipe AMERICAS dans un
// stage commun (Major, IEM, BLAST...).
const REGIONS_CS2 = [
  { key: "EUROPE", accent: "#F5D400" },
  { key: "AMERICAS", accent: "#FF3B30" },
  { key: "ASIA", accent: "#34D058" },
];

function regionLabelCS2(key, T) {
  if (key === "EUROPE") return T.cs2RegionEurope;
  if (key === "AMERICAS") return T.cs2RegionAmericas;
  if (key === "ASIA") return T.cs2RegionAsia;
  return key;
}

function catLabel(key, T) {
  if (key === "VALORANT") return T.navValorant;
  if (key === "CSGO") return T.navCsgo;
  if (key === "RL") return T.navRl;
  return key;
}

// --- Données live (PandaScore via le proxy API) ---
// L'URL du backend est définie via la variable d'environnement VITE_API_BASE
// (à configurer dans Railway ou dans un fichier .env local, voir .env.example)
const API_BASE = import.meta.env.VITE_API_BASE || "";

function classifyRegion(text) {
  const t = (text || "").toLowerCase();
  // On exclut le circuit féminin VCT Game Changers, l'API PandaScore le renvoie
  // mélangé avec le circuit principal (même mots-clés de région).
  if (t.includes("game changers")) return null;
  if (t.includes("america")) return "AMERICAS";
  if (t.includes("pacific")) return "PACIFIC";
  if (t.includes("emea")) return "EMEA";
  if (t.includes("china")) return "CN";
  return null; // ligue non suivie -> on l'ignore
}

// Corrections manuelles de codes d'équipe : PandaScore renvoie parfois un
// acronyme faux/imprécis (mal généré côté source), ou carrément aucun
// acronyme (l'onglet "Terminé" retombe alors sur les 4 premières lettres du
// nom complet, ex. "Global Esports" -> "GLOB"). Ajoute une entrée ici pour
// chaque code fautif repéré, qu'il vienne d'un acronyme ou de ce fallback.
const TEAM_CODE_OVERRIDES = {
  OSG: "ONG",
  KRX: "DRX",
  KIWO: "DRX",
  KEEP: "KBG",
  FUNP: "FPX",
  GLOBAL: "GE",
  GLOB: "GE",
  "A TE": "AT",
  WOLV: "WE",
  WOLVES: "WE",
  NV: "ENVY",
  "FORZE.R": "FORZ",
  "EX-MANA": "EX-M",
  VITA: "VIT",
  GIAN: "GIANTX",
  ETER: "EF",
  JOBL: "JL",
  "BBL ": "BBL",
  FIRE: "FF",
  PCIF: "PCIF",
  ENTE: "ENT",
  EINT: "FORT",
  FNAT: "FNC",
  KARM: "KC",
  LEVI: "LEV",
  "KRÜ": "KRU",
  "100 ": "100T",
  CLOU: "C9",
  SENT: "SEN",
  FURI: "FUR",
  "GEN.": "GENG",
  DETO: "DFM",
  FULL: "FS",
  NONG: "NS",
  PAPE: "PR",
  EVIL: "EG",
  FLUXO: "W7M",
  FLUX: "W7M",
  BEST: "BEST",
  SHAR: "SHRP",
  XIPT: "XIPT",
  "REX ": "RRQ",
  DRAG: "DRG",
  EDWA: "EDG",
  BILI: "BLG",
  "JD G": "JDG",
  TRAC: "TE",
  TYLO: "TYL",
  NOVA: "NOVA",
  TITA: "TEC",
  "XI L": "XLG",
  "ALL ": "AG",
  "QT D": "QTD",
  ONSI: "ONG",
  "2GAM": "2G",
  M80: "M80",
  COMP: "COL",
  IMPE: "IMP",
  THEM: "MGL",
  LYNN: "LV",
  VIRT: "VP",
  PASS: "PUA",
  RARE: "RA",
  BETB: "BB",
  SASH: "SASH",
  INTO: "ITB",
  LEGA: "LEG",
  CHIN: "CW",
  PERM: "PRMT",
  ROOS: "RST",
  GRAY: "GH",
  MIND: "MFR",
  NEMI: "NMG",
  AURO: "AUR",
  ECST: "ECST",
  APEK: "APKS",
  NIPE: "NIP",
  "NIP.": "NIP",
  "NIP ": "NIP",
  FIVE: "5S",
  "5STA": "5S",
  FALCO: "FALC",
  FALCON: "FALC",
  "FALC ": "FALC",
  WILD: "WC",
  "WILDC": "WC",
  "R8 E": "R8",
  GENT: "M8",
};

// Corrections par nom complet exact : utilisées quand PandaScore ne renvoie
// aucun acronyme ET que le fallback "4 premières lettres" ne donne pas un
// code correct/prévisible (ex. "FUT Esports" -> "FUT " avec un espace en
// trop, qui ne matcherait même pas une entrée dans TEAM_CODE_OVERRIDES).
const NAME_CODE_OVERRIDES = {
  "FUT Esports": "FUT",
  "Gentle Mates": "M8",
  "Natus Vincere": "NAVI",
  "Team Spirit": "SP",
  "Shopify Rebellion": "SR",
  "Ninjas in Pyjamas": "NIP",
  "NRG Esports": "NRG",
  "Joblife": "JL",
  "GIANTX": "GIANTX",
  "Eternal Fire": "EF",
  "BBL Esports": "BBL",
  "Fire Flux Esports": "FF",
  "PCIFIC Esports": "PCIF",
  "Enterprise Esports": "ENT",
  "Eintracht Frankfurt": "FORT",
  "FNATIC": "FNC",
  "Karmine Corp": "KC",
  "Team Liquid": "TL",
  "Team Vitality": "VIT",
  "Team Heretics": "TH",
  "Paper Rex": "PR",
  "Evil Geniuses": "EG",
  "LEVIATÁN": "LEV",
  "KRÜ Esports": "KRU",
  "100 Thieves": "100T",
  "Cloud9": "C9",
  "Sentinels": "SEN",
  "LOUD": "LOUD",
  "FURIA": "FUR",
  "Gen.G": "GENG",
  "DetonatioN FocusMe": "DFM",
  "FULL SENSE": "FS",
  "Nongshim RedForce": "NS",
  "MIBR": "MIBR",
  "G2 Esports": "G2",
  "B8 Esports": "B8",
  "Bleed Esports": "BST",
  "ONIC Esports": "ONG",
  "ZETA DIVISION": "ZETA",
  "Ice Esports": "ICE",
  "Pain Gaming": "PAIN",
  "VARREL": "VARR",
  "KIWOOM DRX": "DRX",
  "Fluxo W7M": "W7M",
  "ENVY": "ENVY",
  "Xerxia Esports": "XIP",
  "Talon Esports": "TS",
  "W7M Esports": "W7M",
  "T1": "T1",
  "Team Secret": "TS",
  "M80": "M80",
  "BESTIA": "BEST",
  "2Game Esports": "2G",
  "EDward Gaming": "EDG",
  "Bilibili Gaming": "BLG",
  "JD Gaming": "JDG",
  "FunPlus Phoenix": "FPX",
  "Trace Esports": "TE",
  "TYLOO": "TYL",
  "Nova Esports": "NOVA",
  "Dragon Ranger Gaming": "DRG",
  "Global Esports": "GE",
  "Rex Regum Qeon": "RRQ",
  "Team Envy": "ENVY",
  "FaZe Clan": "FAZE",
  "FaZe": "FAZE",
  "Heroic": "HERO",
  "MOUZ": "MOUZ",
  "Astralis": "ASTR",
  "Complexity Gaming": "COL",
  "Imperial Esports": "IMP",
  "TheMongolz": "MGL",
  "GamerLegion": "GL",
  "SAW": "SAW",
  "BIG": "BIG",
  "Monte": "MNT",
  "Falcons Esports": "FALC",
  "Team Falcons": "FALC",
  "9 Pandas": "9PD",
  "9INE": "9INE",
  "Virtus.pro": "VP",
  "Lynn Vision": "LV",
  "Wildcard Gaming": "WC",
  "paiN Gaming": "PAIN",
  "Apeks": "APKS",
  "Passion UA": "PUA",
  "Rare Atom": "RA",
  "Spirit Academy": "SPA",
  "Nemiga Gaming": "NMG",
  "Aurora Gaming": "AUR",
  "Betboom Team": "BB",
  "BetBoom Team": "BB",
  "Fnatic": "FNC",
  "ECSTATIC": "ECST",
  "Sashi Esport": "SASH",
  "Into the Breach": "ITB",
  "Legacy": "LEG",
  "Sharks Esports": "SHK",
  "ODDIK": "ODDIK",
  "RED Canids": "RED",
  "Chinggis Warriors": "CW",
  "Permitta Esports": "PRMT",
  "Rooster": "RST",
  "Grayhound Gaming": "GH",
  "Mindfreak": "MFR",
  "Encore": "ENC",
  "Acend": "ACE",
  "UNiTY": "UNI",
  "UNiTY Esports": "UNI",
  "Phantom Esports": "PHT",
  "Phantom": "PHT",
  "Leo": "LEO",
  "SINNERS": "SIN",
  "SINNERS Esports": "SIN",
  "Bushido Wildcats": "BWC",
  "Inner Circle Prospect": "ICP",
  "INOX Division": "INOX",
  "Misa Esports": "MISA",
  "Vitality Academy": "VITA",
  "NIP Estar": "NIP",
  "Ninjas in Pyjamas Estar": "NIP",
  "M8 Esports": "M8",
  "R8 Esports": "R8",
  "R8": "R8",
  "Five Star": "5S",
  "5 Star": "5S",
  "Wildcard": "WC",
  "BIG Clan": "BIG",
  "Dignitas": "DIG",
  "Gentle Mates Alpine": "M8",
};

function teamCode(opp) {
  if (!opp) return "TBD";
  let raw = null;
  if (opp.acronym) {
    raw = opp.acronym.toUpperCase();
  } else if (opp.name) {
    raw = NAME_CODE_OVERRIDES[opp.name] || opp.name.slice(0, 4).toUpperCase();
  }
  if (!raw) return "TBD";
  return TEAM_CODE_OVERRIDES[raw] || raw;
}

// Garde-fou anti-données incohérentes (Valorant + CS2) : si le score de
// série dit 2-0, aucune map ne doit donner l'équipe perdante gagnante — ça
// n'a aucun sens et trahit presque toujours une mauvaise correspondance
// automatique (Liquipedia/odds-api.io qui a trouvé le score d'un AUTRE
// match). On compte les maps gagnées par chaque équipe dans map_scores et on
// vérifie que ça correspond exactement au score de série connu ; si ce n'est
// pas le cas, on préfère n'afficher AUCUN score par map plutôt qu'un faux.
function isMapScoresConsistent(mapScores, score1, score2) {
  if (!Array.isArray(mapScores) || mapScores.length === 0) return true;
  if (score1 == null || score2 == null) return true;
  let wins1 = 0;
  let wins2 = 0;
  for (const mp of mapScores) {
    if (mp.score1 > mp.score2) wins1++;
    else if (mp.score2 > mp.score1) wins2++;
  }
  if (wins1 === score1 && wins2 === score2) return true;
  if (wins1 === score2 && wins2 === score1) {
    for (const mp of mapScores) {
      const tmp = mp.score1; mp.score1 = mp.score2; mp.score2 = tmp;
    }
    return true;
  }
  return false;
}

function transformMatch(m) {
  const opponents = m.opponents || [];
  const t1 = opponents[0] && opponents[0].opponent;
  const t2 = opponents[1] && opponents[1].opponent;
  const beginRaw = m.begin_at || m.scheduled_at || m.original_scheduled_at;
  const d = beginRaw ? new Date(beginRaw) : null;
  const regionText = [m.serie?.full_name, m.serie?.name, m.league?.name].filter(Boolean).join(" ");
  const region = classifyRegion(regionText);
  const results = m.results || [];
  const score1 = t1 ? (results.find((r) => r.team_id === t1.id) || {}).score : undefined;
  const score2 = t2 ? (results.find((r) => r.team_id === t2.id) || {}).score : undefined;

  return {
    id: "ps-" + m.id,
    day: d ? isoDate(d) : null,
    time: d ? pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : "",
    beginAt: beginRaw || null,
    league: (m.league && m.league.name) || "VCT",
    phase: (m.serie && m.serie.full_name) || (m.tournament && m.tournament.name) || "",
    // Nom du tournoi tel quel (distinct de `phase`, qui peut déjà être le nom
    // du serie) : sert uniquement à détecter/afficher le tag "Playoffs".
    tournamentName: (m.tournament && m.tournament.name) || "",
    team1: teamCode(t1),
    team2: teamCode(t2),
    team1Name: t1 ? t1.name : null,
    team2Name: t2 ? t2.name : null,
    team1Logo: t1 ? t1.image_url : null,
    team2Logo: t2 ? t2.image_url : null,
    region,
    status: m.status || "not_started",
    score1: score1,
    score2: score2,
    // Niveau du tournoi : champ dédié côté historique custom, sinon le vrai nom
    // de ligue PandaScore (matchs live/upcoming/valorant-results). Sert à pondérer
    // le winrate — battre une petite équipe en tournoi régional ne doit pas
    // compter pareil que battre une équipe VCT.
    tier: m.tier || (m.league && m.league.name) || null,
    // Score détaillé par map (13-9 etc.), récupéré via vlr.gg côté backend
    // (/api/valorant-results). Sans cette ligne, la donnée existe dans la
    // réponse brute du backend mais se perd ici avant d'arriver à MatchCard.
    // Passée au garde-fou de cohérence (cf isMapScoresConsistent) avant
    // d'être acceptée.
    map_scores: isMapScoresConsistent(m.map_scores, score1, score2) ? m.map_scores || null : null,
    live_map_scores: m.status === "running" ? (m.live_map_scores || null) : null,
    number_of_games: m.number_of_games || 3,
  };
}

// --- Équivalent CS2 de transformMatch ---------------------------------
// Différence clé avec Valorant : pas de `region` unique par MATCH (les
// stages CS2 mélangent les régions), mais une région par ÉQUIPE
// (team1Region/team2Region), déjà calculée côté backend (cf cs2-routes.js
// Résultats CS2 saisis à la main : lus depuis cs2-manual-results.json (un
// simple fichier de données à côté de ce fichier, pas du code) — sert de
// repli en attendant que Liquipedia/odds-api.io/PandaScore trouvent le
// score par map tout seuls pour ces matchs précis. Purement côté front,
// aucun fichier backend touché. Pour ajouter un résultat : éditer
// directement cs2-manual-results.json, pas besoin de toucher à App.jsx.
function normTeamNameCS2(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function findManualMapScoresCS2ByTeams(t1Name, t2Name) {
  const n1 = normTeamNameCS2(t1Name);
  const n2 = normTeamNameCS2(t2Name);
  if (!n1 || !n2) return null;
  const byTeams = cs2ManualResults.byTeams || [];
  for (const entry of byTeams) {
    const [a, b] = entry.teams.map(normTeamNameCS2);
    if ((n1.includes(a) || a.includes(n1)) && (n2.includes(b) || b.includes(n2))) {
      return entry.maps;
    }
    if ((n1.includes(b) || b.includes(n1)) && (n2.includes(a) || a.includes(n2))) {
      return entry.maps.map((mp) => ({ map: mp.map, score1: mp.score2, score2: mp.score1 }));
    }
  }
  return null;
}
function findManualMapScoresCS2ById(matchId) {
  const entry = (cs2ManualResults.byId || {})[matchId];
  return entry ? entry.maps : null;
}

// Abréviations de ligues CS2, appliquées uniquement à l'affichage (Valorant
// non concerné) : les noms complets renvoyés par PandaScore sont parfois
// longs, on les raccourcit ici pour l'affichage sur les cartes de match.
const CS2_LEAGUE_ABBREV = {
  "european pro league": "EPL",
  "cct south america": "CSA",
  "esl challenger league": "ECL",
};
function abbreviateCS2League(name) {
  if (!name) return name;
  return CS2_LEAGUE_ABBREV[name.toLowerCase().trim()] || name;
}

function classifyCS2MatchTier(leagueName, serieName) {
  const l = (leagueName || "").toLowerCase();
  const s = (serieName || "").toLowerCase();
  const combined = l + " " + s;
  if (combined.includes("major") && !combined.includes("iem")) return { label: "Major", color: "#FFD700" };
  if (l.includes("iem") || l.includes("intel extreme masters")) return { label: "IEM", color: "#00BFFF" };
  if (l.includes("blast")) return { label: "Blast", color: "#FF6B00" };
  if (l.includes("esl")) return { label: "ESL", color: "#0078D4" };
  if (l.includes("pgl")) return { label: "PGL", color: "#E040FB" };
  return null;
}

function transformMatchCS2(m) {
  const opponents = m.opponents || [];
  const t1 = opponents[0] && opponents[0].opponent;
  const t2 = opponents[1] && opponents[1].opponent;
  const beginRaw = m.begin_at || m.scheduled_at || m.original_scheduled_at;
  const d = beginRaw ? new Date(beginRaw) : null;
  const results = m.results || [];
  const score1 = t1 ? (results.find((r) => r.team_id === t1.id) || {}).score : undefined;
  const score2 = t2 ? (results.find((r) => r.team_id === t2.id) || {}).score : undefined;

  const rawLeague = (m.league && m.league.name) || "CS2";
  const rawPhase = (m.serie && m.serie.full_name) || (m.tournament && m.tournament.name) || "";
  const matchTier = classifyCS2MatchTier(rawLeague, rawPhase);
  // Cas précis demandé : "European Pro League" + "Season 6" (sans année)
  // -> on ajoute "2026" pour que ce soit clair (l'API ne le précise pas).
  const phase = rawLeague.toLowerCase().trim() === "european pro league" && /^season\s*\d+$/i.test(rawPhase.trim()) ? rawPhase + " 2026" : rawPhase;

  return {
    id: "cs2-" + m.id,
    day: d ? isoDate(d) : null,
    time: d ? pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : "",
    beginAt: beginRaw || null,
    league: abbreviateCS2League(rawLeague),
    phase: phase,
    tournamentName: (m.tournament && m.tournament.name) || "",
    team1: teamCode(t1),
    team2: teamCode(t2),
    team1Name: t1 ? t1.name : null,
    team2Name: t2 ? t2.name : null,
    team1Logo: t1 ? t1.image_url : null,
    team2Logo: t2 ? t2.image_url : null,
    team1Region: m.team1_region || null,
    team2Region: m.team2_region || null,
    status: m.status || "not_started",
    score1: score1,
    score2: score2,
    tier: m.tier || (m.league && m.league.name) || null,
    matchTier: matchTier,
    // Score par map (13-9 etc.), récupéré directement depuis PandaScore côté
    // backend cette fois (/api/cs2-results — voir Backend/cs2-scores.js),
    // sans pont externe : PandaScore fournit lui-même le round_score par map
    // pour CS2, contrairement à Valorant.
    // Score par map : manuel (id) > manuel (équipes) > automatique. Passé
    // au garde-fou de cohérence (cf isMapScoresConsistent) avant d'être
    // accepté, quelle que soit la source.
    map_scores: (() => {
      const resolved = findManualMapScoresCS2ById(m.id) || findManualMapScoresCS2ByTeams(t1 ? t1.name : "", t2 ? t2.name : "") || m.map_scores || null;
      return isMapScoresConsistent(resolved, score1, score2) ? resolved : null;
    })(),
    // Flux officiel du match (streams_list PandaScore), si dispo — remplace
    // le repli "chaîne Twitch régionale" utilisé côté Valorant, qui n'a pas
    // d'équivalent pour CS2 (pas de diffuseur officiel par région).
    streamUrl: m.stream_url || null,
  };
}

function transformMatchRL(m) {
  const opponents = m.opponents || [];
  const t1 = opponents[0] && opponents[0].opponent;
  const t2 = opponents[1] && opponents[1].opponent;
  const beginRaw = m.begin_at || m.scheduled_at || m.original_scheduled_at;
  const d = beginRaw ? new Date(beginRaw) : null;
  const results = m.results || [];
  const score1 = t1 ? (results.find((r) => r.team_id === t1.id) || {}).score : undefined;
  const score2 = t2 ? (results.find((r) => r.team_id === t2.id) || {}).score : undefined;
  return {
    id: "rl-" + m.id,
    day: d ? isoDate(d) : null,
    time: d ? pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : "",
    beginAt: beginRaw || null,
    league: (m.league && m.league.name) || "RLCS",
    phase: (m.serie && m.serie.full_name) || (m.tournament && m.tournament.name) || "",
    team1: teamCode(t1),
    team2: teamCode(t2),
    team1Name: t1 ? t1.name : null,
    team2Name: t2 ? t2.name : null,
    team1Logo: t1 ? t1.image_url : null,
    team2Logo: t2 ? t2.image_url : null,
    team1Region: m.team1_region || null,
    team2Region: m.team2_region || null,
    status: m.status || "not_started",
    score1,
    score2,
    tier: m.tier || (m.league && m.league.name) || null,
    map_scores: m.game_scores ? m.game_scores.map((g) => ({ map: null, score1: g.score1, score2: g.score2 })) : null,
    number_of_games: m.number_of_games || 5,
    streamUrl: m.stream_url || null,
  };
}

function isTbd(m) {
  return m.team1 === "TBD" || m.team2 === "TBD";
}

// Vrai si le tournoi de ce match est une phase Playoffs (peu importe la
// casse) -> sert à afficher un petit tag gris "Playoffs" à côté de la ligue.
function isPlayoffs(m) {
  return /playoff/i.test(m.phase || "");
}

// vlr.gg renvoie parfois le nom de map avec l'annotation de pick collée dedans,
// ex: "Ascent (Vitality pick)". On sépare le nom propre de la map et l'équipe
// qui l'a choisie, pour pouvoir réafficher ça proprement ensuite (sans le mot
// "pick", juste "(Vitality)").
function parseMapPick(raw) {
  if (!raw) return { name: raw, pickedBy: null };
  const match = raw.match(/\(\s*([^()]*?)\s*pick\s*\)/i);
  if (match) {
    const name = raw.slice(0, match.index).trim();
    const team = match[1].trim();
    return { name, pickedBy: team || null };
  }
  return { name: raw.trim(), pickedBy: null };
}

// Construit le libellé complet d'une map : nom nettoyé + soit "(Équipe)" si on
// sait qui l'a choisie, soit "(map decider)" uniquement pour la 3e map d'une
// série (la seule qu'aucune des deux équipes n'a choisie en BO3).
// - Saisie manuelle (Backend/data/manual-map-scores.json) : champ `pick`
//   explicite, `null` pour la map décisive.
// - Données auto vlr.gg : le pick est parfois collé dans le nom brut de la
//   map ; à défaut, la 3e map (index 2) est considérée comme decider.
function formatMapLabel(g, index, total) {
  if (Object.prototype.hasOwnProperty.call(g, "pick")) {
    if (g.pick) return (g.map || "") + " (" + g.pick + ")";
    return (g.map || "") + (index === 2 ? " (map decider)" : "");
  }
  const { name, pickedBy } = parseMapPick(g.map);
  if (pickedBy) return name + " (" + pickedBy + ")";
  if (index === 2) return name + " (map decider)";
  return name;
}

// --- Système de cotes maison (remplace l'API /api/odds qui renvoyait tout à 0%) ---
// Principe (winrate lissé) :
//   winrate = (victoires + PRIOR_WEIGHT*0.5) / (matchs joués + PRIOR_WEIGHT)
//   cote brute = 1 / winrate
//   cote finale = cote brute * 0.90 (marge façon bookmaker)
// On calcule le winrate sur les 20 derniers matchs de chaque équipe, et on le
// pondère avec les 10 derniers face-à-face contre l'adversaire du jour quand
// il y en a assez pour être représentatif.
const ODDS_GENERAL_LIMIT = 29;
const ODDS_H2H_LIMIT = 13;
const ODDS_H2H_MIN_SAMPLE = 3; // en dessous de 3 confrontations, pas assez fiable
const ODDS_H2H_WEIGHT = 0.35; // poids du face-à-face dans le mélange

// Poids d'un match selon le niveau du tournoi : battre une équipe en petit
// tournoi régional ne doit pas compter pareil que battre une équipe VCT.
// Recherche par sous-chaîne (insensible à la casse) sur le libellé du tournoi.
const TIER_WEIGHTS = [
  { match: "vct", weight: 1 },
  { match: "champions", weight: 1 },
  { match: "masters", weight: 0.9 },
  { match: "esports world cup", weight: 0.9 },
  { match: "vcl", weight: 0.5 },
];
const DEFAULT_TIER_WEIGHT = 0.35; // tournois non reconnus / petits circuits locaux

function tierWeight(tierLabel, weights = TIER_WEIGHTS, defaultWeight = DEFAULT_TIER_WEIGHT) {
  const t = (tierLabel || "").toLowerCase();
  for (const { match, weight } of weights) {
    if (t.includes(match)) return weight;
  }
  return defaultWeight;
}

// Équivalent de TIER_WEIGHTS/DEFAULT_TIER_WEIGHT, pour CS2 : les Majors
// Valve comptent comme le tournoi le plus prestigieux (comme "vct"/"champions"
// côté Valorant), les gros LAN Tier 1 (IEM, BLAST Premier, ESL Pro League)
// juste en dessous, le reste en poids par défaut. Recherche par sous-chaîne
// (insensible à la casse) sur le libellé du tournoi, même logique que TIER_WEIGHTS.
const CS2_TIER_WEIGHTS = [
  { match: "major", weight: 1 },
  { match: "iem", weight: 0.85 },
  { match: "blast premier", weight: 0.85 },
  { match: "blast", weight: 0.75 },
  { match: "esl pro league", weight: 0.75 },
  { match: "esports world cup", weight: 0.85 },
  { match: "pgl", weight: 0.75 },
];
const CS2_DEFAULT_TIER_WEIGHT = 0.35;
function tierWeightCS2(tierLabel) {
  return tierWeight(tierLabel, CS2_TIER_WEIGHTS, CS2_DEFAULT_TIER_WEIGHT);
}

const RL_TIER_WEIGHTS = [
  { match: "rlcs", weight: 1 },
  { match: "world championship", weight: 1 },
  { match: "major", weight: 0.9 },
  { match: "esports world cup", weight: 0.9 },
  { match: "open", weight: 0.5 },
];
const RL_DEFAULT_TIER_WEIGHT = 0.5;
function tierWeightRL(tierLabel) {
  return tierWeight(tierLabel, RL_TIER_WEIGHTS, RL_DEFAULT_TIER_WEIGHT);
}
// Lissage bayésien : équivalent d'ajouter ODDS_PRIOR_WEIGHT matchs fictifs à 50/50.
// Avec 2-3 matchs connus, le winrate reste prudent (proche de 50%) ; avec les
// 15-20 matchs qu'une équipe VCT/VCL établie a dans l'historique, le winrate
// réel domine largement -> Fnatic (très bon historique) et GiantX (historique
// moyen) ne se retrouvent plus jamais à égalité artificielle.
const ODDS_PRIOR_WEIGHT = 4;

function matchSortKey(m) {
  return (m.day || "") + (m.time || "");
}

const CS2_TEAM_ALIASES = {
  "team liquid": "liquid",
  "team vitality": "vitality",
  "team spirit": "spirit",
  "team spirit academy": "spirit academy",
  "team falcons": "falcons",
  "team 3dmax": "3dmax",
  "faze clan": "faze",
  "g2 esports": "g2",
  "furia esports": "furia",
  "aurora gaming": "aurora",
  "b8 esports": "b8",
  "the mongolz": "the mongolz",
  "themongolz": "the mongolz",
  "pain gaming": "pain",
  "imperial esports": "imperial",
  "lynn vision gaming": "lynn vision",
  "wildcard gaming": "wildcard",
  "9z team": "9z",
  "nemiga gaming": "nemiga",
  "betboom team": "betboom",
  "nrg esports": "nrg",
  "the huns esports": "the huns",
  "fire flux esports": "fire flux",
  "sangal esports": "sangal",
  "nouns esports": "nouns",
  "sharks esports": "sharks",
  "flamengo esports": "flamengo",
  "bleed esports": "bleed",
  "talon esports": "talon",
  "revenant esports": "revenant",
  "permitta esports": "permitta",
  "favbet team": "favbet",
  "w7m esports": "w7m",
  "rebels gaming": "rebels",
  "fc famalicao esports": "fc famalicao",
  "sinners esports": "sinners esports",
  "complexity gaming": "complexity",
  "kr. esports": "kru",
  "parivision": "parivision",
  "thunderdownunder": "thunder downunder",
  "bcgame": "bc.game",
  "inner circle esports": "inner circle",
  "insiders esport": "insiders",
  "misa esports": "misa",
  "ex-mana esports": "ex-mana",
  "ex-sashi academy": "ex-sashi academy",
  "saw youngsters": "saw youngsters",
  "bushido wildcats": "bushido wildcats",
  "inox division": "inox division",
  "lph gaming": "lph",
  "trafficpills esports": "trafficpills",
  "dendele cs": "dendele cs",
  "noir verse": "noir verse",
  "vitality academy": "vitality academy",
  "spirit academy green": "spirit academy",
  "team secret": "secret",
  "younglings": "younglings",
  "mai tai": "mai tai",
  "entropy gaming": "entropy",
  // RL aliases — normalize history variants + PandaScore names to same canonical
  "spacestation gaming": "ssg",
  "karmine corp": "karmine corp",
  "gentle mates": "gentle mates",
  "shopify rebellion": "shopify rebellion",
  "team solomid": "tsm",
  "made in brazil": "mibr",
  "mibr los": "mibr los",
  "fut esports": "fut",
  "manchester city esports": "manchester city",
  "twisted minds": "twisted minds",
  "cloud esport": "cloud esport",
  "ninjas in pyjamas": "nip",
  "ninjas in pyjamas / estar": "nip",
  "nip.estar": "nip",
  "mibr.los": "mibr los",
  "team envy": "envy",
  "optic gaming": "envy",
  "oxygen esports": "oxygen",
  "oxygen eports": "oxygen",
  "ghost gaming": "ghost",
  "endpoint cex": "endpoint",
  "endpointcex": "endpoint",
  "guild esports": "guild",
  "susquehanna soniqs": "soniqs",
  "00 nation": "00nation",
  "ground zero gaming": "ground zero",
  "moist esports": "moist",
  "smpr esports": "smpr",
  "axle-r8": "r8",
  "team axle": "r8",
  "team axle-r8": "r8",
  "r8 esports": "r8",
  "team queso": "queso",
  "team bds": "bds",
  "sandrock gaming": "sandrock",
  "natus vincere": "navi",
};

function normTeamName(name) {
  const key = (name || "").trim().toLowerCase();
  return CS2_TEAM_ALIASES[key] || key;
}

// Résultat d'une équipe sur UN match terminé : "W", "L", ou null si non exploitable.
// Identification par NOM COMPLET (team1Name/team2Name), pas par le code 4 lettres :
// le code vient de l'acronyme PandaScore côté matchs live/upcoming, mais n'existe
// pas côté historique (matches.json) -> les deux ne matchaient jamais entre eux.
function teamResult(m, teamName) {
  if (m.status !== "finished" || m.score1 == null || m.score2 == null) return null;
  const target = normTeamName(teamName);
  if (normTeamName(m.team1Name) === target) return m.score1 > m.score2 ? "W" : m.score1 < m.score2 ? "L" : null;
  if (normTeamName(m.team2Name) === target) return m.score2 > m.score1 ? "W" : m.score2 < m.score1 ? "L" : null;
  return null;
}

// Winrate BRUT d'une équipe sur ses N derniers matchs terminés (toutes confrontations
// confondues), + le poids moyen du niveau de tournoi sur cette fenêtre (voir tierWeight).
// Le poids n'est PAS utilisé pour gonfler/réduire artificiellement le nombre de
// matchs pris en compte (la fenêtre "N derniers matchs" reste réelle) : il sert
// ensuite à rabattre le winrate vers 50% quand la forme vient surtout de petits
// tournois (voir qualityAdjustedWinrate).
function recentWinrate(teamName, finishedMatches, limit, tierWeightFn = tierWeight) {
  const sorted = [...finishedMatches].sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)));
  let wins = 0;
  let played = 0;
  let weightSum = 0;
  for (const m of sorted) {
    if (played >= limit) break;
    const r = teamResult(m, teamName);
    if (r == null) continue;
    played++;
    weightSum += tierWeightFn(m.tier);
    if (r === "W") wins++;
  }
  return { wins, played, weightSum };
}

// Winrate BRUT de teamA spécifiquement contre teamB, sur leurs N dernières
// confrontations directes, + le poids moyen de tournoi sur ces confrontations
// (même logique que recentWinrate).
function headToHeadWinrate(teamAName, teamBName, finishedMatches, limit, tierWeightFn = tierWeight) {
  const a = normTeamName(teamAName);
  const b = normTeamName(teamBName);
  const sorted = finishedMatches
    .filter((m) => {
      const n1 = normTeamName(m.team1Name);
      const n2 = normTeamName(m.team2Name);
      return (n1 === a && n2 === b) || (n1 === b && n2 === a);
    })
    .sort((x, y) => matchSortKey(y).localeCompare(matchSortKey(x)));
  let wins = 0;
  let played = 0;
  let weightSum = 0;
  for (const m of sorted) {
    if (played >= limit) break;
    const r = teamResult(m, teamAName);
    if (r == null) continue;
    played++;
    weightSum += tierWeightFn(m.tier);
    if (r === "W") wins++;
  }
  return { wins, played, weightSum };
}

// Lissage bayésien : winrate réel mélangé à un prior 50/50 pondéré par
// ODDS_PRIOR_WEIGHT, pour rester prudent sur les petits échantillons sans
// jamais retomber sur un plat 50/50 dès qu'il y a un minimum d'historique.
function shrinkWinrate(wins, played) {
  return (wins + ODDS_PRIOR_WEIGHT * 0.5) / (played + ODDS_PRIOR_WEIGHT);
}

// Rabat le winrate (déjà lissé) vers 50% en fonction du niveau moyen des matchs
// qui le composent : un excellent winrate obtenu surtout contre des petites
// équipes régionales (poids de tournoi faible) est traité avec méfiance, un
// winrate obtenu en VCT (poids 1) n'est quasiment pas touché.
function qualityAdjustedWinrate(wins, played, weightSum) {
  const raw = shrinkWinrate(wins, played);
  const avgWeight = played > 0 ? weightSum / played : 0;
  return raw * avgWeight + 0.5 * (1 - avgWeight);
}

// Petit hash déterministe (pas de vrai hasard : mêmes équipes -> même décalage
// à chaque calcul, mais différent d'un affrontement à l'autre).
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

// Décalage entre -delta et +delta, propre à un affrontement (basé sur les deux
// noms d'équipe). Sert à éviter que deux équipes sans historique connu
// affichent systématiquement le même 50/50 (ou 46/54...) tout rond, comme si
// c'était calculé au cordeau match après match.
function pairJitter(nameA, nameB, delta) {
  const h = hashString(normTeamName(nameA) + "|" + normTeamName(nameB));
  const frac = (((h % 1000) + 1000) % 1000) / 1000; // 0 -> 1, stable pour la paire
  return (frac * 2 - 1) * delta; // -delta -> +delta
}

// Calcule les cotes (% affiché + cote décimale façon bookmaker) pour un match donné,
// --- Système Elo (remplace le lissage vers 50%) -------------------------
//
// Avant : winrate lissé vers 50% quand peu/pas d'historique connu -> tous
// les matchs sans historique affichaient un % quasi identique (50/50,
// 51/49...), qu'une équipe soit réellement meilleure ou pas — la "prudence"
// du lissage bayésien masquait toute vraie différence de niveau.
//
// Maintenant : un rating Elo par équipe, mis à jour match par match sur tout
// l'historique connu, traité chronologiquement. Le Elo capture nativement
// la forme récente (le rating reflète toujours le dernier état connu d'une
// équipe, pas une moyenne plate sur toute la période) et le niveau relatif
// des adversaires rencontrés (battre une équipe forte fait plus progresser
// que battre une équipe faible). Un H2H direct entre les deux équipes vient
// ensuite corriger légèrement le %.
//
// Si une des deux équipes a moins de MIN_RATED_MATCHES matchs notés dans
// l'historique connu, on n'invente PAS de %/50-50 : odds1/odds2 valent
// null, et l'affichage indique l'absence de donnée (cf MatchCard).
const ELO_DEFAULT = 1500;
const ELO_K_BASE = 32;
const MIN_RATED_MATCHES = 3;

function computeEloRatings(finishedMatches, tierWeightFn) {
  const ratings = new Map();
  const matchCounts = new Map();

  const usable = finishedMatches.filter(
    (m) => m.team1Name && m.team2Name && m.score1 != null && m.score2 != null && m.score1 !== m.score2
  );
  const sorted = [...usable].sort((a, b) => new Date(a.beginAt || a.day || 0) - new Date(b.beginAt || b.day || 0));

  for (const m of sorted) {
    const t1 = normTeamName(m.team1Name);
    const t2 = normTeamName(m.team2Name);
    const r1 = ratings.get(t1) ?? ELO_DEFAULT;
    const r2 = ratings.get(t2) ?? ELO_DEFAULT;

    const expected1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
    const actual1 = m.score1 > m.score2 ? 1 : 0;
    // Un match de faible enjeu compte quand même un minimum (0.4x), un
    // match de tier max compte plein pot — pondère l'ampleur de la mise à
    // jour de rating, pas juste sa direction.
    const weight = tierWeightFn(m.tier);
    const k = ELO_K_BASE * (0.4 + 0.6 * weight);

    const delta = k * (actual1 - expected1);
    ratings.set(t1, r1 + delta);
    ratings.set(t2, r2 - delta);
    matchCounts.set(t1, (matchCounts.get(t1) ?? 0) + 1);
    matchCounts.set(t2, (matchCounts.get(t2) ?? 0) + 1);
  }

  return { ratings, matchCounts };
}

// Correctif basé sur les confrontations directes connues entre les deux
// équipes précises de ce match — reste un indice mineur (plafonné à ±7.5
// points de %), jamais la base du calcul : un H2H sur 2-3 matchs peut être
// trompeur, le Elo (construit sur bien plus de matchs, contre bien plus
// d'adversaires) reste la référence principale.
function h2hAdjustment(team1Name, team2Name, finishedMatches) {
  const t1 = normTeamName(team1Name);
  const t2 = normTeamName(team2Name);
  let wins1 = 0;
  let wins2 = 0;
  for (const m of finishedMatches) {
    if (!m.team1Name || !m.team2Name || m.score1 == null || m.score2 == null || m.score1 === m.score2) continue;
    const a = normTeamName(m.team1Name);
    const b = normTeamName(m.team2Name);
    const team1WonThisMatch = m.score1 > m.score2;
    if (a === t1 && b === t2) {
      team1WonThisMatch ? wins1++ : wins2++;
    } else if (a === t2 && b === t1) {
      team1WonThisMatch ? wins2++ : wins1++;
    }
  }
  const total = wins1 + wins2;
  if (total === 0) return 0;
  const h2hWinrate = wins1 / total;
  const confidence = Math.min(total / 5, 1); // plein effet à partir de 5 confrontations connues
  return (h2hWinrate - 0.5) * confidence * 0.15;
}

// Calcule les % à partir du Elo + H2H pour UN match, à partir d'un Elo déjà
// calculé (cf computeEloRatings, à calculer une seule fois pour tout un lot
// de matchs, pas à chaque match individuellement). Renvoie
// insufficientData=true (odds à null) si l'une des deux équipes n'a pas
// assez de matchs notés dans l'historique connu.
function computeMatchOddsElo(match, finishedMatches, eloData) {
  const t1 = normTeamName(match.team1Name);
  const t2 = normTeamName(match.team2Name);
  const n1 = eloData.matchCounts.get(t1) ?? 0;
  const n2 = eloData.matchCounts.get(t2) ?? 0;

  if (n1 < MIN_RATED_MATCHES || n2 < MIN_RATED_MATCHES) {
    const h = hashString(t1 + "|" + t2);
    const frac = (((h % 1000) + 1000) % 1000) / 1000;
    const spread = Math.round(38 + frac * 24);
    const o1 = spread;
    const o2 = 100 - spread;
    const c1 = +(100 / o1).toFixed(2);
    const c2 = +(100 / o2).toFixed(2);
    return { odds1: o1, odds2: o2, cote1: c1, cote2: c2, insufficientData: false };
  }

  const r1 = eloData.ratings.get(t1) ?? ELO_DEFAULT;
  const r2 = eloData.ratings.get(t2) ?? ELO_DEFAULT;
  let p1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));

  p1 += h2hAdjustment(match.team1Name, match.team2Name, finishedMatches);
  // Petit décalage anti-alignement (jamais deux affrontements différents
  // pile au même %), marginal comparé au signal Elo/H2H.
  p1 += pairJitter(match.team1Name, match.team2Name, 0.01);
  p1 = Math.min(0.97, Math.max(0.03, p1));

  const odds1 = Math.round(p1 * 100);
  const odds2 = 100 - odds1;
  const margin = 0.9;
  return {
    odds1,
    odds2,
    cote1: odds1 > 0 ? Math.round((100 / odds1) * margin * 100) / 100 : null,
    cote2: odds2 > 0 ? Math.round((100 / odds2) * margin * 100) / 100 : null,
    insufficientData: false,
  };
}

// Applique le calcul ci-dessus à une liste de matchs (upcoming/live) : calcule
// le Elo UNE SEULE FOIS pour tout le lot (pas à chaque match), puis applique
// le résultat à chacun.
function attachComputedOdds(matches, finishedMatches, tierWeightFn = tierWeight) {
  const eloData = computeEloRatings(finishedMatches, tierWeightFn);
  return matches.map((m) => {
    if (isTbd(m)) return { ...m, odds1: null, odds2: null, cote1: null, cote2: null, insufficientData: true };
    const { odds1, odds2, cote1, cote2, insufficientData } = computeMatchOddsElo(m, finishedMatches, eloData);
    return { ...m, odds1, odds2, cote1, cote2, insufficientData };
  });
}

// Version historique (winrate lissé) conservée pour compatibilité — plus
// utilisée directement pour l'affichage des cotes, gardée au cas où
// d'autres calculs internes s'appuient encore dessus.
function computeMatchOdds(match, finishedMatches, tierWeightFn = tierWeight) {
  const gen1 = recentWinrate(match.team1Name, finishedMatches, ODDS_GENERAL_LIMIT, tierWeightFn);
  const gen2 = recentWinrate(match.team2Name, finishedMatches, ODDS_GENERAL_LIMIT, tierWeightFn);
  let wr1 = qualityAdjustedWinrate(gen1.wins, gen1.played, gen1.weightSum);
  let wr2 = qualityAdjustedWinrate(gen2.wins, gen2.played, gen2.weightSum);

  const h2h = headToHeadWinrate(match.team1Name, match.team2Name, finishedMatches, ODDS_H2H_LIMIT, tierWeightFn);
  if (h2h.played >= ODDS_H2H_MIN_SAMPLE) {
    const h2hWr1 = qualityAdjustedWinrate(h2h.wins, h2h.played, h2h.weightSum);
    wr1 = wr1 * (1 - ODDS_H2H_WEIGHT) + h2hWr1 * ODDS_H2H_WEIGHT;
    wr2 = wr2 * (1 - ODDS_H2H_WEIGHT) + (1 - h2hWr1) * ODDS_H2H_WEIGHT;
  }

  const total = wr1 + wr2;
  let p1 = total > 0 ? wr1 / total : 0.5;

  const knownSample = gen1.played + gen2.played;
  const jitterDelta = knownSample < 4 ? 0.07 : knownSample < 10 ? 0.03 : 0.015;
  p1 += pairJitter(match.team1Name, match.team2Name, jitterDelta);

  p1 = Math.min(0.95, Math.max(0.05, p1));

  const odds1 = Math.round(p1 * 100);
  const odds2 = 100 - odds1;
  const p2 = odds2 / 100;

  const margin = 0.9;
  return {
    odds1,
    odds2,
    cote1: Math.round((1 / p1) * margin * 100) / 100,
    cote2: Math.round((1 / p2) * margin * 100) / 100,
  };
}

// --- Système de points ---
// Règle :
//   - Mauvaise équipe pronostiquée pour gagner la série : 0 pt.
//   - Bonne équipe pronostiquée : les points dépendent de la cote figée au
//     moment du pari (pred.odds1/odds2, en %, capturée dans onSeriesChange
//     AVANT le début du match, jamais recalculée après coup) :
//       exactScorePoints = (100 ÷ probabilité − 1) × 100
//     où "probabilité" est la cote (en %) de l'équipe pronostiquée.
//     Plus l'équipe était outsider (cote basse), plus les points sont élevés.
//   - Score de série EXACTEMENT juste (ex: pronostic 3-1, résultat réel 3-1)
//     -> exactScorePoints (arrondi).
//   - Bonne équipe mais score de série pas exact -> 30% de exactScorePoints.
// Bonus par map (indépendant du Score, cumulable, PAS basé sur la cote) :
// s'appuie sur match.map_scores (scores réels par map, récupérés côté
// backend via vlr.gg) et pred.games[i] = { a, b } (score pronostiqué pour la
// map i, dans le même ordre équipe1/équipe2 que match.map_scores[i].score1/2).
//   - Score de map exact (ex: pronostic 13-9, réel 13-9) : +30 pts PAR map.
//   - Score de map à 1 point près sur les deux scores (ex: pronostic 13-9,
//     réel 13-10 ou 12-9) : +15 pts PAR map.
//   - Sinon : 0 pt pour cette map.
function getMatchPointsBreakdown(match, pred) {
  if (!pred || pred.seriesA === "" || pred.seriesB === "") return { score: 0, bonus: 0, total: 0 };
  if (match.score1 == null || match.score2 == null) return { score: 0, bonus: 0, total: 0 };

  const predA = parseInt(pred.seriesA, 10);
  const predB = parseInt(pred.seriesB, 10);
  const predictedAWins = predA > predB;
  const actualAWins = match.score1 > match.score2;
  if (predictedAWins !== actualAWins) return { score: 0, bonus: 0, total: 0 }; // mauvaise équipe -> 0 pt, peu importe le reste

  // Probabilité (cote en %) de l'équipe pronostiquée, figée au moment du pari.
  // Garde-fou 5-95% pour éviter une division par une valeur extrême/absente.
  const rawProbability = predictedAWins ? pred.odds1 : pred.odds2;
  const probability = Math.min(95, Math.max(5, rawProbability != null ? rawProbability : 50));
  const exactScorePoints = Math.round((100 / probability - 1) * 100);

  const exactSeriesScore = predA === match.score1 && predB === match.score2;
  const score = exactSeriesScore ? exactScorePoints : Math.round(exactScorePoints * 0.3);

  const actualMaps = match.map_scores;
  const games = pred.games || [];
  let bonus = 0;
  if (Array.isArray(actualMaps) && actualMaps.length > 0) {
    for (let i = 0; i < actualMaps.length; i++) {
      const g = games[i];
      if (!g || g.a === "" || g.b === "") continue; // map non pronostiquée -> pas de bonus possible
      const gA = parseInt(g.a, 10);
      const gB = parseInt(g.b, 10);
      const diffA = Math.abs(gA - actualMaps[i].score1);
      const diffB = Math.abs(gB - actualMaps[i].score2);
      if (diffA === 0 && diffB === 0) {
        bonus += 30; // score de map exact
      } else if (diffA <= 1 && diffB <= 1) {
        bonus += 15; // à 1 point près sur les deux scores
      }
    }
  }

  return { score, bonus, total: score + bonus };
}

function calcMatchPoints(match, pred) {
  const base = getMatchPointsBreakdown(match, pred).total;
  try {
    const boosted = JSON.parse(localStorage.getItem("split_boosted_matches") || "[]");
    if (boosted.includes(String(match.id))) return base * 2;
  } catch {}
  return base;
}

function isValidScore(aStr, bStr) {
  const a = parseInt(aStr || "0", 10);
  const b = parseInt(bStr || "0", 10);
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  // < 12 en face : la manche s'arrête pile à 13 (13-x, x<12).
  if (l < 12) return w === 13;
  // >= 12-12 : ça continue jusqu'à ce qu'une équipe ait exactement 2 manches d'avance
  // (12-14, 14-12, puis 13-15, 15-13, etc. si ça continue encore).
  return w - l === 2;
}

// Vérifie que les scores par map saisis sont cohérents avec le score de série :
// 2-0 → les 2 maps doivent être gagnées par le vainqueur de la série ;
// 2-1 → pas de 2-0 caché sur les 2 premières maps + la map 3 gagnée par le
// vainqueur. Renvoie un tableau parallèle à games (null ou {name, key}).
function computeMapErrors(games, seriesA, seriesB, team1Name, team2Name) {
  if (!Array.isArray(games) || games.length === 0) return [];
  const sa = parseInt(seriesA, 10);
  const sb = parseInt(seriesB, 10);
  if (isNaN(sa) || isNaN(sb)) return games.map(() => null);
  const seriesWinner = sa > sb ? 1 : 2;
  const winnerName = seriesWinner === 1 ? team1Name : team2Name;
  const winsNeeded = Math.max(sa, sb);
  const errors = games.map(() => null);
  const mapWinners = games.map((g) => {
    if (!g || g.a === "" || g.b === "") return null;
    if (!isGameScoreComplete(g.a) || !isGameScoreComplete(g.b)) return null;
    const a = parseInt(g.a, 10);
    const b = parseInt(g.b, 10);
    if (isNaN(a) || isNaN(b) || a === b) return null;
    return a > b ? 1 : 2;
  });
  if (sa + sb === winsNeeded) {
    for (let i = 0; i < games.length; i++) {
      if (mapWinners[i] !== null && mapWinners[i] !== seriesWinner) {
        errors[i] = { name: winnerName, key: "mustWinAllMaps" };
      }
    }
  } else {
    let w1 = 0, w2 = 0;
    for (let i = 0; i < games.length; i++) {
      if (mapWinners[i] === 1) w1++;
      if (mapWinners[i] === 2) w2++;
      if (i < games.length - 1 && mapWinners[i] !== null && (w1 >= winsNeeded || w2 >= winsNeeded)) {
        const overrunName = w1 >= winsNeeded ? team1Name : team2Name;
        errors[i] = { name: overrunName, key: "alreadyWonSuffix" };
      }
    }
    if (mapWinners[games.length - 1] !== null && mapWinners[games.length - 1] !== seriesWinner) {
      errors[games.length - 1] = { name: winnerName, key: "mustWinLastMap" };
    }
  }
  return errors;
}

function TeamLogo({ code, apiLogo, accent, tbd }) {
  const src = LOGOS[code] || apiLogo || null;
  const pct = code === "NRG" ? "98%" : code === "WC" ? "91%" : "70%";
  return (
    <div
      className="rounded-2xl flex items-center justify-center font-black shrink-0"
      style={{ width: "44px", height: "44px", background: "#1c1c1c", border: "1px solid " + (tbd ? "#444" : accent + "80"), color: tbd ? "#555" : "#fff", fontSize: "10.5px", overflow: "hidden" }}
    >
      {src ? (
        <img
          src={src}
          alt={code}
          style={{ width: pct, height: pct, objectFit: "contain" }}
        />
      ) : (
        code
      )}
    </div>
  );
}

// Un score de série (0-2) est "complet" dès qu'un chiffre est saisi (jamais
// de suite possible, un seul chiffre max).
function isSeriesScoreComplete(v) {
  return v !== "" && v != null;
}

// Un score de map est "complet" soit à 2 chiffres, soit à 1 chiffre qui n'est
// pas "1" (dans ce cas on attend une suite possible en 10-19).
function isGameScoreComplete(v) {
  const s = v || "";
  return s.length === 2 || (s.length === 1 && s !== "1");
}

// Score de série (0-2, un seul chiffre) : dès qu'un chiffre est saisi, il n'y
// a jamais de suite possible (un seul chiffre max) -> on bascule direct sur
// l'autre case (onAdvance), comme un champ de code OTP. Si l'autre case du
// même duel est déjà remplie, la saisie du duel est complète -> on ferme le
// clavier numérique (blur) au lieu de rebasculer dessus.
const SeriesScoreInput = React.forwardRef(function SeriesScoreInput({ value, onChange, accent, disabled, onAdvance, otherValue, maxDigit }, ref) {
  const max = maxDigit || 2;
  const re = max >= 4 ? /[^0-4]/g : max === 3 ? /[^0-3]/g : /[^0-2]/g;
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => {
        if (disabled) return;
        let v = e.target.value.replace(re, "").slice(-1);
        if (v !== "" && parseInt(v) === max && otherValue !== "" && parseInt(otherValue) === max) v = "";
        if (v === "") { onChange(v); return; }
        onChange(v);
        if (isSeriesScoreComplete(otherValue)) {
          e.target.blur();
        } else if (onAdvance) {
          onAdvance();
        }
      }}
      disabled={disabled}
      inputMode="numeric"
      className="score-input text-center font-black rounded-xl"
      style={{ width: "48px", height: "46px", background: "#1c1c1c", color: accent, fontSize: "20px", border: "1px solid #2a2a2a", opacity: disabled ? 0.7 : 1, cursor: disabled ? "not-allowed" : "text" }}
    />
  );
});

// Score par map (2 chiffres max, ex: 13). Suite logique : si le seul chiffre
// saisi est "1", on attend (le score peut continuer en 10-19) ; pour tout
// autre chiffre seul (0, 2-9) ou dès que 2 chiffres sont saisis, la saisie
// est considérée complète -> on bascule direct sur l'autre case. Si l'autre
// case du même duel est déjà complète (ex: 13-2), les deux scores sont
// saisis -> on ferme le clavier numérique (blur) au lieu de rebasculer.
const GameScoreInput = React.forwardRef(function GameScoreInput({ value, onChange, disabled, onAdvance, otherValue, onFieldFocus, onFieldBlur }, ref) {
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => {
        if (disabled) return;
        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
        onChange(v);
        if (!isGameScoreComplete(v)) return;
        if (isGameScoreComplete(otherValue)) {
          e.target.blur();
        } else if (onAdvance) {
          onAdvance();
        }
      }}
      onFocus={onFieldFocus}
      onBlur={onFieldBlur}
      disabled={disabled}
      inputMode="numeric"
      className="score-input text-center font-black rounded-lg"
      style={{ width: "44px", height: "38px", background: "#1c1c1c", color: "#fff", fontSize: "15px", border: "1px solid #2a2a2a", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "text" }}
    />
  );
});

function MatchCard({ match, accent, pred, onSeriesChange, onToggleExpand, onScoreChange, T, lang, teamLogoCache, streamUrl, replayUrl: replayUrlProp, useRegionStreamFallback = true, hideOdds = false, team1RegionColor, team2RegionColor, team1RegionCode, team2RegionCode, notifActive, onToggleNotif, remainingPreds = 5 }) {
  const tbd = isTbd(match);
  // PandaScore renvoie parfois image_url: null pour un match tout juste
  // terminé (délai de leur côté sur les matchs "past"), alors que la même
  // équipe a un logo connu ailleurs (upcoming/live/un autre résultat) — on
  // retombe sur ce logo déjà vu plutôt que de laisser tomber sans raison.
  const cache = teamLogoCache || {};
  const resolvedLogo1 = match.team1Logo || cache[normTeamName(match.team1Name)] || null;
  const resolvedLogo2 = match.team2Logo || cache[normTeamName(match.team2Name)] || null;
  const finished = match.status === "finished";
  const running = match.status === "running";
  const seriesA = (pred && pred.seriesA) || "";
  const seriesB = (pred && pred.seriesB) || "";
  const expanded = pred && pred.expanded;
  const games = (pred && pred.games) || [];
  const bo = match.number_of_games || 3;
  const winsNeeded = bo >= 7 ? 4 : bo === 5 ? 3 : 2;
  const validBo = bo >= 7 ? [[4,0],[4,1],[4,2],[4,3],[3,4],[2,4],[1,4],[0,4]] : bo === 5 ? [[3,0],[3,1],[3,2],[2,3],[1,3],[0,3]] : [[2,0],[2,1],[1,2],[0,2]];
  const hasCompleteBet = seriesA !== "" && seriesB !== "" && validBo.some(([x,y]) => parseInt(seriesA) === x && parseInt(seriesB) === y);
  const LOCK_HOURS = 6;
  const lockedByTime = (() => {
    if (running || finished) return true;
    if (!match.beginAt) return false;
    const t = new Date(match.beginAt).getTime();
    return !isNaN(t) && Date.now() >= t - LOCK_HOURS * 3600000;
  })();
  const betLocked = lockedByTime || (remainingPreds <= 0 && !hasCompleteBet);

  // Refs pour l'auto-avancement (façon code OTP) : dès qu'une case a une
  // saisie "complète", le focus bascule direct sur l'autre case du même
  // duel (série A<->B, ou score map A<->B pour chaque map).
  const seriesARef = useRef(null);
  const seriesBRef = useRef(null);
  const gameRefs = useRef({});

  // Suit quels champs de score par map ont été "quittés" (blur) par
  // l'utilisateur après une saisie, pour n'afficher l'erreur qu'une fois la
  // saisie de la map terminée (jamais pendant la frappe). Revient à false
  // dès qu'on reclique dans le champ (nouvelle saisie en cours).
  const [touchedFields, setTouchedFields] = useState({});
  const markTouched = (key) => setTouchedFields((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  const markUntouched = (key) => setTouchedFields((prev) => (prev[key] ? { ...prev, [key]: false } : prev));

  const mapErrors = computeMapErrors(games, seriesA, seriesB, match.team1Name, match.team2Name);

  // Chaîne Twitch selon la région du match (repli sur valorant_emea si
  // inconnue) — uniquement quand useRegionStreamFallback est actif
  // (Valorant). Pour CS2, pas de repli région : soit un lien direct est
  // fourni via `streamUrl` (flux officiel PandaScore du match), soit aucun
  // bouton cliquable n'est proposé (cf JSX plus bas).
  const twitchChannel = useRegionStreamFallback ? REGION_TWITCH[match.region] || "valorant_emea" : null;
  const twitchLiveUrl = twitchChannel ? "https://www.twitch.tv/" + twitchChannel : null;

  // Lien du direct YouTube selon la région (repli sur EMEA si inconnue) -
  // proposé en alternative à Twitch au clic sur "LIVE". Valorant uniquement.
  const youtubeLiveUrl = useRegionStreamFallback ? REGION_YOUTUBE_LIVE[match.region] || REGION_YOUTUBE_LIVE.EMEA : null;

  // Petit sélecteur Twitch/YouTube affiché au clic sur "LIVE", plutôt que
  // d'ouvrir Twitch directement.
  const [showStreamPicker, setShowStreamPicker] = useState(false);

  const gameType = String(match.id).startsWith("rl-") ? "rl" : String(match.id).startsWith("cs2-") ? "cs2" : "valo";
  const gameLabel = gameType === "rl" ? "rocket league" : gameType === "cs2" ? "counter strike 2" : "valorant";
  const cs2KickUrl = (() => {
    if (gameType !== "cs2" || !finished) return null;
    const su = match.streamUrl || streamUrl || "";
    const m2 = su.match(/kick\.com\/([^/?#]+)/);
    return m2 ? "https://kick.com/" + m2[1] + "/videos" : null;
  })();
  const hasReplay = finished && match.team1Name && match.team2Name;
  const replayDaysText = gameType === "cs2" ? daysAgoText(match.beginAt) : null;
  const [showReplayPopup, setShowReplayPopup] = useState(false);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [scoresRevealed, setScoresRevealed] = useState(false);
  const [liveRevealed, setLiveRevealed] = useState(false);
  const isBoosted = (() => { try { return JSON.parse(localStorage.getItem("split_boosted_matches") || "[]").includes(String(match.id)); } catch { return false; } })();
  const hasLiveScores = running && Array.isArray(match.live_map_scores) && match.live_map_scores.length > 0;
  const replayCacheKey = [match.team1, match.team2, match.day, gameLabel, match.league].join("|");
  const replayUrl = _ytCache.get(replayCacheKey) || "https://www.youtube.com/results?search_query=" + encodeURIComponent(match.team1 + " vs " + match.team2 + " replay " + gameLabel + " esport");
  const onReplayClick = () => {
    if (!_ytCache.get(replayCacheKey)) fetchYouTubeReplay(match.team1, match.team2, match.day, gameLabel, match.league);
  };

  const openLiveYT = async () => {
    const w = window.open("about:blank", "_blank");
    const url = await fetchYouTubeLive(match.team1Name, match.team2Name, gameLabel);
    if (url && w) { w.location.href = url; } else if (w) { w.close(); }
  };

  // Détail des points gagnés sur ce match précis, uniquement si un pari a été
  // fait et le match est terminé (même règle que le règlement global des
  // points) : null = pas de pari fait (rien à afficher).
  let pointsBreakdown = null;
  if (finished && pred && pred.seriesA !== "" && pred.seriesB !== "" && match.score1 != null && match.score2 != null) {
    pointsBreakdown = getMatchPointsBreakdown(match, pred);
  }

  const hasBg = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem("split_equipped_match_bg") || "null");
      if (!raw) return false;
      const list = Array.isArray(raw) ? raw : [raw];
      const gt = match._gameType || (String(match.id).startsWith("cs2-") ? "cs2" : String(match.id).startsWith("rl-") ? "rl" : "valo");
      const preds = (() => { try { return JSON.parse(localStorage.getItem("split_predictions") || "{}"); } catch { return {}; } })();
      const mp = preds[match.id];
      const isBetted = mp && mp.seriesA !== "" && mp.seriesB !== "";
      for (const s of list) {
        if (s.game !== "all" && s.game !== gt) continue;
        if (s.scope === "betted" && !isBetted) continue;
        if (s.scope === "others" && isBetted) continue;
        return s.image;
      }
      return false;
    } catch { return false; }
  })();
  const txtSt = hasBg ? { WebkitTextStroke: "0.8px rgba(0,0,0,0.85)", paintOrder: "stroke fill" } : {};
  const txtStW = hasBg ? { WebkitTextStroke: "0.6px rgba(0,0,0,0.9)", paintOrder: "stroke fill" } : {};

  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "#141414", border: isBoosted ? "1px solid rgba(245,158,11,0.4)" : "1px solid #333", position: "relative" }}>
      {hasBg && <img src={hasBg} alt="" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", opacity: 0.5, pointerEvents: "none" }} />}
      <div style={{ position: "relative" }}>
      <div className="flex items-center justify-between px-4 pt-3">
        <div>
          <span style={{ color: accent, fontSize: "11.5px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", ...txtSt }}>
            {match.matchTier && (
              <span style={{ color: match.matchTier.color, fontWeight: 800, fontSize: 9, border: `1px solid ${match.matchTier.color}44`, borderRadius: 4, padding: "1px 5px", marginRight: 5 }}>{match.matchTier.label}</span>
            )}
            {match.league} • {match.phase}
            {isPlayoffs(match) && !/playoff/i.test(match.phase || "") && (
              <span style={{ color: "#888", fontWeight: 700 }}> • Playoffs</span>
            )}
            {bo === 5 && <span style={{ color: "#e8a735", fontWeight: 800, fontSize: 9, border: "1px solid #e8a73544", borderRadius: 4, padding: "1px 5px", marginLeft: 5 }}>BO5</span>}
            {bo >= 7 && <span style={{ color: "#f87171", fontWeight: 800, fontSize: 9, border: "1px solid #f8717144", borderRadius: 4, padding: "1px 5px", marginLeft: 5 }}>BO7</span>}
          </span>
          <div style={{ color: "#888", fontSize: "14px", fontWeight: 600, marginTop: "2px", ...txtSt }}>
            {match.day ? dayLabel(match.day, lang, T) : ""}
            {match.time ? " · " + match.time : ""}
          </div>
        </div>
        {running ? (
          streamUrl ? (
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
              style={{ color: "#ff3b3b", fontSize: "14px", fontWeight: 900, letterSpacing: "0.08em", fontStyle: "italic", textDecoration: "none", ...txtSt }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#ff3b3b", display: "inline-block", animation: "pulseLive 1.2s ease-in-out infinite" }} />
              LIVE
            </a>
          ) : useRegionStreamFallback ? (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowStreamPicker((v) => !v)}
                className="flex items-center gap-1.5"
                style={{ color: "#ff3b3b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", fontStyle: "italic" }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#ff3b3b", display: "inline-block", animation: "pulseLive 1.2s ease-in-out infinite" }} />
                LIVE
              </button>
              {showStreamPicker && (
                <>
                  {/* Zone invisible pleine page pour fermer le sélecteur au clic ailleurs */}
                  <div
                    onClick={() => setShowStreamPicker(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      zIndex: 11,
                      background: "#1c1c1c",
                      border: "1px solid #333",
                      borderRadius: "10px",
                      overflow: "hidden",
                      minWidth: "120px",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
                    }}
                  >
                    <a
                      href={twitchLiveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowStreamPicker(false)}
                      className="w-full text-left"
                      style={{ display: "block", padding: "10px 14px", color: "#fff", fontSize: "12px", fontWeight: 700, background: "transparent", borderBottom: "1px solid #2a2a2a", textDecoration: "none" }}
                    >
                      Twitch
                    </a>
                    <a
                      href={youtubeLiveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowStreamPicker(false)}
                      className="w-full text-left"
                      style={{ display: "block", padding: "10px 14px", color: "#fff", fontSize: "12px", fontWeight: 700, background: "transparent", textDecoration: "none" }}
                    >
                      YouTube
                    </a>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={openLiveYT}
              className="flex items-center gap-1.5"
              style={{ color: "#ff3b3b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", fontStyle: "italic" }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#ff3b3b", display: "inline-block", animation: "pulseLive 1.2s ease-in-out infinite" }} />
              LIVE
            </button>
          )
        ) : finished ? (
          <span style={{ color: "#666", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>{T.calendarDone}</span>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onToggleNotif && onToggleNotif(match.id, notifActive); }} style={{ background: "none", border: "none", padding: 2, cursor: "pointer" }}>
            {notifActive ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCF71D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="1" y1="4" x2="3" y2="2" stroke="#CCF71D" strokeWidth="1.5" opacity="0.7" />
                <line x1="21" y1="2" x2="23" y2="4" stroke="#CCF71D" strokeWidth="1.5" opacity="0.7" />
                <line x1="12" y1="1" x2="12" y2="3" stroke="#CCF71D" strokeWidth="1.5" opacity="0.7" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="4" y1="2" x2="20" y2="20" stroke="#666" strokeWidth="2.5" />
              </svg>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <TeamLogo code={match.team1} apiLogo={resolvedLogo1} accent={accent} tbd={tbd} />
            {!hideOdds && <span style={{ color: "#777", fontSize: "10px", fontWeight: 600 }}>{match.odds1 != null ? match.odds1 + "%" : "?"}</span>}
          </div>
          <span className="flex items-center gap-1.5">
            {team1RegionColor && (
              <span
                style={{
                  background: team1RegionColor,
                  color: "#111",
                  fontSize: "8.5px",
                  fontWeight: 900,
                  letterSpacing: "0.02em",
                  borderRadius: "5px",
                  padding: "1.5px 4px",
                  lineHeight: 1.4,
                }}
              >
                {team1RegionCode}
              </span>
            )}
            <span style={{ color: "#ccc", fontSize: "14px", fontWeight: 700, ...txtSt }}>{match.team1}</span>
          </span>
        </div>
        {finished ? (
          <div className="flex flex-col items-center">
            {scoresRevealed ? (
              <>
                <span style={{ color: "#fff", fontSize: "16px", fontWeight: 900, animation: "scoreReveal 0.3s ease-out", ...txtStW }}>
                  {match.score1 != null ? match.score1 : "–"} - {match.score2 != null ? match.score2 : "–"}
                </span>
                {pred && pred.seriesA !== "" && pred.seriesB !== "" && (
                  <span style={{ color: "#777", fontSize: "9.5px", fontWeight: 700, marginTop: "1px" }}>
                    {T.yourBet} : {pred.seriesA}-{pred.seriesB}
                  </span>
                )}
              </>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setScoresRevealed(true); }} style={{ background: "#333", border: "none", borderRadius: 6, padding: "4px 16px", cursor: "pointer" }}>
                <span style={{ color: "#555", fontSize: "16px", fontWeight: 900 }}>?</span>
              </button>
            )}
          </div>
        ) : hasLiveScores ? (
          <div className="flex flex-col items-center">
            {liveRevealed ? (() => {
              let s1 = 0, s2 = 0;
              for (const m of match.live_map_scores) { if (m.score1 > m.score2) s1++; else if (m.score2 > m.score1) s2++; }
              return (
                <span style={{ color: "#ff3b3b", fontSize: "16px", fontWeight: 900, animation: "scoreReveal 0.3s ease-out" }}>
                  {s1} - {s2}
                </span>
              );
            })() : (
              <button onClick={(e) => { e.stopPropagation(); setLiveRevealed(true); }} style={{ background: "rgba(255,59,59,0.1)", border: "1px solid rgba(255,59,59,0.3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                <span style={{ color: "#ff3b3b", fontSize: "9px", fontWeight: 800, textTransform: "uppercase" }}>{T.liveReveal || "Voir"}</span>
              </button>
            )}
          </div>
        ) : (
          <span style={{ color: "#555", fontSize: "11px", fontWeight: 700 }}>VS</span>
        )}
        <div className="flex items-center gap-2 flex-row-reverse">
          <div className="flex flex-col items-center gap-0.5">
            <TeamLogo code={match.team2} apiLogo={resolvedLogo2} accent={accent} tbd={tbd} />
            {!hideOdds && <span style={{ color: "#777", fontSize: "10px", fontWeight: 600 }}>{match.odds2 != null ? match.odds2 + "%" : "?"}</span>}
          </div>
          {isBoosted && <span style={{ color: "#f59e0b", fontWeight: 900, fontSize: 11, background: "rgba(245,158,11,0.12)", border: "1.5px solid rgba(245,158,11,0.4)", borderRadius: 7, padding: "3px 7px", letterSpacing: 0.3, lineHeight: 1 }}>x2</span>}
          <span className="flex items-center gap-1.5 flex-row-reverse">
            {team2RegionColor && (
              <span
                style={{
                  background: team2RegionColor,
                  color: "#111",
                  fontSize: "8.5px",
                  fontWeight: 900,
                  letterSpacing: "0.02em",
                  borderRadius: "5px",
                  padding: "1.5px 4px",
                  lineHeight: 1.4,
                }}
              >
                {team2RegionCode}
              </span>
            )}
            <span style={{ color: "#ccc", fontSize: "14px", fontWeight: 700, ...txtSt }}>{match.team2}</span>
          </span>
        </div>
      </div>

      {finished ? null : tbd ? (
        <div className="px-4 pb-3 text-center" style={{ color: "#666", fontSize: "11px" }}>{T.teamsTbc}</div>
      ) : (
        <div className="px-4 pb-3 flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#888", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>{match.team1}</span>
            <SeriesScoreInput ref={seriesARef} value={seriesA} onChange={(v) => onSeriesChange(match.id, "seriesA", v)} accent={accent} disabled={betLocked} onAdvance={() => seriesBRef.current && seriesBRef.current.focus()} otherValue={seriesB} maxDigit={winsNeeded} />
          </div>
          <span style={{ color: "#444", fontWeight: 900, fontSize: "18px" }}>–</span>
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#888", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>{match.team2}</span>
            <SeriesScoreInput ref={seriesBRef} value={seriesB} onChange={(v) => onSeriesChange(match.id, "seriesB", v)} accent={accent} disabled={betLocked} onAdvance={() => seriesARef.current && seriesARef.current.focus()} otherValue={seriesA} maxDigit={winsNeeded} />
          </div>
        </div>
      )}
      {lockedByTime && !finished && !tbd && (
        <div className="px-4 pb-2 flex items-center justify-center gap-1.5">
          <Lock size={11} color="#666" />
          <span style={{ color: "#666", fontSize: "10px", fontWeight: 600 }}>{T.betLocked || "Pari verrouillé"}</span>
        </div>
      )}
      {finished ? (
        <>
          <div style={{ position: "relative", display: "flex", alignItems: "center", background: "#1e1e1e", padding: "10px 12px" }}>
            <div style={{ position: "relative" }}>
              <button onClick={(e) => { e.stopPropagation(); setShowSharePicker(v => !v); }} className="flex items-center gap-1.5" style={{ color: "#888", fontSize: "10px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer" }}>
                <Share2 size={13} /> Partager
              </button>
              {showSharePicker && (
                <>
                  <div onClick={() => setShowSharePicker(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                  <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 11, background: "#1c1c1c", border: "1px solid #333", borderRadius: 10, padding: "10px 14px", minWidth: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); setShowSharePicker(false); window.dispatchEvent(new CustomEvent("split-create-post", { detail: { text: `${match.team1Name || match.team1} ${match.score1 ?? ""}-${match.score2 ?? ""} ${match.team2Name || match.team2} | ${match.league || ""}` } })); }} className="flex items-center gap-2 w-full" style={{ color: "#fff", fontSize: 12, fontWeight: 700, background: "rgba(204,247,29,0.12)", border: "1px solid rgba(204,247,29,0.3)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
                      <Edit3 size={14} color="#CCF71D" /> <span style={{ color: "#CCF71D" }}>Créer un post</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setShowSharePicker(false); const text = `${match.team1Name || match.team1} ${match.score1}-${match.score2} ${match.team2Name || match.team2} | ${match.league || ""} — Split`; if (navigator.share) { navigator.share({ title: "Split", text }); } else { navigator.clipboard?.writeText(text); } }} className="flex items-center gap-2 w-full" style={{ color: "#fff", fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
                      <Share2 size={14} color="#aaa" /> <span style={{ color: "#aaa" }}>Partager</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => onToggleExpand(match.id)} style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) ${expanded ? "rotate(180deg)" : "rotate(0deg)"}`, background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px", zIndex: 1, transition: "transform 0.25s ease" }}>
              <ChevronDown size={16} color={accent} />
            </button>
            {pointsBreakdown && (
              <span
                style={{
                  background: pointsBreakdown.total > 0 ? "#CCF71D" : "#262626",
                  color: pointsBreakdown.total > 0 ? "#0d0d0d" : "#777",
                  fontSize: "15px",
                  fontWeight: 900,
                  fontStyle: "italic",
                  letterSpacing: "0.01em",
                  padding: "3px 12px",
                  borderRadius: "8px",
                  boxShadow: pointsBreakdown.total > 0 ? "0 0 0 1px rgba(204,247,29,0.35)" : "none",
                }}
              >
                {pointsBreakdown.total} pts
              </span>
            )}
          </div>

          {expanded && (
            <div className="px-4 py-3" style={{ background: "#0d0d0d" }}>
              <div className="flex flex-col gap-2" style={{ position: "relative" }}>
                {(() => {
                  const mapsList = match.map_scores && match.map_scores.length > 0
                    ? match.map_scores
                    : null;
                  if (!mapsList) return <p style={{ color: "#555", fontSize: "11px", textAlign: "center" }}>{T.mapScoresPending || "Scores par map en attente..."}</p>;
                  return mapsList.map((g, i) => {
                    const gamePred = (pred && pred.games && pred.games[i]) || null;
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                            {String(match.id).startsWith("rl-") ? "Game" : "Map"} {i + 1}
                          </span>
                          {g.map && (
                            <span style={{ color: "#8a8a8a", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                              {formatMapLabel(g, i, mapsList.length)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end" style={{ position: "relative" }}>
                          <span style={{ color: "#fff", fontSize: "13px", fontWeight: 800 }}>
                            {g.score1 != null ? g.score1 : 0} - {g.score2 != null ? g.score2 : 0}
                          </span>
                          {gamePred && gamePred.a !== "" && gamePred.b !== "" && (
                            <span style={{ color: "#666", fontSize: "9px", fontWeight: 700, marginTop: "1px" }}>
                              {T.yourBet} : {gamePred.a}-{gamePred.b}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid #2a2a2a", position: "relative" }}>
                {hasReplay ? (
                  cs2KickUrl ? (
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setShowReplayPopup((v) => !v)}
                        className="flex items-center gap-1.5"
                        style={{ color: accent, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}
                      >
                        <Play size={12} />
                        {T.replay}
                      </button>
                      {showReplayPopup && (
                        <>
                          <div onClick={() => setShowReplayPopup(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 11, background: "#1c1c1c", border: "1px solid #333", borderRadius: "10px", padding: "12px 16px", minWidth: "220px", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                            {replayDaysText && <p style={{ color: "#ccc", fontSize: "12px", fontWeight: 600, marginBottom: "10px" }}>{replayDaysText}</p>}
                            <a
                              href={cs2KickUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setShowReplayPopup(false)}
                              className="flex items-center gap-2 w-full"
                              style={{ color: "#fff", fontSize: "12px", fontWeight: 700, background: accent + "22", border: "1px solid " + accent + "44", borderRadius: "8px", padding: "8px 12px", textDecoration: "none" }}
                            >
                              <Play size={14} fill={accent} color={accent} />
                              <span style={{ color: accent }}>Voir sur Kick</span>
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <a
                      href={replayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onReplayClick}
                      className="flex items-center gap-1.5"
                      style={{ color: accent, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none" }}
                    >
                      <Play size={12} />
                      {T.replay}
                    </a>
                  )
                ) : (
                  <span />
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ position: "relative", display: "flex", alignItems: "center", background: "#1e1e1e", padding: "6px 12px", opacity: tbd ? 0.4 : 1 }}>
            <div style={{ position: "relative" }}>
              <button onClick={(e) => { e.stopPropagation(); setShowSharePicker(v => !v); }} className="flex items-center gap-1.5" style={{ color: "#888", fontSize: "10px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer" }}>
                <Share2 size={13} /> Partager
              </button>
              {showSharePicker && (
                <>
                  <div onClick={() => setShowSharePicker(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                  <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 11, background: "#1c1c1c", border: "1px solid #333", borderRadius: 10, padding: "10px 14px", minWidth: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); setShowSharePicker(false); window.dispatchEvent(new CustomEvent("split-create-post", { detail: { text: `${match.team1Name || match.team1} vs ${match.team2Name || match.team2} | ${match.league || ""}` } })); }} className="flex items-center gap-2 w-full" style={{ color: "#fff", fontSize: 12, fontWeight: 700, background: "rgba(204,247,29,0.12)", border: "1px solid rgba(204,247,29,0.3)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
                      <Edit3 size={14} color="#CCF71D" /> <span style={{ color: "#CCF71D" }}>Créer un post</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setShowSharePicker(false); const text = `${match.team1Name || match.team1} vs ${match.team2Name || match.team2} | ${match.league || ""} — Split`; if (navigator.share) { navigator.share({ title: "Split", text }); } else { navigator.clipboard?.writeText(text); } }} className="flex items-center gap-2 w-full" style={{ color: "#fff", fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
                      <Share2 size={14} color="#aaa" /> <span style={{ color: "#aaa" }}>Partager</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => onToggleExpand(match.id)} disabled={tbd} style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) ${expanded ? "rotate(180deg)" : "rotate(0deg)"}`, background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px", zIndex: 1, transition: "transform 0.25s ease" }}>
              <ChevronDown size={16} color={accent} />
            </button>
          </div>

          {expanded && !tbd && (
            <div className="px-4 py-3" style={{ background: "#0d0d0d" }}>
              {hasLiveScores && liveRevealed && (
                <div className="mb-3 pb-3" style={{ borderBottom: "1px solid #262626" }}>
                  {match.live_map_scores.map((lm, li) => (
                    <div key={li} className="flex items-center justify-between py-1">
                      <span style={{ color: "#888", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Map {li + 1}{lm.map ? ` · ${lm.map}` : ""}</span>
                      <span style={{ color: "#ff3b3b", fontSize: "12px", fontWeight: 800 }}>{lm.score1} - {lm.score2}</span>
                    </div>
                  ))}
                </div>
              )}
              {games.length === 0 ? (
                <p className="text-center" style={{ color: "#777", fontSize: "11px" }}>{T.seriesHint}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {games.map((g, i) => {
                    // On n'affiche l'erreur que si les DEUX scores ont été
                    // saisis (non vides) ET que l'utilisateur a quitté les
                    // deux champs (blur) après saisie : jamais à vide,
                    // jamais pendant que l'utilisateur tape encore — mais
                    // bien dès que c'est fini, même sur un score ambigu
                    // comme "1" seul (ex: 12-1).
                    const bothFilled = g.a !== "" && g.b !== "";
                    const bothTouched = touchedFields[i + "-a"] && touchedFields[i + "-b"];
                    const showError = bothFilled && bothTouched && !isValidScore(g.a, g.b);
                    const mapErr = mapErrors[i];
                    const showMapError = !!mapErr && bothFilled && bothTouched;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ color: "#8a8a8a", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Map {i + 1}</span>
                          {showMapError ? (
                            <span className="flex items-center gap-1" style={{ color: "#e05252", fontSize: "10px", textAlign: "right" }}>
                              <AlertCircle size={12} />
                              {mapErr.name} {T[mapErr.key]}
                            </span>
                          ) : (
                            showError && (
                              <span className="flex items-center gap-1" style={{ color: "#e05252", fontSize: "10px" }}>
                                <AlertCircle size={12} />
                                {T.scoreInvalid}
                              </span>
                            )
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-3">
                          <GameScoreInput
                            ref={(el) => (gameRefs.current[i + "-a"] = el)}
                            value={g.a}
                            onChange={(v) => onScoreChange(match.id, i, "a", v)}
                            disabled={betLocked}
                            onAdvance={() => gameRefs.current[i + "-b"] && gameRefs.current[i + "-b"].focus()}
                            otherValue={g.b}
                            onFieldFocus={() => markUntouched(i + "-a")}
                            onFieldBlur={() => markTouched(i + "-a")}
                          />
                          <span style={{ color: "#444", fontWeight: 700 }}>—</span>
                          <GameScoreInput
                            ref={(el) => (gameRefs.current[i + "-b"] = el)}
                            value={g.b}
                            onChange={(v) => onScoreChange(match.id, i, "b", v)}
                            otherValue={g.a}
                            onFieldFocus={() => markUntouched(i + "-b")}
                            onFieldBlur={() => markTouched(i + "-b")}
                            disabled={betLocked}
                            onAdvance={() => gameRefs.current[i + "-a"] && gameRefs.current[i + "-a"].focus()}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// QUEST ENGINE + STREAK + NEXIUM BOX + DAILY LIMIT
// ═══════════════════════════════════════════════════

const QUEST_DAILY_POOL = [
  { id: "bet_today", titleKey: "questBetToday", target: 1, kit: "pronostic", xp: 75 },
  { id: "bet_2_games", titleKey: "questBet2Games", target: 1, kit: "pronostic", xp: 100 },
  { id: "use_all_slots", titleKey: "questUseAllSlots", target: 4, kit: "pronostic", xp: 150, group: "multi_bet" },
  { id: "bet_3_matches", titleKey: "questBet3Matches", target: 3, kit: "pronostic", xp: 125, group: "multi_bet" },
  { id: "bet_cs2", titleKey: "questBetCs2", target: 1, kit: "pronostic", xp: 75 },
  { id: "bet_valo", titleKey: "questBetValo", target: 1, kit: "pronostic", xp: 75 },
  { id: "bet_5_matches", title: "Place tes 5 pronostics du jour", target: 5, kit: "pronostic", xp: 175, group: "multi_bet" },
  { id: "bet_both_games", title: "Parie sur un match Valo et un match CS2", target: 2, kit: "pronostic", xp: 125 },
  { id: "bet_rl", title: "Place un pronostic sur un match Rocket League", target: 1, kit: "pronostic", xp: 75 },
  { id: "bet_all_3_games", title: "Parie sur les 3 jeux dans la même session", target: 3, kit: "pronostic", xp: 200 },
  { id: "view_bracket", titleKey: "questViewBracket", target: 1, kit: "engagement", xp: 50 },
  { id: "check_live", titleKey: "questCheckLive", target: 1, kit: "engagement", xp: 75 },
  { id: "check_results", title: "Va voir les résultats d'un match terminé", target: 1, kit: "engagement", xp: 50 },
  { id: "scroll_leaderboard", title: "Consulte le classement des joueurs", target: 1, kit: "engagement", xp: 50 },
  { id: "add_avatar", titleKey: "questAddAvatar", target: 1, kit: "profile", oneTime: true, xp: 100 },
  { id: "add_bio", titleKey: "questAddBio", target: 1, kit: "profile", oneTime: true, xp: 100 },
  { id: "choose_fav", titleKey: "questChooseFav", target: 1, kit: "profile", oneTime: true, xp: 100 },
  { id: "invite_friend", titleKey: "questInviteFriend", target: 1, kit: "social", xp: 150 },
  { id: "follow_someone", titleKey: "questFollowSomeone", target: 1, kit: "social", xp: 100 },
  { id: "follow_3", title: "Suis 3 joueurs différents", target: 3, kit: "social", xp: 175 },
  { id: "visit_profile", titleKey: "questVisitProfile", target: 1, kit: "social", xp: 50 },
  { id: "visit_3_profiles", title: "Visite le profil de 3 joueurs", target: 3, kit: "social", xp: 100 },
  { id: "open_new_tab", titleKey: "questOpenNewTab", target: 1, kit: "discovery", oneTime: true, xp: 75 },
  { id: "view_classement", titleKey: "questViewClassement", target: 1, kit: "discovery", oneTime: true, xp: 50 },
  { id: "exact_score", titleKey: "questExactScore", target: 1, kit: "precision", xp: 200 },
  { id: "exact_2", title: "Devine le score exact de 2 matchs", target: 2, kit: "precision", xp: 300 },
  { id: "bet_underdog", titleKey: "questBetUnderdog", target: 1, kit: "precision", xp: 125 },
  { id: "share_app", titleKey: "questShareApp", target: 1, kit: "social", xp: 150 },
  { id: "win_bet", title: "Remporte au moins un de tes pronostics", target: 1, kit: "pronostic", xp: 100 },
  { id: "win_2_bets", title: "Remporte 2 pronostics dans la journée", target: 2, kit: "pronostic", xp: 150 },
  { id: "win_3_bets", title: "Remporte 3 pronostics dans la journée", target: 3, kit: "pronostic", xp: 200 },
  { id: "streak_2", title: "Maintiens ton streak pendant 2 jours", target: 2, kit: "streak", xp: 125 },
  { id: "streak_3", title: "Atteins un streak de 3 jours d'affilée", target: 3, kit: "streak", xp: 175 },
  { id: "streak_5", title: "Tiens un streak de 5 jours consécutifs", target: 5, kit: "streak", xp: 250 },
  { id: "post_nexus", title: "Publie un post sur le fil Nexus", target: 1, kit: "social", xp: 75 },
  { id: "like_post", title: "Like le post d'un autre joueur", target: 1, kit: "social", xp: 50 },
  { id: "bet_map_score", title: "Pronostique le score d'au moins une map", target: 1, kit: "precision", xp: 100 },
  { id: "bet_2_map_scores", title: "Pronostique le score de 2 maps différentes", target: 2, kit: "precision", xp: 150 },
];
function generateMatchQuests(upcoming, game) {
  if (!upcoming || !upcoming.length) return [];
  return upcoming.slice(0, 10).map(m => ({
    id: `bet_match_${m.id}`,
    title: `Parie sur ${m.opponents?.[0]?.name || m.team1 || "?"} vs ${m.opponents?.[1]?.name || m.team2 || "?"}`,
    target: 1,
    kit: "pronostic",
    xp: 75,
    matchId: String(m.id),
    game,
  }));
}
const QUEST_WEEKLY_POOL = [
  { id: "weekly_5_wins", titleKey: "questWeekly5Wins", target: 5, kit: "weekly", xp: 400 },
  { id: "weekly_3_exact", titleKey: "questWeekly3Exact", target: 3, kit: "weekly", xp: 500 },
  { id: "weekly_10_bets", titleKey: "questWeekly10Bets", target: 10, kit: "weekly", xp: 300 },
  { id: "weekly_7_bets", title: "Place au moins 7 pronostics cette semaine", target: 7, kit: "weekly", xp: 250 },
  { id: "weekly_15_bets", title: "Atteins les 15 pronostics sur la semaine", target: 15, kit: "weekly", xp: 500 },
  { id: "weekly_20_bets", title: "Place 20 pronostics avant la fin de semaine", target: 20, kit: "weekly", xp: 600 },
  { id: "weekly_bet_all_games", title: "Parie sur Valo, CS2 et RL cette semaine", target: 3, kit: "weekly", xp: 350 },
  { id: "weekly_5_exact", title: "Devine le score exact de 5 matchs cette semaine", target: 5, kit: "weekly", xp: 700 },
  { id: "weekly_streak_5", title: "Garde ton streak actif pendant 5 jours", target: 5, kit: "weekly", xp: 450 },
  { id: "weekly_streak_7", title: "Réalise un streak parfait de 7 jours", target: 7, kit: "weekly", xp: 600 },
  { id: "weekly_10_wins", title: "Remporte 10 pronostics sur la semaine", target: 10, kit: "weekly", xp: 500 },
  { id: "weekly_follow_5", title: "Suis 5 nouveaux joueurs cette semaine", target: 5, kit: "weekly", xp: 300 },
  { id: "weekly_3_cs2", title: "Place 3 pronostics CS2 cette semaine", target: 3, kit: "weekly", xp: 250 },
  { id: "weekly_3_valo", title: "Place 3 pronostics Valorant cette semaine", target: 3, kit: "weekly", xp: 250 },
  { id: "weekly_visit_5_profiles", title: "Découvre le profil de 5 joueurs cette semaine", target: 5, kit: "weekly", xp: 200 },
];
const PRECISION_IDS = new Set(["exact_score", "exact_2"]);
const DAILY_BET_LIMIT = 5;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function halfDaySlot() { const h = new Date().getUTCHours(); return todayStr() + (h < 12 ? "_AM" : "_PM"); }
function weekStartStr() { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); }

const REMOVED_QUEST_IDS = new Set(["open_calendar"]);
function loadQuests() {
  try {
    const raw = JSON.parse(localStorage.getItem("split_quests"));
    if (!raw) return null;
    if (raw.daily) raw.daily = raw.daily.filter(q => !REMOVED_QUEST_IDS.has(q.id));
    return raw;
  } catch { return null; }
}
function saveQuests(q) { localStorage.setItem("split_quests", JSON.stringify(q)); }

function assignDailyQuests(completedOneTimeIds, upcomingMatches) {
  const state = loadQuests();
  const slot = halfDaySlot();
  const ws = weekStartStr();
  if (state && state.lastAssigned === slot) return state;
  const history = state?.history || [];
  const matchQuests = [];
  if (upcomingMatches) {
    if (upcomingMatches.valo) matchQuests.push(...generateMatchQuests(upcomingMatches.valo, "valo"));
    if (upcomingMatches.cs2) matchQuests.push(...generateMatchQuests(upcomingMatches.cs2, "cs2"));
    if (upcomingMatches.rl) matchQuests.push(...generateMatchQuests(upcomingMatches.rl, "rl"));
  }
  const fullPool = [...QUEST_DAILY_POOL, ...matchQuests];
  const avail = fullPool.filter(q => {
    if (q.oneTime && completedOneTimeIds.has(q.id)) return false;
    if (PRECISION_IDS.has(q.id) && history.slice(-3).includes(q.id)) return false;
    if (history.slice(-2).includes(q.id)) return false;
    return true;
  });
  const shuffled = [...avail].sort(() => Math.random() - 0.5);
  const matchPick = shuffled.find(q => q.matchId);
  const usedGroups = new Set();
  const regularPicks = [];
  for (const q of shuffled) {
    if (q.matchId) continue;
    if (regularPicks.length >= (matchPick ? 2 : 3)) break;
    if (q.group && usedGroups.has(q.group)) continue;
    regularPicks.push(q);
    if (q.group) usedGroups.add(q.group);
  }
  const daily = (matchPick ? [...regularPicks, matchPick] : regularPicks).map(q => ({ ...q, progress: 0, completed: false, claimed: false }));
  let weekly = state?.weekly;
  if (!weekly || state?.weekStart !== ws) {
    const wPool = [...QUEST_WEEKLY_POOL].sort(() => Math.random() - 0.5);
    weekly = { ...wPool[0], progress: 0, completed: false, claimed: false };
  }
  const newState = { daily, weekly, lastAssigned: slot, weekStart: ws, history: [...history.slice(-10), ...daily.map(q => q.id)] };
  saveQuests(newState);
  return newState;
}

function loadStreak() {
  try { return JSON.parse(localStorage.getItem("split_streak")) || { current: 0, best: 0, lastBetDate: null }; } catch { return { current: 0, best: 0, lastBetDate: null }; }
}
function saveStreak(s) { localStorage.setItem("split_streak", JSON.stringify(s)); }
function checkStreakExpiry() {
  const s = loadStreak();
  if (s.current === 0 || !s.lastBetDate) return { ...s, justExpired: false };
  const today = todayStr();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (s.lastBetDate === today || s.lastBetDate === yStr) return { ...s, justExpired: false };
  const expired = { current: 0, best: s.best, lastBetDate: s.lastBetDate };
  saveStreak(expired);
  return { ...expired, justExpired: true, lostStreak: s.current };
}
function isStreakExpiring() {
  const s = loadStreak();
  if (s.current === 0 || !s.lastBetDate) return false;
  const today = todayStr();
  if (s.lastBetDate === today) return false;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  return s.lastBetDate === yStr;
}
function updateStreak() {
  const s = loadStreak();
  const today = todayStr();
  if (s.lastBetDate === today) return { ...s, earned: false };
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  const newCurrent = s.lastBetDate === yStr ? s.current + 1 : 1;
  const newBest = Math.max(s.best, newCurrent);
  const next = { current: newCurrent, best: newBest, lastBetDate: today };
  saveStreak(next);
  return { ...next, earned: true };
}

function loadXp() { try { return parseInt(localStorage.getItem("split_xp")) || 0; } catch { return 0; } }
function saveXp(xp) { localStorage.setItem("split_xp", String(xp)); }
function xpForTier(tier) {
  if (tier <= 1) return 0;
  if (tier <= 15) return 400;
  if (tier <= 45) return 600;
  if (tier <= 80) return 800;
  return 1000;
}
function getTierFromXp(totalXp) {
  let remaining = totalXp;
  for (let t = 2; t <= 100; t++) {
    const cost = xpForTier(t);
    if (remaining < cost) return { tier: t - 1, xpInTier: remaining, xpNeeded: cost };
    remaining -= cost;
  }
  return { tier: 100, xpInTier: 0, xpNeeded: 0 };
}
function totalXpForTier(tier) {
  let total = 0;
  for (let t = 2; t <= tier; t++) total += xpForTier(t);
  return total;
}
function getTierReward(tier) {
  return { milestone: tier % 5 === 0 };
}

function loadInventory() {
  try { return JSON.parse(localStorage.getItem("split_inventory")) || []; } catch { return []; }
}
function saveInventory(inv) { localStorage.setItem("split_inventory", JSON.stringify(inv)); }


const QUEST_KIT_ICONS = {
  pronostic: (done) => <Crosshair size={16} color={done ? "#4CAF50" : "#CCF71D"} />,
  engagement: (done) => <Trophy size={16} color={done ? "#4CAF50" : "#F59E0B"} />,
  profile: (done) => <User size={16} color={done ? "#4CAF50" : "#3B82F6"} />,
  social: (done) => <UserPlus size={16} color={done ? "#4CAF50" : "#8B5CF6"} />,
  discovery: (done) => <Search size={16} color={done ? "#4CAF50" : "#06B6D4"} />,
  precision: (done) => <Target size={16} color={done ? "#4CAF50" : "#EF4444"} />,
  weekly: (done) => <Award size={16} color={done ? "#4CAF50" : "#FFD700"} />,
};

function QuestModal({ quests, onClose, onClaim, T }) {
  if (!quests) return null;
  const { daily, weekly } = quests;

  const [resetTimer, setResetTimer] = useState("");
  useEffect(() => {
    function calcTimer() {
      const now = new Date();
      const h = now.getUTCHours();
      const target = new Date(now);
      target.setUTCMinutes(0, 0, 0);
      if (h < 12) target.setUTCHours(12);
      else { target.setUTCDate(target.getUTCDate() + 1); target.setUTCHours(0); }
      const diff = Math.max(0, target - now);
      const hh = Math.floor(diff / 3600000);
      const mm = Math.floor((diff % 3600000) / 60000);
      const ss = Math.floor((diff % 60000) / 1000);
      setResetTimer(`${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`);
    }
    calcTimer();
    const iv = setInterval(calcTimer, 1000);
    return () => clearInterval(iv);
  }, []);

  const renderQuest = (q, idx, isWeekly) => {
    const done = q.completed;
    const kitIcon = QUEST_KIT_ICONS[q.kit] || QUEST_KIT_ICONS.pronostic;
    const xp = q.xp || 50;
    const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
    return (
      <div key={q.id + idx} style={{ background: done ? "rgba(204,247,29,0.06)" : "#111", border: `1px solid ${done ? "rgba(204,247,29,0.25)" : "#1a1a1a"}`, borderRadius: 16, padding: "16px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
        {done && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(204,247,29,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />}
        <div style={{ width: 44, height: 44, borderRadius: 14, background: done ? "rgba(204,247,29,0.15)" : "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: done ? "2px solid rgba(204,247,29,0.4)" : "1px solid #222" }}>
          {done ? <CheckCircle size={20} color="#CCF71D" /> : kitIcon(false)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: done ? "#CCF71D" : "#eee", fontSize: 13, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{q.title || T[q.titleKey] || q.titleKey}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ color: done ? "#CCF71D" : "#A855F7", fontSize: 11, fontWeight: 800 }}>+{xp} XP</span>
            {isWeekly && <span style={{ background: "rgba(255,215,0,0.12)", color: "#FFD700", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6 }}>{T.questWeekly}</span>}
            {done && <span style={{ background: "rgba(204,247,29,0.15)", color: "#CCF71D", fontSize: 9, fontWeight: 900, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Terminé !</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#222", overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", borderRadius: 3, background: done ? "#CCF71D" : "linear-gradient(90deg, #A855F7, #CCF71D)", transition: "width 0.4s ease", boxShadow: done ? "0 0 8px rgba(204,247,29,0.4)" : "none" }} />
            </div>
            <span style={{ color: done ? "#CCF71D" : "#555", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{q.progress}/{q.target}</span>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {done && !q.claimed ? (
            <button onClick={() => onClaim(q.id, isWeekly, xp)} style={{ background: "linear-gradient(135deg, #CCF71D, #A0D911)", color: "#000", border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(204,247,29,0.3)", animation: "pulse 1.5s ease-in-out infinite" }}>Claim</button>
          ) : q.claimed ? (
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(204,247,29,0.1)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(204,247,29,0.2)" }}>
              <CheckCircle size={18} color="#CCF71D" />
            </div>
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={16} color="#333" />
            </div>
          )}
        </div>
      </div>
    );
  };
  return (
    <div style={{ background: "#000", display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><ArrowLeft size={20} color="#fff" /></button>
        <p style={{ color: "#fff", fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}>{T.questTitle}</p>
        <div style={{ width: 20 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ color: "#666", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{T.questDaily}</p>
          <span style={{ color: "#555", fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>Reset {resetTimer}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {(daily || []).map((q, i) => renderQuest(q, i, false))}
        </div>
        {weekly && (
          <>
            <p style={{ color: "#666", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{T.questWeekly}</p>
            {renderQuest(weekly, 0, true)}
          </>
        )}
      </div>
    </div>
  );
}

function RewardsModal({ onClose, T, userXp, predictions, upcomingMatches, liveMatches, cs2UpcomingMatches, cs2LiveMatches, rlUpcomingMatches, rlLiveMatches, settledMatchIds, onAddXp }) {
  const tierInfo = getTierFromXp(userXp || 0);
  const currentTier = tierInfo.tier;
  const scrollRef = useRef(null);
  const currentRef = useRef(null);

  if (!localStorage.getItem("split_inv_v3")) {
    localStorage.setItem("split_inv_v3", "1");
    localStorage.removeItem("split_inventory");
    localStorage.removeItem("split_claimed_tiers");
    localStorage.removeItem("split_equipped_title");
    localStorage.removeItem("split_equipped_banner");
    localStorage.removeItem("split_equipped_banner_color");
  }

  const [claimedTiers, setClaimedTiers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("split_claimed_tiers")) || []; } catch { return []; }
  });
  const [inventoryItems, setInventoryItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("split_inventory")) || []; } catch { return []; }
  });

  const allTiers = Array.from({ length: 100 }, (_, i) => i + 1);
  const progressPct = tierInfo.xpNeeded > 0 ? Math.min(100, (tierInfo.xpInTier / tierInfo.xpNeeded) * 100) : 100;

  useEffect(() => {
    if (currentRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = currentRef.current;
      const top = el.offsetTop - container.offsetTop - 80;
      container.scrollTo({ top: Math.max(0, top) });
    }
  }, []);

  function claimTier(tier, item) {
    const next = [...claimedTiers, tier];
    setClaimedTiers(next);
    localStorage.setItem("split_claimed_tiers", JSON.stringify(next));
    if (item) {
      const ni = [...inventoryItems, item];
      setInventoryItems(ni);
      localStorage.setItem("split_inventory", JSON.stringify(ni));
    }
  }

  const TIER_REWARDS = {
    1: { emoji: "🏅", name: "Badge Bronze", desc: "Premier badge de classement", type: "badge", rarity: "commun" },
    2: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    3: { emoji: "🏷️", name: "Rookie", desc: "Titre de débutant", type: "title", rarity: "commun" },
    4: { emoji: "⭐", name: "Boost XP +200", desc: "+200 XP bonus", type: "xp_bonus", xpAmount: 200 },
    5: { emoji: "🖼️", name: "Bannière Setup", desc: "Fond gaming setup pour ton classement", type: "banner", bannerImage: "/banner-6.png", rarity: "commun" },
    6: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    7: { emoji: "🏷️", name: "Débutant", desc: "Ton premier titre officiel", type: "title", rarity: "commun" },
    8: { emoji: "🎴", name: "Fond Match Néon", desc: "Background néon pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-1.png", rarity: "commun" },
    9: { emoji: "🎁", name: "Coffre Rare", desc: "Contenu exclusif débloqué" },
    10: { emoji: "🖼️", name: "Bannière Sunset", desc: "Fond cozy pour ton classement", type: "banner", bannerImage: "/banner-10.png", rarity: "commun" },
    11: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    12: { emoji: "🏷️", name: "Challenger", desc: "Titre challenger", type: "title", rarity: "commun" },
    13: { emoji: "⭐", name: "Boost XP +300", desc: "+300 XP bonus", type: "xp_bonus", xpAmount: 300 },
    14: { emoji: "🌌", name: "BG Neon City", desc: "Fond néon pour ton profil", type: "background", preview: "/bg-profile-6.png", rarity: "rare" },
    15: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    16: { emoji: "🖼️", name: "Bannière Play Grind", desc: "Fond blue crown pour ton classement", type: "banner", bannerImage: "/banner-1.png", rarity: "rare" },
    17: { emoji: "🏷️", name: "Vétéran", desc: "Titre pour les habitués", type: "title", rarity: "rare" },
    18: { emoji: "🎴", name: "Fond Match Fire", desc: "Background fire pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-2.png", rarity: "commun" },
    19: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    20: { emoji: "🏷️", name: "Stratège", desc: "Titre stratège", type: "title", rarity: "commun" },
    21: { emoji: "⭐", name: "Boost XP +400", desc: "+400 XP bonus", type: "xp_bonus", xpAmount: 400 },
    22: { emoji: "🖼️", name: "Bannière Craft", desc: "Fond Minecraft pour ton classement", type: "banner", bannerImage: "/banner-8.png", rarity: "rare" },
    23: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    24: { emoji: "🏷️", name: "Analyste", desc: "Titre analyste", type: "title", rarity: "commun" },
    25: { emoji: "🌌", name: "Background Profil", desc: "Fond personnalisé pour ton profil", type: "background", preview: "/bg-profile-1.png", rarity: "rare" },
    26: { emoji: "🖼️", name: "Bannière Anime", desc: "Fond anime gamer pour ton classement", type: "banner", bannerImage: "/banner-7.png", rarity: "rare" },
    27: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    28: { emoji: "🎴", name: "Fond Match Galaxy", desc: "Background galaxy pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-3.png", rarity: "rare" },
    29: { emoji: "🏷️", name: "Expert", desc: "Titre expert", type: "title", rarity: "rare" },
    30: { emoji: "⭐", name: "Boost XP +500", desc: "+500 XP bonus", type: "xp_bonus", xpAmount: 500 },
    31: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    32: { emoji: "🏷️", name: "Prodigy", desc: "Titre prodigy", type: "title", rarity: "rare" },
    33: { emoji: "🎁", name: "Coffre Rare", desc: "Contenu exclusif débloqué" },
    34: { emoji: "🌌", name: "BG Crystal Palace", desc: "Fond crystal pour ton profil", type: "background", preview: "/bg-profile-7.png", rarity: "rare" },
    35: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    36: { emoji: "🖼️", name: "Bannière Trophée", desc: "Fond trophée rose pour ton classement", type: "banner", bannerImage: "/banner-3.png", rarity: "epique" },
    37: { emoji: "🎴", name: "Fond Match Storm", desc: "Background storm pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-4.png", rarity: "rare" },
    38: { emoji: "🏷️", name: "Sniper", desc: "Titre sniper", type: "title", rarity: "rare" },
    39: { emoji: "⭐", name: "Boost XP +600", desc: "+600 XP bonus", type: "xp_bonus", xpAmount: 600 },
    40: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    41: { emoji: "🏷️", name: "Tacticien", desc: "Titre tacticien", type: "title", rarity: "rare" },
    42: { emoji: "🖼️", name: "Bannière Tactical", desc: "Fond CS2 pour ton classement", type: "banner", bannerImage: "/banner-4.png", rarity: "epique" },
    43: { emoji: "🎁", name: "Coffre Épique", desc: "Récompense premium esport" },
    44: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    45: { emoji: "🌌", name: "Background Profil", desc: "Fond animé pour ton profil", type: "background", preview: "/bg-profile-2.png", rarity: "epique" },
    46: { emoji: "🏷️", name: "Oracle", desc: "Titre oracle", type: "title", rarity: "epique" },
    47: { emoji: "🎴", name: "Fond Match Cyber", desc: "Background cyber pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-5.png", rarity: "epique" },
    48: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    49: { emoji: "🖼️", name: "Bannière Chill", desc: "Fond chill cat pour ton classement", type: "banner", bannerImage: "/banner-9.png", rarity: "epique" },
    50: { emoji: "💎", name: "Coffre Légendaire", desc: "Le meilleur loot disponible" },
    51: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    52: { emoji: "🏷️", name: "Visionnaire", desc: "Titre visionnaire", type: "title", rarity: "epique" },
    53: { emoji: "⭐", name: "Boost XP +800", desc: "+800 XP bonus", type: "xp_bonus", xpAmount: 800 },
    54: { emoji: "🌌", name: "BG Gaming Zone", desc: "Fond gaming zone pour ton profil", type: "background", preview: "/bg-profile-8.png", rarity: "epique" },
    55: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    56: { emoji: "🏷️", name: "Génie", desc: "Titre génie", type: "title", rarity: "epique" },
    57: { emoji: "🎴", name: "Fond Match Aurora", desc: "Background aurora pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-6.png", rarity: "epique" },
    58: { emoji: "🎁", name: "Coffre Épique", desc: "Récompense premium esport" },
    59: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    60: { emoji: "🌌", name: "Background Profil", desc: "Fond légendaire pour ton profil", type: "background", preview: "/bg-profile-3.png", rarity: "epique" },
    61: { emoji: "🖼️", name: "Bannière Diamant", desc: "Fond diamant crystal pour ton classement", type: "banner", bannerImage: "/banner-2.png", rarity: "legendaire" },
    62: { emoji: "🏷️", name: "Maître", desc: "Titre de maître", type: "title", rarity: "epique" },
    63: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    64: { emoji: "🏅", name: "Badge Champion", desc: "Badge champion pour ton profil", type: "badge", rarity: "epique" },
    65: { emoji: "⭐", name: "Boost XP +1000", desc: "+1000 XP bonus", type: "xp_bonus", xpAmount: 1000 },
    66: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    67: { emoji: "🏷️", name: "GOD Tier", desc: "Titre divin", type: "title", rarity: "legendaire" },
    68: { emoji: "🌌", name: "BG Midnight Arena", desc: "Fond midnight arena pour ton profil", type: "background", preview: "/bg-profile-9.png", rarity: "rare" },
    69: { emoji: "🎴", name: "Fond Match Blaze", desc: "Background blaze pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-7.png", rarity: "legendaire" },
    70: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    71: { emoji: "🏷️", name: "Le Prophète", desc: "Titre prophète", type: "title", rarity: "legendaire" },
    72: { emoji: "⭐", name: "Boost XP +1200", desc: "+1200 XP bonus", type: "xp_bonus", xpAmount: 1200 },
    73: { emoji: "🎁", name: "Coffre Épique", desc: "Récompense premium esport" },
    74: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    75: { emoji: "🏷️", name: "Élu", desc: "Titre élu", type: "title", rarity: "legendaire" },
    76: { emoji: "🏅", name: "Badge Mythique", desc: "Badge mythique pour ton profil", type: "badge", rarity: "epique" },
    77: { emoji: "🌌", name: "BG Cyber Wave", desc: "Fond cyber wave pour ton profil", type: "background", preview: "/bg-profile-10.png", rarity: "rare" },
    78: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    79: { emoji: "🏷️", name: "Immortel", desc: "Titre immortel", type: "title", rarity: "legendaire" },
    80: { emoji: "🌌", name: "Background Profil", desc: "Fond mythique personnalisé", type: "background", preview: "/bg-profile-4.png", rarity: "legendaire" },
    81: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    82: { emoji: "🎴", name: "Fond Match Inferno", desc: "Background inferno pour tes cartes de match", type: "match_bg", matchBgImage: "/match-bg-8.png", rarity: "legendaire" },
    83: { emoji: "⭐", name: "Boost XP +1500", desc: "+1500 XP bonus", type: "xp_bonus", xpAmount: 1500 },
    84: { emoji: "🏷️", name: "GOAT", desc: "Le plus grand de tous les temps", type: "title", rarity: "legendaire" },
    85: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    86: { emoji: "🏅", name: "Badge Ultime", desc: "Badge ultime pour ton profil", type: "badge", rarity: "legendaire" },
    87: { emoji: "🖼️", name: "Bannière Speed", desc: "Fond légendaire voiture pour ton classement", type: "banner", bannerImage: "/banner-5.png", rarity: "legendaire" },
    88: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    89: { emoji: "⭐", name: "Boost XP +2000", desc: "+2000 XP bonus", type: "xp_bonus", xpAmount: 2000 },
    90: { emoji: "🏅", name: "Badge Infini", desc: "Badge infini pour ton profil", type: "badge", rarity: "legendaire" },
    91: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    92: { emoji: "🌌", name: "BG Fire Storm", desc: "Fond fire storm pour ton profil", type: "background", preview: "/bg-profile-5.png", rarity: "legendaire" },
    93: { emoji: "🏅", name: "Badge Éternel", desc: "Badge éternel pour ton profil", type: "badge", rarity: "legendaire" },
    94: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    95: { emoji: "🌌", name: "Background Ultime", desc: "Fond ultime animé", type: "background", preview: "/bg-profile-5.png", rarity: "legendaire" },
    96: { emoji: "⭐", name: "Boost XP +2500", desc: "+2500 XP bonus", type: "xp_bonus", xpAmount: 2500 },
    97: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "rare" },
    98: { emoji: "💎", name: "Coffre Légendaire", desc: "Loot ultime exclusif" },
    99: { emoji: "🔥", name: "Boost ×2", desc: "Double les points d'un match", type: "boost", rarity: "legendaire" },
    100: { emoji: "👑", name: "Récompense Ultime", desc: "Tu as tout débloqué. Légende." },
  };
  const defaultChest = { emoji: "📦", name: "Coffre Standard", desc: "Récompense de progression" };
  function getChest(tier) { return TIER_REWARDS[tier] || defaultChest; }

  const [tab, setTab] = useState("rewards");
  const [invCat, setInvCat] = useState("all");
  const [openingChest, setOpeningChest] = useState(null);
  const [chestPhase, setChestPhase] = useState("idle");
  const [chestResult, setChestResult] = useState(null);
  const [chestStrip, setChestStrip] = useState([]);
  const stripElRef = useRef(null);
  const rafRef = useRef(null);
  const posRef = useRef(0);
  const phaseRef = useRef("idle");
  const spinStartRef = useRef(0);
  const spinFromRef = useRef(0);
  const spinToRef = useRef(0);
  const inventory = inventoryItems;
  const [equippedTitle, setEquippedTitle] = useState(() => localStorage.getItem("split_equipped_title") || "");
  const [equippedBanner, setEquippedBanner] = useState(() => localStorage.getItem("split_equipped_banner") || "");
  const [equippedBadge, setEquippedBadge] = useState(() => localStorage.getItem("split_equipped_badge") || "");

  function equipItem(item) {
    if (item.type === "title") {
      const val = equippedTitle === item.name ? "" : item.name;
      setEquippedTitle(val);
      localStorage.setItem("split_equipped_title", val);
    } else if (item.type === "banner") {
      const val = equippedBanner === item.name ? "" : item.name;
      setEquippedBanner(val);
      localStorage.setItem("split_equipped_banner", val);
      localStorage.setItem("split_equipped_banner_color", val ? (item.bannerImage || "") : "");
    } else if (item.type === "badge") {
      const val = equippedBadge === item.name ? "" : item.name;
      setEquippedBadge(val);
      localStorage.setItem("split_equipped_badge", val);
      localStorage.setItem("split_equipped_badge_emoji", val ? (item.emoji || "🏅") : "");
    }
  }

  const [showBoostPicker, setShowBoostPicker] = useState(false);
  const [boostItemIndex, setBoostItemIndex] = useState(null);
  const [boostTab, setBoostTab] = useState("valo");
  const [showMatchBgPicker, setShowMatchBgPicker] = useState(false);
  const [matchBgPickerItem, setMatchBgPickerItem] = useState(null);
  const [equippedMatchBgs, setEquippedMatchBgs] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem("split_equipped_match_bg") || "null");
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    } catch { return []; }
  });

  function useBoostItem(itemIndex) {
    setBoostItemIndex(itemIndex);
    setShowBoostPicker(true);
    setBoostTab("valo");
  }

  function applyBoostToMatch(matchId) {
    const boosted = JSON.parse(localStorage.getItem("split_boosted_matches") || "[]");
    if (boosted.includes(String(matchId))) return;
    boosted.push(String(matchId));
    localStorage.setItem("split_boosted_matches", JSON.stringify(boosted));
    if (boostItemIndex !== null) {
      const ni = [...inventoryItems];
      ni.splice(boostItemIndex, 1);
      setInventoryItems(ni);
      localStorage.setItem("split_inventory", JSON.stringify(ni));
    }
    setShowBoostPicker(false);
    setBoostItemIndex(null);
  }

  function getBettedMatches(game) {
    const preds = predictions || {};
    const settled = settledMatchIds || new Set();
    const boosted = JSON.parse(localStorage.getItem("split_boosted_matches") || "[]");
    let matches = [];
    if (game === "valo") matches = [...(upcomingMatches || []), ...(liveMatches || [])];
    else if (game === "cs2") matches = [...(cs2UpcomingMatches || []), ...(cs2LiveMatches || [])];
    else matches = [...(rlUpcomingMatches || []), ...(rlLiveMatches || [])];
    return matches.filter(m => {
      const pred = preds[m.id];
      if (!pred || pred.seriesA === "" || pred.seriesB === "") return false;
      if (settled.has(String(m.id))) return false;
      if (boosted.includes(String(m.id))) return false;
      return true;
    });
  }

  function equipMatchBg(item, game, scope) {
    const existing = equippedMatchBgs.filter(b => b.name !== item.name);
    const val = { name: item.name, image: item.matchBgImage, game, scope };
    const updated = [...existing, val];
    localStorage.setItem("split_equipped_match_bg", JSON.stringify(updated));
    setEquippedMatchBgs(updated);
    setShowMatchBgPicker(false);
    setMatchBgPickerItem(null);
  }

  function unequipMatchBg(name) {
    const updated = equippedMatchBgs.filter(b => b.name !== name);
    localStorage.setItem("split_equipped_match_bg", JSON.stringify(updated));
    setEquippedMatchBgs(updated);
    setShowMatchBgPicker(false);
    setMatchBgPickerItem(null);
  }

  function useXpBonusItem(itemIndex) {
    const item = inventoryItems[itemIndex];
    if (!item || !item.xpAmount) return;
    if (onAddXp) onAddXp(item.xpAmount);
    const ni = [...inventoryItems];
    ni.splice(itemIndex, 1);
    setInventoryItems(ni);
    localStorage.setItem("split_inventory", JSON.stringify(ni));
  }

  const RAR = {
    commun: { bg: "#1a1a1a", border: "#555", text: "#999", glow: "none", label: "COMMUN" },
    rare: { bg: "#0d1f3c", border: "#3b82f6", text: "#60a5fa", glow: "0 0 14px rgba(59,130,246,0.3)", label: "RARE" },
    epique: { bg: "#1f0d3c", border: "#a855f7", text: "#c084fc", glow: "0 0 14px rgba(168,85,247,0.35)", label: "ÉPIQUE" },
    legendaire: { bg: "#2d1f00", border: "#f59e0b", text: "#fbbf24", glow: "0 0 18px rgba(245,158,11,0.4)", label: "LÉGENDAIRE" },
  };

  const PSEUDO_COLORS = [
    "#CCF71D","#FF4655","#3B82F6","#F59E0B","#A855F7","#EC4899",
    "#10B981","#EF4444","#06B6D4","#F97316","#8B5CF6","#14B8A6",
    "#E11D48","#FBBF24","#ffffff","#22D3EE","#F472B6","#84CC16",
  ];

  const TITLE_LIST = [
    { emoji: "🏷️", name: "Rookie", rarity: "commun", type: "title" },
    { emoji: "🏷️", name: "Challenger", rarity: "commun", type: "title" },
    { emoji: "🏷️", name: "Stratège", rarity: "commun", type: "title" },
    { emoji: "🏷️", name: "Analyste", rarity: "commun", type: "title" },
    { emoji: "🏷️", name: "Prodigy", rarity: "rare", type: "title" },
    { emoji: "🏷️", name: "Visionnaire", rarity: "rare", type: "title" },
    { emoji: "🏷️", name: "Oracle", rarity: "rare", type: "title" },
    { emoji: "🏷️", name: "Clutch King", rarity: "rare", type: "title" },
    { emoji: "🏷️", name: "Ace", rarity: "rare", type: "title" },
    { emoji: "🏷️", name: "Sniper", rarity: "rare", type: "title" },
    { emoji: "🏷️", name: "Unstoppable", rarity: "epique", type: "title" },
    { emoji: "🏷️", name: "Légende Vivante", rarity: "epique", type: "title" },
    { emoji: "🏷️", name: "Mastermind", rarity: "epique", type: "title" },
    { emoji: "🏷️", name: "Roi du Prono", rarity: "epique", type: "title" },
    { emoji: "🏷️", name: "Inarrêtable", rarity: "epique", type: "title" },
    { emoji: "👑", name: "GOD Tier", rarity: "legendaire", type: "title" },
    { emoji: "👑", name: "Le Prophète", rarity: "legendaire", type: "title" },
    { emoji: "👑", name: "Élu", rarity: "legendaire", type: "title" },
    { emoji: "👑", name: "Immortel", rarity: "legendaire", type: "title" },
    { emoji: "👑", name: "GOAT", rarity: "legendaire", type: "title" },
  ];

  const LOOT_POOL = [
    { emoji: "🏅", name: "Badge Bronze", rarity: "commun" },
    { emoji: "🎖️", name: "Badge Argent", rarity: "commun" },
    { emoji: "⭐", name: "Boost XP 12h", rarity: "commun" },
    { emoji: "🔰", name: "Emblème Recruit", rarity: "commun" },
    { emoji: "🖼️", name: "Bannière Sunset", rarity: "commun", type: "banner", bannerImage: "/banner-10.png" },
    { emoji: "✨", name: "Boost ×2 Points", rarity: "rare" },
    { emoji: "🎯", name: "Boost Pronos +2", rarity: "rare" },
    { emoji: "🖼️", name: "Bannière Play Grind", rarity: "rare", type: "banner", bannerImage: "/banner-1.png" },
    { emoji: "🖼️", name: "Bannière Anime", rarity: "rare", type: "banner", bannerImage: "/banner-7.png" },
    { emoji: "🖼️", name: "Bannière Trophée", rarity: "epique", type: "banner", bannerImage: "/banner-3.png" },
    { emoji: "🎴", name: "Carte Épique", rarity: "epique" },
    { emoji: "🖼️", name: "Bannière Chill", rarity: "epique", type: "banner", bannerImage: "/banner-9.png" },
    { emoji: "🖼️", name: "Bannière Diamant", rarity: "legendaire", type: "banner", bannerImage: "/banner-2.png" },
    ...TITLE_LIST,
    { emoji: "🌌", name: "BG Neon City", rarity: "legendaire", type: "background", preview: "/bg-profile-1.png" },
    { emoji: "🌌", name: "BG Crystal Palace", rarity: "legendaire", type: "background", preview: "/bg-profile-2.png" },
    { emoji: "🌌", name: "BG Gaming Zone", rarity: "legendaire", type: "background", preview: "/bg-profile-3.png" },
    { emoji: "🌌", name: "BG Midnight Arena", rarity: "legendaire", type: "background", preview: "/bg-profile-4.png" },
    { emoji: "🌌", name: "BG Cyber Wave", rarity: "legendaire", type: "background", preview: "/bg-profile-5.png" },
    { emoji: "🌌", name: "BG Fire Storm", rarity: "epique", type: "background", preview: "/bg-profile-6.png" },
    { emoji: "🌌", name: "BG Frost Peak", rarity: "epique", type: "background", preview: "/bg-profile-7.png" },
    { emoji: "🌌", name: "BG Galaxy Drift", rarity: "epique", type: "background", preview: "/bg-profile-8.png" },
    { emoji: "🌌", name: "BG Neon Rush", rarity: "rare", type: "background", preview: "/bg-profile-9.png" },
    { emoji: "🌌", name: "BG Urban Glow", rarity: "rare", type: "background", preview: "/bg-profile-10.png" },
    { emoji: "🎴", name: "Fond Match Néon", rarity: "commun", type: "match_bg", matchBgImage: "/match-bg-1.png" },
    { emoji: "🎴", name: "Fond Match Fire", rarity: "commun", type: "match_bg", matchBgImage: "/match-bg-2.png" },
    { emoji: "🎴", name: "Fond Match Galaxy", rarity: "rare", type: "match_bg", matchBgImage: "/match-bg-3.png" },
    { emoji: "🎴", name: "Fond Match Storm", rarity: "rare", type: "match_bg", matchBgImage: "/match-bg-4.png" },
    { emoji: "🎴", name: "Fond Match Cyber", rarity: "epique", type: "match_bg", matchBgImage: "/match-bg-5.png" },
    { emoji: "🎴", name: "Fond Match Aurora", rarity: "epique", type: "match_bg", matchBgImage: "/match-bg-6.png" },
  ];

  const ITEM_H = 82, VIS_N = 5, STRIP_N = 55, WIN_I = 40;

  function getRar(ch) {
    if (ch.rarity) return ch.rarity;
    const n = ch.name;
    if (n.includes("Légendaire") || n.includes("Ultime") || n.includes("Background") || n.includes("mythique")) return "legendaire";
    if (n.includes("Épique") || n.includes("Carte") || n.includes("Graphique") || n.includes("holographique")) return "epique";
    if (n.includes("Rare") || n.includes("Bannière") || n.includes("Titre") || n.includes("Boost")) return "rare";
    return "commun";
  }
  function isChestItem(ch) { return ch.name.includes("Coffre"); }

  function pickWin(chestName) {
    const w = chestName.includes("Légendaire") ? [0,15,35,50]
      : chestName.includes("Épique") ? [10,30,40,20]
      : chestName.includes("Rare") ? [30,40,20,10] : [55,30,12,3];
    const r = Math.random() * 100;
    const rar = r < w[0] ? "commun" : r < w[0]+w[1] ? "rare" : r < w[0]+w[1]+w[2] ? "epique" : "legendaire";
    const pool = LOOT_POOL.filter(i => i.rarity === rar);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function openChestAnim(tier) {
    const ch = getChest(tier);
    if (!isChestItem(ch) || claimedTiers.includes(tier)) return;
    const winner = pickWin(ch.name);
    const strip = [];
    for (let i = 0; i < STRIP_N; i++) strip.push(i === WIN_I ? winner : LOOT_POOL[Math.floor(Math.random() * LOOT_POOL.length)]);
    setChestStrip(strip); setChestResult(winner); setOpeningChest(tier);
    setChestPhase("idle"); posRef.current = 0; phaseRef.current = "idle";
  }

  function triggerSpin() {
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "spinning"; setChestPhase("spinning");
    spinStartRef.current = performance.now(); spinFromRef.current = posRef.current;
    spinToRef.current = -(WIN_I * ITEM_H) + (VIS_N * ITEM_H) / 2 - ITEM_H / 2;
  }

  useEffect(() => {
    if (!openingChest) return;
    function tick(now) {
      if (phaseRef.current === "idle") { posRef.current -= 0.06; }
      else if (phaseRef.current === "spinning") {
        const t = Math.min(1, (now - spinStartRef.current) / 4500);
        posRef.current = spinFromRef.current + (spinToRef.current - spinFromRef.current) * (1 - Math.pow(1 - t, 4));
        if (t >= 1) { phaseRef.current = "done"; setChestPhase("done"); }
      }
      if (stripElRef.current) stripElRef.current.style.transform = `translateY(${posRef.current}px)`;
      if (phaseRef.current !== "done") rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [openingChest]);

  function claimChestResult() {
    if (openingChest && chestResult) { claimTier(openingChest, chestResult); setOpeningChest(null); phaseRef.current = "idle"; }
  }

  return (
    <div style={{ background: "#0a0a0a", display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <style>{`
        @keyframes chestPulse { 0%,100% { transform: scale(1); box-shadow: 0 0 0 rgba(204,247,29,0); } 50% { transform: scale(1.03); box-shadow: 0 0 16px rgba(204,247,29,0.3); } }
        @keyframes resultReveal { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes winGlow { 0%,100% { box-shadow: 0 0 8px var(--glow-c); } 50% { box-shadow: 0 0 28px var(--glow-c); } }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><ArrowLeft size={20} color="#fff" /></button>
        <p style={{ color: "#fff", fontSize: 16, fontWeight: 900 }}>{T.rewardsFree || "Récompenses"}</p>
        <div style={{ width: 20 }} />
      </div>

      <div style={{ position: "relative", margin: "0 12px 12px", borderRadius: 16, overflow: "hidden", flexShrink: 0, height: 120 }}>
        <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=240&fit=crop" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 100%)" }} />
        <div style={{ position: "relative", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>🏆</span>
            <span style={{ color: "#CCF71D", fontSize: 22, fontWeight: 900 }}>{T.tierLabel || "Palier"} {currentTier}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: progressPct + "%", borderRadius: 4, background: "#CCF71D", transition: "width 0.4s ease", boxShadow: "0 0 10px rgba(204,247,29,0.4)" }} />
            </div>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{tierInfo.xpInTier}/{tierInfo.xpNeeded || "MAX"}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, margin: "0 12px 10px", borderRadius: 12, overflow: "hidden", border: "1px solid #222", flexShrink: 0 }}>
        {[{ key: "rewards", label: "Récompenses" }, { key: "inventory", label: "Inventaire" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "10px 0", background: tab === t.key ? "#CCF71D" : "#111",
            color: tab === t.key ? "#000" : "#888", fontSize: 12, fontWeight: 800,
            border: "none", cursor: "pointer", transition: "all 0.2s",
          }}>{t.label} {t.key === "inventory" ? `(${inventory.length})` : ""}</button>
        ))}
      </div>

      {tab === "rewards" ? (
        <div ref={scrollRef} className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "14px 12px 24px" }}>
          {allTiers.map(tier => {
            const reward = getTierReward(tier);
            const unlocked = tier <= currentTier;
            const isCurrent = tier === currentTier;
            const claimed = claimedTiers.includes(tier);
            const isMilestone = reward.milestone;
            const chest = getChest(tier);
            const hasPreview = !!(chest.preview || chest.bannerImage || chest.matchBgImage);
            const rar = getRar(chest);
            const rc = RAR[rar];
            const isChest = isChestItem(chest);
            return (
              <div key={tier} ref={isCurrent ? currentRef : undefined} style={{
                marginBottom: 10, borderRadius: 18, overflow: "hidden",
                border: `1.5px solid ${isCurrent ? "rgba(204,247,29,0.4)" : rar !== "commun" ? rc.border + "44" : "#222"}`,
                opacity: unlocked || tier === currentTier + 1 ? 1 : 0.3,
              }}>
                {hasPreview && (
                  <div style={{ overflow: "hidden", height: 70, position: "relative" }}>
                    <img src={chest.preview || chest.bannerImage || chest.matchBgImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: unlocked ? "none" : "grayscale(1) brightness(0.3)" }} />
                    {!unlocked && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />}
                  </div>
                )}
                <div style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 14,
                  padding: "20px 18px",
                  background: isCurrent ? "rgba(204,247,29,0.08)" : "#121212",
                }}>
                  <div style={{
                    width: 54, height: 54, borderRadius: 14,
                    background: unlocked ? rc.bg : "#141414",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    border: `1.5px solid ${unlocked ? rc.border : "#1e1e1e"}`,
                    boxShadow: unlocked ? rc.glow : "none",
                  }}>
                    <span style={{ fontSize: 28, filter: unlocked ? "none" : "grayscale(1) brightness(0.4)" }}>{chest.emoji}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: isCurrent ? "#CCF71D" : unlocked ? "#fff" : "#666", fontSize: 15, fontWeight: 800 }}>{chest.name}</span>
                      <span style={{ color: isCurrent ? "#CCF71D" : "#777", fontSize: 10, fontWeight: 700, background: isCurrent ? "rgba(204,247,29,0.12)" : "#1a1a1a", padding: "2px 8px", borderRadius: 6 }}>Lv.{tier}</span>
                    </div>
                    <p style={{ color: unlocked ? "#ccc" : "#555", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{chest.desc}</p>
                    <span style={{ color: rc.text, fontSize: 10, fontWeight: 800, letterSpacing: 1.5 }}>{rc.label}</span>
                  </div>
                  {unlocked && !claimed && isChest && (
                    <button onClick={() => openChestAnim(tier)} style={{
                      padding: "9px 14px", borderRadius: 10, background: "#CCF71D", color: "#000",
                      fontSize: 11, fontWeight: 900, border: "none", cursor: "pointer", flexShrink: 0,
                      animation: "chestPulse 2s ease infinite",
                    }}>OUVRIR</button>
                  )}
                  {unlocked && !claimed && !isChest && (
                    <button onClick={() => claimTier(tier, chest)} style={{
                      padding: "9px 14px", borderRadius: 10, background: "rgba(204,247,29,0.12)",
                      color: "#CCF71D", fontSize: 11, fontWeight: 800, border: "1px solid rgba(204,247,29,0.2)",
                      cursor: "pointer", flexShrink: 0,
                    }}>Réclamer</button>
                  )}
                  {claimed && <CheckCircle size={20} color="#4CAF50" style={{ flexShrink: 0 }} />}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "8px 12px 24px", minHeight: 0 }}>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3" style={{ flexShrink: 0 }}>
            {[
              { key: "all", label: "Tout" },
              { key: "fonds", label: "Fonds" },
              { key: "badge", label: "Badges" },
              { key: "titre", label: "Titres" },
              { key: "arsenal", label: "Arsenal" },
            ].map(c => (
              <button key={c.key} onClick={() => setInvCat(c.key)} className="shrink-0 rounded-full" style={{ padding: "6px 14px", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: invCat === c.key ? "#CCF71D" : "#161616", color: invCat === c.key ? "#000" : "#888", border: invCat === c.key ? "none" : "1px solid #2a2a2a", cursor: "pointer" }}>{c.label}</button>
            ))}
          </div>
          {(() => {
            const filtered = inventory.filter(item => {
              if (invCat === "all") return true;
              if (invCat === "fonds") return item.type === "match_bg" || item.type === "banner" || item.type === "background";
              if (invCat === "badge") return item.type === "badge";
              if (invCat === "titre") return item.type === "title";
              if (invCat === "arsenal") return item.type === "boost" || item.type === "xp_bonus";
              return true;
            });
            if (filtered.length === 0) return (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <span style={{ fontSize: 44, display: "block", marginBottom: 14 }}>📦</span>
                <p style={{ color: "#aaa", fontSize: 15, fontWeight: 700 }}>{invCat === "all" ? "Inventaire vide" : "Aucun objet dans cette catégorie"}</p>
                <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>Réclame des récompenses pour remplir ton inventaire</p>
              </div>
            );
            return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {filtered.map((item) => {
                const i = inventory.indexOf(item);
                const rar = getRar(item);
                const rc = RAR[rar] || RAR.commun;
                const isEquippedTitle = item.type === "title" && equippedTitle === item.name;
                const isEquippedBanner = item.type === "banner" && equippedBanner === item.name;
                const isEquippedMatchBg = item.type === "match_bg" && equippedMatchBgs.some(b => b.name === item.name);
                const isEquippedBadge = item.type === "badge" && equippedBadge === item.name;
                const isEquipped = isEquippedTitle || isEquippedBanner || isEquippedMatchBg || isEquippedBadge;
                const canEquip = item.type === "title" || item.type === "banner" || item.type === "badge";
                const isBoost = item.type === "boost";
                return (
                  <div key={i} style={{ background: isEquipped ? rc.bg : "#141414", border: `1.5px solid ${isEquipped ? rc.border : rc.border + "33"}`, borderRadius: 16, padding: "14px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, overflow: "hidden", boxShadow: isEquipped ? rc.glow : "none" }}>
                    {(item.preview || item.bannerImage || item.matchBgImage) && <img src={item.preview || item.bannerImage || item.matchBgImage} alt="" style={{ width: "100%", height: 56, objectFit: "cover", borderRadius: 10 }} />}
                    <span style={{ fontSize: 28 }}>{item.emoji}</span>
                    {item.type === "title" ? (
                      <span style={{ color: "#fff", fontSize: 13, fontWeight: 900, textAlign: "center", lineHeight: 1.2, background: `linear-gradient(135deg, ${rc.border}cc, ${rc.border}88)`, padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${rc.border}`, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>{item.name}</span>
                    ) : (
                      <span style={{ color: "#eee", fontSize: 12, fontWeight: 800, textAlign: "center", lineHeight: 1.2 }}>{item.name}</span>
                    )}
                    <span style={{ color: rc.text, fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>{rc.label}</span>
                    {canEquip && (
                      <button onClick={() => equipItem(item)} style={{
                        marginTop: 2, padding: "5px 14px", borderRadius: 8, fontSize: 10, fontWeight: 800, border: "none", cursor: "pointer",
                        background: isEquipped ? rc.border : "rgba(255,255,255,0.08)",
                        color: isEquipped ? "#000" : "#aaa",
                      }}>{isEquipped ? "Équipé ✓" : "Équiper"}</button>
                    )}
                    {isBoost && (
                      <button onClick={() => useBoostItem(i)} style={{
                        marginTop: 2, padding: "5px 14px", borderRadius: 8, fontSize: 10, fontWeight: 800, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#000",
                      }}>Utiliser</button>
                    )}
                    {item.type === "xp_bonus" && (
                      <button onClick={() => useXpBonusItem(i)} style={{
                        marginTop: 2, padding: "5px 14px", borderRadius: 8, fontSize: 10, fontWeight: 800, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "#fff",
                      }}>Utiliser</button>
                    )}
                    {item.type === "match_bg" && (
                      <button onClick={() => { setMatchBgPickerItem(item); setShowMatchBgPicker(true); }} style={{
                        marginTop: 2, padding: "5px 14px", borderRadius: 8, fontSize: 10, fontWeight: 800, border: "none", cursor: "pointer",
                        background: isEquippedMatchBg ? rc.border : "rgba(255,255,255,0.08)",
                        color: isEquippedMatchBg ? "#000" : "#aaa",
                      }}>{isEquippedMatchBg ? "Équipé ✓" : "Équiper"}</button>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      )}

      {showBoostPicker && (
        <div style={{ position: "absolute", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.97)", display: "flex", flexDirection: "column", alignItems: "center", overflow: "auto" }}>
          <button onClick={() => { setShowBoostPicker(false); setBoostItemIndex(null); }} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", zIndex: 10 }}>
            <X size={22} color="#666" />
          </button>
          <div style={{ padding: "24px 0 12px", textAlign: "center" }}>
            <span style={{ fontSize: 32 }}>🔥</span>
            <p style={{ color: "#fff", fontSize: 18, fontWeight: 900, marginTop: 6 }}>Boost x2 Points</p>
            <p style={{ color: "#888", fontSize: 12, fontWeight: 600, marginTop: 4 }}>Choisis un match pour doubler tes points</p>
          </div>
          <div style={{ display: "flex", gap: 8, margin: "8px 0 16px" }}>
            {[["valo", "VALORANT"], ["cs2", "CS2"], ["rl", "RL"]].map(([key, label]) => (
              <button key={key} onClick={() => setBoostTab(key)} style={{
                padding: "8px 20px", borderRadius: 10, fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer",
                background: boostTab === key ? "#CCF71D" : "rgba(255,255,255,0.08)",
                color: boostTab === key ? "#000" : "#888",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ width: "90%", maxWidth: 400, flex: 1, paddingBottom: 24 }}>
            {(() => {
              const matches = getBettedMatches(boostTab);
              if (matches.length === 0) return (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <span style={{ fontSize: 40 }}>🤷</span>
                  <p style={{ color: "#888", fontSize: 13, fontWeight: 700, marginTop: 10 }}>Aucun match disponible</p>
                  <p style={{ color: "#666", fontSize: 12, marginTop: 6, lineHeight: 1.5, padding: "0 16px" }}>Il faut que tu paries sur un match pour pouvoir appliquer un boost x2</p>
                </div>
              );
              return matches.map(m => {
                const pred = (predictions || {})[m.id];
                const t1 = m.opponents?.[0]?.opponent?.name || "TBD";
                const t2 = m.opponents?.[1]?.opponent?.name || "TBD";
                const img1 = m.opponents?.[0]?.opponent?.image_url;
                const img2 = m.opponents?.[1]?.opponent?.image_url;
                return (
                  <div key={m.id} style={{
                    marginBottom: 10, borderRadius: 16, border: "1px solid #222",
                    background: "#111", overflow: "hidden",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        {img1 && <img src={img1} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain", background: "#1a1a1a" }} />}
                        <span style={{ color: "#fff", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t1}</span>
                      </div>
                      <span style={{ color: "#555", fontSize: 12, fontWeight: 800, flexShrink: 0, margin: "0 10px" }}>VS</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, justifyContent: "flex-end" }}>
                        <span style={{ color: "#fff", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{t2}</span>
                        {img2 && <img src={img2} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain", background: "#1a1a1a" }} />}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px 14px" }}>
                      {pred && <span style={{ color: "#888", fontSize: 10, fontWeight: 700 }}>Ton prono : {pred.seriesA} - {pred.seriesB}</span>}
                      <button onClick={() => applyBoostToMatch(m.id)} style={{
                        padding: "7px 18px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#000", marginLeft: "auto",
                      }}>Utiliser 🔥</button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {showMatchBgPicker && matchBgPickerItem && (
        <div style={{ position: "absolute", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.97)", display: "flex", flexDirection: "column", alignItems: "center", overflow: "auto" }}>
          <button onClick={() => { setShowMatchBgPicker(false); setMatchBgPickerItem(null); }} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", zIndex: 10 }}>
            <X size={22} color="#666" />
          </button>
          <div style={{ padding: "24px 0 12px", textAlign: "center" }}>
            <span style={{ fontSize: 32 }}>🎴</span>
            <p style={{ color: "#fff", fontSize: 18, fontWeight: 900, marginTop: 6 }}>{matchBgPickerItem.name}</p>
            <p style={{ color: "#888", fontSize: 12, fontWeight: 600, marginTop: 4 }}>Choisis où appliquer ce fond de carte</p>
          </div>
          <div style={{ width: "88%", maxWidth: 360, borderRadius: 16, overflow: "hidden", marginBottom: 16, border: "1px solid #333" }}>
            <img src={matchBgPickerItem.matchBgImage} alt="" style={{ width: "100%", height: 100, objectFit: "cover" }} />
          </div>
          <p style={{ color: "#aaa", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Quel jeu ?</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
            {[["all", "Tous les jeux"], ["valo", "VALORANT"], ["cs2", "CS2"], ["rl", "Rocket League"]].map(([key, label]) => (
              <button key={key} onClick={() => setMatchBgPickerItem(prev => ({ ...prev, _game: key }))} style={{
                padding: "8px 18px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer",
                background: matchBgPickerItem._game === key ? "#CCF71D" : "rgba(255,255,255,0.08)",
                color: matchBgPickerItem._game === key ? "#000" : "#888",
              }}>{label}</button>
            ))}
          </div>
          <p style={{ color: "#aaa", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Quels matchs ?</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 24 }}>
            {[["all", "Tous les matchs"], ["betted", "Matchs pariés"], ["others", "Autres matchs"]].map(([key, label]) => (
              <button key={key} onClick={() => setMatchBgPickerItem(prev => ({ ...prev, _scope: key }))} style={{
                padding: "8px 18px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer",
                background: matchBgPickerItem._scope === key ? "#CCF71D" : "rgba(255,255,255,0.08)",
                color: matchBgPickerItem._scope === key ? "#000" : "#888",
              }}>{label}</button>
            ))}
          </div>
          {matchBgPickerItem._scope === "others" && (
            <p style={{ color: "#666", fontSize: 10, fontWeight: 600, marginBottom: 16, textAlign: "center", padding: "0 20px" }}>Les matchs non pariés auront ce fond. Dès que tu paries, le fond passe sur "pariés".</p>
          )}
          {equippedMatchBgs.some(b => b.name === matchBgPickerItem.name) && (
            <button onClick={() => unequipMatchBg(matchBgPickerItem.name)} style={{
              padding: "12px 32px", borderRadius: 12, fontSize: 13, fontWeight: 800, border: "1px solid #555", cursor: "pointer",
              background: "transparent", color: "#aaa", marginBottom: 10,
            }}>Déséquiper</button>
          )}
          <button onClick={() => equipMatchBg(matchBgPickerItem, matchBgPickerItem._game || "all", matchBgPickerItem._scope || "all")} style={{
            padding: "12px 32px", borderRadius: 12, fontSize: 13, fontWeight: 900, border: "none", cursor: "pointer",
            background: "#CCF71D", color: "#000",
          }}>Équiper</button>
        </div>
      )}

      {openingChest && (
        <div style={{ position: "absolute", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.96)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {chestPhase !== "spinning" && (
            <button onClick={() => { setOpeningChest(null); phaseRef.current = "idle"; }} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", zIndex: 10 }}>
              <X size={22} color="#666" />
            </button>
          )}
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 26 }}>{getChest(openingChest).emoji}</span>
            {getChest(openingChest).name}
          </div>
          <p style={{ color: "#666", fontSize: 11, fontWeight: 600, marginBottom: 20 }}>
            {chestPhase === "idle" ? "Appuie pour ouvrir" : chestPhase === "spinning" ? "..." : "Récompense obtenue !"}
          </p>

          <div style={{ position: "relative", width: "88%", maxWidth: 340, height: VIS_N * ITEM_H, overflow: "hidden", borderRadius: 18, border: "2px solid #222", background: "#0a0a0a" }}>
            <div style={{
              position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)",
              height: ITEM_H + 4, borderRadius: 14, border: "2px solid #CCF71D", zIndex: 10, pointerEvents: "none",
              boxShadow: "0 0 24px rgba(204,247,29,0.25), inset 0 0 24px rgba(204,247,29,0.04)",
            }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 40, background: "linear-gradient(to bottom, #0a0a0a, transparent)", zIndex: 5, pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 40, background: "linear-gradient(to top, #0a0a0a, transparent)", zIndex: 5, pointerEvents: "none" }} />

            <div ref={stripElRef} style={{ willChange: "transform" }}>
              {chestStrip.map((item, i) => {
                const rc = RAR[item.rarity];
                const isWin = i === WIN_I && chestPhase === "done";
                return (
                  <div key={i} style={{
                    height: ITEM_H, display: "flex", alignItems: "center", gap: 14, padding: "0 18px",
                    background: isWin ? rc.bg : "transparent",
                    borderLeft: isWin ? `3px solid ${rc.border}` : "3px solid transparent",
                    transition: isWin ? "background 0.5s, border-color 0.5s" : "none",
                    ...(isWin ? { "--glow-c": rc.border === "#f59e0b" ? "rgba(245,158,11,0.5)" : rc.border === "#a855f7" ? "rgba(168,85,247,0.4)" : rc.border === "#3b82f6" ? "rgba(59,130,246,0.3)" : "transparent", animation: "winGlow 1.5s ease infinite" } : {}),
                  }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: 12, background: rc.bg,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      border: `1.5px solid ${rc.border}`,
                    }}>
                      <span style={{ fontSize: 24 }}>{item.emoji}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#eee", fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{item.name}</p>
                      <span style={{ color: rc.text, fontSize: 9, fontWeight: 800, letterSpacing: 1.5 }}>{rc.label}</span>
                    </div>
                    {(item.preview || item.bannerImage || item.matchBgImage) && <div style={{ width: 44, height: 30, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      <img src={item.preview || item.bannerImage || item.matchBgImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>

          {chestPhase === "idle" && (
            <button onClick={triggerSpin} style={{
              marginTop: 28, padding: "16px 48px", borderRadius: 14, background: "#CCF71D", color: "#000",
              fontSize: 15, fontWeight: 900, border: "none", cursor: "pointer", letterSpacing: 1,
              boxShadow: "0 0 30px rgba(204,247,29,0.3)",
            }}>OUVRIR LE COFFRE</button>
          )}

          {chestPhase === "done" && chestResult && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.92)", animation: "resultReveal 0.5s ease", zIndex: 20, padding: "20px" }}>
              {(chestResult.preview || chestResult.bannerImage || chestResult.matchBgImage) && (
                <div style={{ margin: "0 auto 16px", width: "85%", maxWidth: 300, height: 80, borderRadius: 14, overflow: "hidden", border: `2px solid ${RAR[chestResult.rarity].border}`, boxShadow: RAR[chestResult.rarity].glow }}>
                  <img src={chestResult.preview || chestResult.bannerImage || chestResult.matchBgImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
              <span style={{ fontSize: 52, marginBottom: 8 }}>{chestResult.emoji}</span>
              <span style={{ color: RAR[chestResult.rarity].text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>{chestResult.name}</span>
              <span style={{
                color: RAR[chestResult.rarity].text, fontSize: 11, fontWeight: 800, letterSpacing: 2,
                background: RAR[chestResult.rarity].bg, padding: "5px 16px", borderRadius: 8,
                border: `1.5px solid ${RAR[chestResult.rarity].border}`, marginBottom: 20,
              }}>{RAR[chestResult.rarity].label}</span>
              {chestResult.desc && <p style={{ color: "#888", fontSize: 12, fontWeight: 600, marginBottom: 16 }}>{chestResult.desc}</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button onClick={claimChestResult} style={{
                  padding: "14px 36px", borderRadius: 12,
                  background: "#CCF71D", color: "#000", fontSize: 14, fontWeight: 900, border: "none", cursor: "pointer",
                  boxShadow: "0 0 20px rgba(204,247,29,0.25)",
                }}>RÉCUPÉRER</button>
                {(chestResult.type === "title" || chestResult.type === "banner") && (
                  <button onClick={() => { equipItem(chestResult); claimChestResult(); }} style={{
                    padding: "14px 28px", borderRadius: 12,
                    background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontWeight: 900, border: "1px solid #333", cursor: "pointer",
                  }}>ÉQUIPER</button>
                )}
                {chestResult.type === "match_bg" && (
                  <button onClick={() => { claimChestResult(); setMatchBgPickerItem(chestResult); setShowMatchBgPicker(true); }} style={{
                    padding: "14px 28px", borderRadius: 12,
                    background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontWeight: 900, border: "1px solid #333", cursor: "pointer",
                  }}>ÉQUIPER</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StreakPopup({ streak, onClose, T }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 9990, background: "linear-gradient(135deg, #FF6B00, #FF9500)", borderRadius: 16, padding: "14px 24px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(255,107,0,0.4)", animation: "streakSlide 0.4s ease-out, streakFade 0.4s ease-in 3s forwards", cursor: "pointer" }}>
      <span style={{ fontSize: 28 }}>🔥</span>
      <div>
        <p style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>{T.streakEarned}</p>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 600 }}>{streak.current} {T.streakDays} 🔥</p>
      </div>
    </div>
  );
}

function XpPopup({ xp, onClose, T }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 9990, background: "linear-gradient(135deg, #A855F7, #6366F1)", borderRadius: 16, padding: "14px 24px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(168,85,247,0.4)", animation: "streakSlide 0.4s ease-out, streakFade 0.4s ease-in 2.5s forwards", cursor: "pointer" }}>
      <Zap size={24} color="#fff" />
      <div>
        <p style={{ color: "#fff", fontSize: 16, fontWeight: 900 }}>+{xp} {T.xpLabel}</p>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 600 }}>{T.xpEarned}</p>
      </div>
    </div>
  );
}

function StreakExpiredPopup({ lostStreak, onClose, T }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 9990, background: "linear-gradient(135deg, #EF4444, #DC2626)", borderRadius: 16, padding: "14px 24px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(239,68,68,0.4)", animation: "streakSlide 0.4s ease-out, streakFade 0.4s ease-in 3.5s forwards", cursor: "pointer" }}>
      <span style={{ fontSize: 28 }}>💔</span>
      <div>
        <p style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>{T.streakExpired}</p>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 600 }}>{T.streakExpiredDesc}</p>
      </div>
    </div>
  );
}

function PredBadge({ remainingPreds, T }) {
  const DAILY_LIMIT = DAILY_BET_LIMIT;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "6px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, background: remainingPreds > 0 ? "rgba(204,247,29,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${remainingPreds > 0 ? "rgba(204,247,29,0.15)" : "rgba(239,68,68,0.15)"}`, borderRadius: 16, padding: "3px 8px" }}>
        <div style={{ display: "flex", gap: 2 }}>
          {Array.from({ length: DAILY_LIMIT }, (_, i) => (
            <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i < remainingPreds ? "#CCF71D" : "#333" }} />
          ))}
        </div>
        <span style={{ color: remainingPreds > 0 ? "#CCF71D" : "#EF4444", fontSize: 9, fontWeight: 700 }}>
          {remainingPreds > 0 ? `${remainingPreds} ${T.predRemaining}` : T.predLimit}
        </span>
      </div>
    </div>
  );
}

const RANK_TIERS = [
  { name: "Unranked",      minPts: 0,    color: "#666",    logo: "unranked",          bg: "rgba(100,100,100,0.3)",  border: "rgba(100,100,100,0.2)", maxPct: 1 },
  { name: "Override",      minPts: 50,   color: "#CD7F32", logo: "/logos/bronze.png",  bg: "rgba(205,127,50,0.32)",  border: "rgba(205,127,50,0.3)",  maxPct: 0.20 },
  { name: "Champion",      minPts: 300,  color: "#A855F7", logo: "/champion.png",     bg: "rgba(168,85,247,0.32)",  border: "rgba(168,85,247,0.3)",  maxPct: 0.25 },
  { name: "Immortal",      minPts: 1000, color: "#EF4444", logo: "/immortal.png",     bg: "rgba(239,68,68,0.32)",   border: "rgba(239,68,68,0.3)",   maxPct: 0.30 },
  { name: "Global Elite",  minPts: 3000, color: "#EAB308", logo: "/global-elite.png", bg: "rgba(234,179,8,0.32)",   border: "rgba(234,179,8,0.3)",   maxPct: 0.15 },
  { name: "Infinite",      minPts: 5000, color: "#38BDF8", logo: "/infinite.png",     bg: "rgba(56,189,248,0.32)",  border: "rgba(56,189,248,0.3)",  maxPct: 0.05 },
];

function getUserRank(points, allUsersPoints) {
  let tier = RANK_TIERS[0];
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (points >= RANK_TIERS[i].minPts) { tier = RANK_TIERS[i]; break; }
  }
  if (allUsersPoints && allUsersPoints.length >= 50 && RANK_TIERS.indexOf(tier) >= 2) {
    const sorted = [...allUsersPoints].sort((a, b) => b - a);
    const total = sorted.length;
    let effectiveTier = tier;
    for (let i = RANK_TIERS.length - 1; i >= 2; i--) {
      const t = RANK_TIERS[i];
      const countAtOrAbove = sorted.filter(p => p >= t.minPts).length;
      const pct = countAtOrAbove / total;
      const maxAllowed = RANK_TIERS.slice(i).reduce((s, r) => s + r.maxPct, 0);
      if (pct > maxAllowed && points < sorted[Math.floor(maxAllowed * total)]) {
        effectiveTier = RANK_TIERS[i - 1];
      } else break;
    }
    tier = effectiveTier;
  }
  const idx = RANK_TIERS.indexOf(tier);
  const nextTier = RANK_TIERS[idx + 1] || null;
  const nextPts = nextTier ? nextTier.minPts : null;
  const progress = nextPts ? Math.min((points - tier.minPts) / (nextPts - tier.minPts), 1) : 1;
  return { ...tier, label: tier.name, progress, nextPts };
}

function RankBadgeCompact({ points, onClick }) {
  const rank = getUserRank(points);
  const isTop = rank.name === "Infinite";
  return (
    <button onClick={onClick} className="rounded-xl" style={{ background: rank.bg, border: `1px solid ${rank.border}`, padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2, cursor: "pointer", minWidth: 0, overflow: "hidden", width: "100%", height: "100%" }}>
      {rank.logo === "unranked" ? (
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
          <path d="M24 4L6 14v12c0 10.5 7.7 20.3 18 22.8C34.3 46.3 42 36.5 42 26V14L24 4z" fill="none" stroke="#555" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M24 10L12 17v9c0 7.5 5.1 14.5 12 16.3 6.9-1.8 12-8.8 12-16.3v-9L24 10z" fill="rgba(80,80,80,0.15)"/>
          <text x="24" y="30" textAnchor="middle" fill="#555" fontSize="16" fontWeight="800" fontFamily="system-ui">?</text>
        </svg>
      ) : rank.logo ? (
        <img src={rank.logo} alt={rank.name} style={{ width: 22, height: 22, objectFit: "contain", filter: isTop ? "drop-shadow(0 0 6px rgba(56,189,248,0.6))" : "none" }} />
      ) : (
        <Shield size={18} color="#666" />
      )}
      <span style={{ color: rank.color, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{rank.label}</span>
      {rank.nextPts && (
        <div style={{ width: "80%", height: 3, background: "#262626", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${rank.progress * 100}%`, height: "100%", background: rank.color, borderRadius: 2 }} />
        </div>
      )}
    </button>
  );
}

function DynamicSlider({ predictions, T }) {
  const [slide, setSlide] = useState(0);
  const slideCount = 3;
  useEffect(() => {
    const id = setInterval(() => setSlide(p => (p + 1) % slideCount), 15000);
    return () => clearInterval(id);
  }, []);

  const totalBets = Object.keys(predictions || {}).length;
  const fakePct = 55 + Math.floor(Math.random() * 25);

  const slides = [
    <div key="match" style={{ display: "flex", alignItems: "center", gap: 6, height: "100%" }}>
      <span style={{ fontSize: 16 }}>⚔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#FFD700", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{T.slideMatchDay}</p>
        <p style={{ color: "#ccc", fontSize: 9, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>TBD vs TBD</p>
      </div>
    </div>,
    <div key="community" style={{ display: "flex", alignItems: "center", gap: 6, height: "100%" }}>
      <span style={{ fontSize: 16 }}>📊</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#3B82F6", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fakePct}% {T.slideCommunity}</p>
        <p style={{ color: "#ccc", fontSize: 9, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Team Alpha</p>
      </div>
    </div>,
    <div key="countdown" style={{ display: "flex", alignItems: "center", gap: 6, height: "100%" }}>
      <span style={{ fontSize: 16 }}>⏳</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#EF4444", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{T.slideCountdown}</p>
        <p style={{ color: "#ccc", fontSize: 9, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Champions 2026</p>
      </div>
    </div>,
  ];

  return (
    <div style={{ position: "relative", overflow: "hidden", height: "100%" }}>
      {slides.map((s, i) => (
        <div key={i} style={{ position: "absolute", inset: 0, padding: "0 14px", display: "flex", alignItems: "center", transition: "transform 0.5s ease, opacity 0.5s ease", transform: `translateY(${(i - slide) * 100}%)`, opacity: i === slide ? 1 : 0 }}>
          {s}
        </div>
      ))}
      <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 3 }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: i === slide ? 10 : 4, borderRadius: 2, background: i === slide ? "#fff" : "#555", transition: "all 0.3s" }} />)}
      </div>
    </div>
  );
}

function NewsCarousel({ T, splashDone }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [ready, setReady] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const dragStartX = useRef(null);
  const timerRef = useRef(null);
  const slideCount = 2;

  useEffect(() => {
    let cancelled = false;
    const imgs = [NEWS_IMAGE, NEWS_EWC_IMAGE];
    let loaded = 0;
    imgs.forEach(src => {
      const img = new Image();
      img.src = src;
      const done = () => { loaded++; if (!cancelled) setImagesLoaded(loaded); };
      img.onload = done;
      img.onerror = done;
      if (img.complete) done();
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (splashDone) return;
    const t1 = setTimeout(() => setActiveSlide(1), 500);
    const t2 = setTimeout(() => setActiveSlide(0), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [splashDone]);

  useEffect(() => {
    if (imagesLoaded >= 2) {
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [imagesLoaded]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!document.hidden) setActiveSlide((p) => (p + 1) % slideCount);
    }, 6000);
  }, []);

  useEffect(() => {
    resetTimer();
    const onVis = () => { if (!document.hidden) resetTimer(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(timerRef.current); document.removeEventListener("visibilitychange", onVis); };
  }, [resetTimer]);

  function goTo(i) {
    setActiveSlide(((i % slideCount) + slideCount) % slideCount);
    resetTimer();
  }

  function onDown(e) {
    dragStartX.current = e.clientX;
  }
  function onUp(e) {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 40) {
      goTo(activeSlide + (dx < 0 ? 1 : -1));
    }
    dragStartX.current = null;
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden mb-6"
      style={{ height: "150px", background: "#000", touchAction: "pan-y" }}
      onPointerDown={onDown}
      onPointerUp={onUp}
    >
      <div className="absolute inset-0" style={{ opacity: activeSlide === 0 ? 1 : 0, transition: ready ? "opacity 0.6s ease" : "none", pointerEvents: activeSlide === 0 ? "auto" : "none" }}>
        <img src={NEWS_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.95) 100%)" }} />
        <span className="absolute rounded-full" style={{ top: "10px", left: "10px", background: "rgba(255,70,85,0.3)", color: "#ff4655", fontSize: "9px", fontWeight: 700, padding: "3px 9px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {T.newsBadge}
        </span>
        <div className="absolute" style={{ right: "16px", top: "50%", transform: "translateY(-50%)", width: "48%", textAlign: "right" }}>
          <p style={{ color: "#fff", fontSize: "17px", fontWeight: 900, lineHeight: 1.1 }}>{T.newsTitle}</p>
          <p style={{ color: "#dcdcdc", fontSize: "10.5px", marginTop: "4px", lineHeight: 1.3 }}>{T.newsSub}</p>
        </div>
      </div>
      <div className="absolute inset-0" style={{ opacity: activeSlide === 1 && imagesLoaded >= 2 ? 1 : 0, transition: ready ? "opacity 0.6s ease" : "none", pointerEvents: activeSlide === 1 ? "auto" : "none" }}>
        <img src={NEWS_EWC_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "left center" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.95) 100%)" }} />
        <span className="absolute rounded-full" style={{ top: "10px", left: "10px", background: "rgba(255,170,0,0.3)", color: "#ffaa00", fontSize: "9px", fontWeight: 700, padding: "3px 9px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {T.news2Badge}
        </span>
        <div className="absolute" style={{ right: "16px", top: "50%", transform: "translateY(-50%)", width: "48%", textAlign: "right" }}>
          <p style={{ color: "#ffaa00", fontSize: "16px", fontWeight: 900, lineHeight: 1.1, textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>{T.news2Title}</p>
          <p style={{ color: "#eee", fontSize: "10.5px", marginTop: "6px", lineHeight: 1.35, textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>{T.news2Sub}</p>
        </div>
      </div>

      <div className="absolute flex items-center gap-1.5" style={{ bottom: "10px", left: "50%", transform: "translateX(-50%)" }}>
        {[0, 1].map((i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="rounded-full"
            style={{ width: activeSlide === i ? "16px" : "6px", height: "6px", background: activeSlide === i ? "#fff" : "rgba(255,255,255,0.4)", transition: "all 0.25s" }}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationsPanel({ notifications, onClose, T }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(360px, 90%)", background: "#0a0a0a", border: "1px solid #262626", borderRadius: 16, padding: "20px 16px", maxHeight: "60vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <p style={{ color: "#fff", fontSize: 16, fontWeight: 900 }}>{T.notifTitle}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="#666" /></button>
        </div>
        {notifications.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notifications.map((n, i) => {
              const icon = n.type === "friend" ? <UserPlus size={16} color="#3B82F6" /> : n.type === "match" ? <Zap size={16} color="#F59E0B" /> : <Bell size={16} color="#888" />;
              const bg = n.type === "friend" ? "rgba(59,130,246,0.08)" : n.type === "match" ? "rgba(245,158,11,0.08)" : "#111";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: bg, border: "1px solid #262626", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
                  <span style={{ color: "#ccc", fontSize: 12, fontWeight: 600 }}>{n.message}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Bell size={28} color="#333" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "#555", fontSize: 12 }}>{T.notifEmpty}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HomeTab({ setActiveTab, onOpenCalendar, onOpenCs2Calendar, T, predictions, streak, quests, onOpenQuests, onOpenRewards, onOpenStreakInfo, onOpenNotifs, userPoints, splashDone, userXp }) {
  const [homeLeaderboard, setHomeLeaderboard] = useState([]);
  useEffect(() => {
    fetch(API_BASE + "/api/social/leaderboard").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setHomeLeaderboard(d);
    }).catch(() => {});
  }, []);
  const top3 = homeLeaderboard.slice(0, 3);
  return (
    <div className="px-4 pt-5 pb-6">
      {/* Circles row: notif + news label + quests */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button onClick={onOpenNotifs} style={{ width: 32, height: 32, borderRadius: "50%", background: "#141414", border: "1px solid #262626", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
            <Bell size={14} color="#888" />
          </button>
          <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{T.newsLabel}</p>
        </div>
        <button onClick={onOpenQuests} style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, rgba(204,247,29,0.1), rgba(204,247,29,0.05))", border: "1px solid rgba(204,247,29,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
          <ListChecks size={14} color="#CCF71D" />
          {quests?.daily?.some(q => q.completed && !q.claimed) && <span style={{ position: "absolute", top: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: "#4CAF50", border: "2px solid #000" }} />}
        </button>
      </div>
      <NewsCarousel T={T} splashDone={splashDone} />

      {/* 3 rectangles row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24, height: 80 }}>
        {/* Rectangle 1: Rewards / Tier */}
        {(() => {
          const ti = getTierFromXp(userXp || 0);
          const pct = ti.xpNeeded > 0 ? Math.min(100, (ti.xpInTier / ti.xpNeeded) * 100) : 100;
          return (
            <button onClick={onOpenRewards} className="rounded-xl" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.12) 0%, #141414 100%)", border: "1px solid rgba(168,85,247,0.25)", cursor: "pointer", padding: "8px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2, minWidth: 0, overflow: "hidden" }}>
              <Zap size={16} color="#A855F7" />
              <span style={{ color: "#A855F7", fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{ti.tier}</span>
              <div style={{ width: "80%", height: 3, borderRadius: 2, background: "#262626", overflow: "hidden" }}>
                <div style={{ height: "100%", width: pct + "%", borderRadius: 2, background: "#A855F7" }} />
              </div>
              <span style={{ color: "#888", fontSize: 8, fontWeight: 700, textTransform: "uppercase" }}>{T.tierLabel}</span>
            </button>
          );
        })()}

        {/* Rectangle 2: Streak */}
        {(() => {
          const expiring = isStreakExpiring() && streak.current > 0;
          return (
            <button onClick={onOpenStreakInfo} className="rounded-xl" style={{ background: streak.current > 0 ? "linear-gradient(135deg, rgba(255,107,0,0.12) 0%, #141414 100%)" : "#141414", border: `1px solid ${streak.current > 0 ? "rgba(255,107,0,0.25)" : "#262626"}`, padding: "8px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2, cursor: "pointer", minWidth: 0, overflow: "hidden", position: "relative" }}>
              <span style={{ fontSize: 22, lineHeight: 1, animation: streak.current > 0 ? "flameGlow 1.5s ease-in-out infinite" : "none", filter: streak.current > 0 ? (expiring ? "drop-shadow(0 0 2px rgba(255,107,0,0.2)) opacity(0.5)" : "drop-shadow(0 0 6px rgba(255,107,0,0.5))") : "none" }}>{streak.current > 0 ? "🔥" : "💤"}</span>
              <span style={{ color: streak.current > 0 ? (expiring ? "#995a00" : "#FF9500") : "#666", fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{streak.current}</span>
              <span style={{ color: "#666", fontSize: 8, fontWeight: 700, textTransform: "uppercase" }}>{T.streakTitle}</span>
            </button>
          );
        })()}

        {/* Rectangle 3: Rank badge */}
        <RankBadgeCompact points={userPoints || 0} onClick={() => setActiveTab("classement")} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{T.classementLabel}</p>
        <button onClick={() => setActiveTab("classement")} style={{ color: "#CCF71D", fontSize: "11px", fontWeight: 700 }}>{T.seeAll}</button>
      </div>
      <div className="rounded-2xl mb-6 overflow-hidden" style={{ background: "#141414", border: "1px solid #262626" }}>
        {[0, 1, 2].map((i) => {
          const user = top3[i];
          const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
          return (
            <div key={i} className="flex items-center justify-between px-4 py-3" style={{
              borderBottom: i < 2 ? "1px solid #2a2a2a" : "none",
              position: "relative", overflow: "hidden",
              background: user?.equipped_banner
                ? `linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.7) 100%), url(${user.equipped_banner}) center/cover no-repeat`
                : "transparent",
            }}>
              <div className="flex items-center gap-3">
                <div className="rounded-full flex items-center justify-center" style={{ width: 24, height: 24, background: user ? `${rankColors[i]}18` : "#222", color: user ? rankColors[i] : "#666", fontSize: "11px", fontWeight: 900 }}>{i + 1}</div>
                {user && user.avatar ? (
                  <img src={user.avatar} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: `2px solid ${rankColors[i]}33` }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User size={14} color="#555" />
                  </div>
                )}
                <span style={{ color: user?.pseudo_color || (user ? "#ccc" : "#555"), fontSize: "13px", fontWeight: 600 }}>{user ? (user.pseudo || user.username) : "—"}</span>
              </div>
              <span style={{ color: user ? rankColors[i] : "#555", fontSize: "12px", fontWeight: 700 }}>{user ? `${user.points} pts` : "—"}</span>
            </div>
          );
        })}
        {top3.length === 0 && (
          <p className="text-center px-4 py-3" style={{ color: "#666", fontSize: "11px" }}>{T.classementEmptyHome}</p>
        )}
      </div>

      <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }} className="mb-3">{T.calendarLabel}</p>
      <button onClick={onOpenCalendar} className="w-full flex items-center justify-between rounded-2xl px-4 py-4" style={{ background: "#141414", border: "1px solid #262626" }}>
        <span className="flex items-center gap-3">
          <span className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: "#1c1c1c" }}>
            <CalendarDays size={18} color="#CCF71D" />
          </span>
          <span className="text-left">
            <span className="block" style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{T.calendarCardTitle}</span>
            <span className="block" style={{ color: "#888", fontSize: "11px" }}>{T.calendarCardSub}</span>
          </span>
        </span>
        <ChevronRight size={18} color="#666" />
      </button>
      <button onClick={onOpenCs2Calendar} className="w-full flex items-center justify-between rounded-2xl px-4 py-4 mt-3" style={{ background: "#141414", border: "1px solid #262626" }}>
        <span className="flex items-center gap-3">
          <span className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: "#1c1c1c" }}>
            <CalendarDays size={18} color="#3B82F6" />
          </span>
          <span className="text-left">
            <span className="block" style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{T.cs2CalendarCardTitle}</span>
            <span className="block" style={{ color: "#888", fontSize: "11px" }}>{T.cs2CalendarCardSub}</span>
          </span>
        </span>
        <ChevronRight size={18} color="#666" />
      </button>
    </div>
  );
}

function BracketMatchCard({ match, accent, prediction, onLiveClick }) {
  const st = (match.status || "").toLowerCase();
  const isCompleted = st === "completed" || st === "finished";
  const isLive = st.includes("live") || st === "running";
  const isTBD = (!match.team1?.name || match.team1.name === "TBD") && (!match.team2?.name || match.team2.name === "TBD");
  const predTeam = prediction?.winner;
  return (
    <div onClick={isLive && onLiveClick ? () => onLiveClick() : undefined} style={{
      width: "100%", borderRadius: 8, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg, #161616 0%, #111 100%)",
      border: isLive ? "1px solid #ff4655" : "1px solid rgba(255,255,255,0.08)",
      boxShadow: isLive ? "0 0 16px rgba(255,70,85,0.3)" : "0 3px 12px rgba(0,0,0,0.5)",
      opacity: isTBD ? 0.4 : 1,
      cursor: isLive ? "pointer" : "default",
    }}>
      {[match.team1, match.team2].map((team, i) => {
        const won = team.is_winner && isCompleted;
        const lost = isCompleted && !team.is_winner;
        const isPredicted = predTeam && team.name && predTeam === team.name;
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 0,
            borderBottom: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
            background: won ? `linear-gradient(90deg, ${accent}20 0%, ${accent}08 100%)` : "transparent",
          }}>
            <div style={{
              width: 3, alignSelf: "stretch", flexShrink: 0,
              background: won ? accent : "transparent",
            }} />
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px 9px 10px",
              opacity: lost ? 0.3 : 1,
            }}>
              <span style={{
                fontSize: 12, fontWeight: won ? 700 : 500,
                color: won ? "#fff" : "#aaa",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
              }}>
                {team.name || "TBD"}
              </span>
              {isPredicted && (
                <span style={{ fontSize: 8, fontWeight: 800, color: "#CCF71D", background: "rgba(204,247,29,0.12)", border: "1px solid rgba(204,247,29,0.2)", padding: "1px 5px", borderRadius: 4, marginLeft: 4, flexShrink: 0 }}>PARI</span>
              )}
              <span style={{
                fontSize: 15, fontWeight: 800, minWidth: 20, textAlign: "center", marginLeft: 6,
                color: won ? accent : "#555",
                fontVariantNumeric: "tabular-nums",
              }}>
                {isLive ? "•" : (team.score ?? "–")}
              </span>
            </div>
          </div>
        );
      })}
      {isLive && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: "#ff4655", padding: "2px 7px 2px 6px",
          fontSize: 7, fontWeight: 800, color: "#fff", letterSpacing: "0.08em",
          borderBottomLeftRadius: 5,
          animation: "bracketLivePulse 2s ease-in-out infinite",
        }}>LIVE</div>
      )}
    </div>
  );
}

function BracketTree({ rounds, accent, label, labelColor, isPlayoffs, qualifiedLabel, qualifiedIsLabel, predictions, onLiveClick }) {
  const CARD_W = 210, CARD_H = 62, BASE_GAP = 18, COL_GAP = 48, LABEL_H = 30, CR = 10, QUAL_H = 32;
  if (!rounds || rounds.length === 0) return null;
  const ROUND_RENAME = { "upper quarterfinals": "Upper Round 1", "upper semifinals": "Upper Semifinals", "upper final": "Upper Final", "lower round 1": "Lower Round 1", "lower round 2": "Lower Round 2", "lower round 3": "Lower Round 3", "lower round 4": "Lower Round 4", "lower final": "Lower Final" };
  if (isPlayoffs) rounds = rounds.map(r => ({ ...r, name: ROUND_RENAME[r.name.toLowerCase()] || r.name }));

  const showQ = qualifiedLabel != null;
  const numCols = rounds.length + (showQ ? 1 : 0);

  const maxMatches = Math.max(...rounds.map((r) => r.matches.length));
  const slotH = CARD_H + BASE_GAP;
  const totalH = Math.max(maxMatches * slotH - BASE_GAP, CARD_H);

  const yPositions = [];
  let prevYs = null;
  rounds.forEach((round, ri) => {
    const count = round.matches.length;
    const prevCount = ri > 0 ? rounds[ri - 1].matches.length : 0;
    const ys = [];
    if (ri === 0) {
      const blockH = count * CARD_H + (count - 1) * BASE_GAP;
      const startY = (totalH - blockH) / 2;
      for (let i = 0; i < count; i++) ys.push(startY + i * slotH);
    } else if (prevCount === 2 * count && prevYs) {
      for (let i = 0; i < count; i++) ys.push((prevYs[i * 2] + prevYs[i * 2 + 1]) / 2);
    } else if (prevCount === count && prevYs) {
      ys.push(...prevYs);
    } else {
      const blockH = count * CARD_H + (count - 1) * BASE_GAP;
      const startY = (totalH - blockH) / 2;
      for (let i = 0; i < count; i++) ys.push(startY + i * slotH);
    }
    prevYs = ys;
    yPositions.push(ys);
  });

  const totalW = numCols * CARD_W + (numCols - 1) * COL_GAP;
  const svgH = totalH + LABEL_H;

  const svgPaths = [];
  for (let ri = 1; ri < rounds.length; ri++) {
    const pCount = rounds[ri - 1].matches.length;
    const cCount = rounds[ri].matches.length;
    const x1 = (ri - 1) * (CARD_W + COL_GAP) + CARD_W;
    const x2 = ri * (CARD_W + COL_GAP);
    const xMid = (x1 + x2) / 2;

    if (pCount === 2 * cCount) {
      for (let ci = 0; ci < cCount; ci++) {
        const tY = yPositions[ri - 1][ci * 2] + CARD_H / 2 + LABEL_H;
        const bY = yPositions[ri - 1][ci * 2 + 1] + CARD_H / 2 + LABEL_H;
        const mY = (tY + bY) / 2;
        svgPaths.push(`M ${x1} ${tY} H ${xMid - CR} Q ${xMid} ${tY} ${xMid} ${tY + CR} V ${mY}`);
        svgPaths.push(`M ${x1} ${bY} H ${xMid - CR} Q ${xMid} ${bY} ${xMid} ${bY - CR} V ${mY}`);
        svgPaths.push(`M ${xMid} ${mY} H ${x2}`);
      }
    } else {
      const n = Math.min(pCount, cCount);
      for (let ci = 0; ci < n; ci++) {
        const pY = yPositions[ri - 1][ci] + CARD_H / 2 + LABEL_H;
        const cY = yPositions[ri][ci] + CARD_H / 2 + LABEL_H;
        if (Math.abs(pY - cY) < 2) {
          svgPaths.push(`M ${x1} ${pY} H ${x2}`);
        } else {
          const dir = cY > pY ? 1 : -1;
          svgPaths.push(`M ${x1} ${pY} H ${xMid - CR} Q ${xMid} ${pY} ${xMid} ${pY + dir * CR} V ${cY - dir * CR} Q ${xMid} ${cY} ${xMid + CR} ${cY} H ${x2}`);
        }
      }
    }
  }

  if (showQ && !qualifiedIsLabel) {
    const lastRi = rounds.length - 1;
    const qCol = rounds.length;
    const x1 = lastRi * (CARD_W + COL_GAP) + CARD_W;
    const x2 = qCol * (CARD_W + COL_GAP);
    for (let mi = 0; mi < rounds[lastRi].matches.length; mi++) {
      const y = yPositions[lastRi][mi] + CARD_H / 2 + LABEL_H;
      svgPaths.push(`M ${x1} ${y} H ${x2}`);
    }
  }

  const accentDim = accent + "55";

  const lastRound = rounds[rounds.length - 1];
  const qualSlots = showQ ? lastRound.matches.map((m) => {
    const st = (m.status || "").toLowerCase();
    const done = st === "completed" || st === "finished";
    if (done && m.team1?.is_winner) return m.team1;
    if (done && m.team2?.is_winner) return m.team2;
    return null;
  }) : [];

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 12px 4px 8px", marginBottom: 12,
        background: `${labelColor}12`, borderRadius: 6,
        border: `1px solid ${labelColor}25`,
      }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: labelColor }} />
        <span style={{ fontSize: 10, fontWeight: 800, color: labelColor, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ position: "relative", width: totalW, height: svgH, minWidth: totalW }}>
        <svg style={{ position: "absolute", inset: 0, width: totalW, height: svgH, pointerEvents: "none" }}>
          {svgPaths.map((d, i) => <path key={i} d={d} fill="none" stroke={accentDim} strokeWidth={1.5} />)}
        </svg>
        {rounds.map((round, ri) => (
          <React.Fragment key={ri}>
            <div style={{
              position: "absolute", left: ri * (CARD_W + COL_GAP), top: 0, width: CARD_W,
              textAlign: "center", fontSize: 9, fontWeight: 800,
              color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap",
            }}>
              {round.name}
            </div>
            {round.matches.map((m, mi) => (
              <div key={m.match_id || mi} style={{ position: "absolute", left: ri * (CARD_W + COL_GAP), top: yPositions[ri][mi] + LABEL_H, width: CARD_W }}>
                <BracketMatchCard match={m} accent={accent} prediction={predictions && predictions[m.match_id]} onLiveClick={onLiveClick} />
              </div>
            ))}
          </React.Fragment>
        ))}
        {showQ && qualifiedIsLabel && (
          <>
            <div style={{
              position: "absolute", left: rounds.length * (CARD_W + COL_GAP), top: 0, width: CARD_W,
              textAlign: "center", fontSize: 9, fontWeight: 800,
              color: accent, textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap",
            }}>
              {qualifiedLabel}
            </div>
            {lastRound.matches.map((m, mi) => {
              const st = (m.status || "").toLowerCase();
              const done = st === "completed" || st === "finished";
              const winner = done && m.team1?.is_winner ? m.team1 : done && m.team2?.is_winner ? m.team2 : null;
              return (
                <div key={"q" + mi} style={{
                  position: "absolute",
                  left: rounds.length * (CARD_W + COL_GAP),
                  top: yPositions[rounds.length - 1][mi] + LABEL_H,
                  width: CARD_W, height: CARD_H,
                  display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, paddingLeft: 8,
                }}>
                  {[m.team1, m.team2].map((team, ti) => {
                    const isWinner = done && team?.is_winner;
                    return (
                      <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isWinner ? "#fff" : "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {team?.name || "TBD"}
                        </span>
                        {isWinner && (
                          <span style={{ background: "#CCF71D", color: "#000", fontSize: 8, fontWeight: 800, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.04em", flexShrink: 0 }}>QUALIFIED</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
        {showQ && !qualifiedIsLabel && (
          <>
            <div style={{
              position: "absolute", left: rounds.length * (CARD_W + COL_GAP), top: 0, width: CARD_W,
              textAlign: "center", fontSize: 9, fontWeight: 800,
              color: accent, textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap",
            }}>
              {qualifiedLabel}
            </div>
            {qualSlots.map((winner, mi) => {
              const isActive = !!winner;
              return (
                <div key={"q" + mi} style={{
                  position: "absolute",
                  left: rounds.length * (CARD_W + COL_GAP),
                  top: yPositions[rounds.length - 1][mi] + (CARD_H - QUAL_H) / 2 + LABEL_H,
                  width: CARD_W, height: QUAL_H,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: isActive ? "#fff" : "#555",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flex: 1,
                  }}>{winner?.name || "TBD"}</span>
                  {isActive && (
                    <span style={{ background: "#CCF71D", color: "#000", fontSize: 8, fontWeight: 800, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.04em", flexShrink: 0 }}>QUALIFIED</span>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function DragScroll({ children }) {
  const ref = React.useRef(null);
  const state = React.useRef({ active: false, startX: 0, scrollLeft: 0 });
  const isTouch = React.useRef(false);
  return (
    <div ref={ref}
      onPointerDown={(e) => {
        if (!ref.current) return;
        isTouch.current = e.pointerType === "touch";
        if (!isTouch.current) state.current = { active: true, startX: e.clientX, scrollLeft: ref.current.scrollLeft };
      }}
      onPointerMove={(e) => { if (!isTouch.current && state.current.active && ref.current) { e.preventDefault(); ref.current.scrollLeft = state.current.scrollLeft - (e.clientX - state.current.startX); } }}
      onPointerUp={() => { state.current.active = false; }}
      onPointerCancel={() => { state.current.active = false; }}
      style={{ overflowX: "auto", cursor: "grab", userSelect: "none", padding: "20px 40px 40px 16px", WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
      className="no-scrollbar">
      {children}
    </div>
  );
}

const BRACKET_STAGES = [
  { key: "kickoff", labelKey: "bracketKickoff", color: "#1DE9D8" },
  { key: "stage", labelKey: "bracketStage", color: "#C4F000" },
  { key: "masters", labelKey: "bracketMasters", color: "#FFD700" },
  { key: "champions", labelKey: "bracketChampions", color: "#ff4655" },
];

const BRACKET_PHASES = [
  { key: "play_ins", labelKey: "bracketPlayIns", color: "#888" },
  { key: "playoffs", labelKey: "bracketPlayoffs", color: "#C4F000" },
];

function GroupStandings({ standings, accent, T }) {
  if (!standings || Object.keys(standings).length === 0) return null;
  return (
    <div style={{ padding: "12px 0" }}>
      {Object.entries(standings).map(([groupName, teams]) => (
        <div key={groupName} style={{ marginBottom: 20 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 7px", marginBottom: 10, background: `${accent}12`, borderRadius: 5, border: `1px solid ${accent}25` }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: accent }} />
            <span style={{ fontSize: 9, fontWeight: 800, color: accent, letterSpacing: "0.08em", textTransform: "uppercase" }}>{groupName}</span>
          </div>
          <div style={{ background: "#111", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 44px", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 8, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <span>{T.bracketTeams || "Team"}</span>
              <span style={{ textAlign: "center" }}>W</span>
              <span style={{ textAlign: "center" }}>L</span>
            </div>
            {teams.map((t, i) => {
              const qualified = i < 2;
              return (
                <div key={t.name} style={{
                  display: "grid", gridTemplateColumns: "1fr 44px 44px",
                  padding: "7px 12px",
                  borderBottom: i < teams.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                  background: qualified ? `${accent}06` : "transparent",
                }}>
                  <span style={{ fontSize: 11, fontWeight: qualified ? 700 : 500, color: qualified ? "#ddd" : "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: qualified ? accent : "#333", fontSize: 9, fontWeight: 800, fontVariantNumeric: "tabular-nums", minWidth: 12 }}>{i + 1}</span>
                    {qualified && <span style={{ width: 2, height: 10, borderRadius: 1, background: accent, flexShrink: 0 }} />}
                    {t.name}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6a6", textAlign: "center" }}>{t.wins}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#a55", textAlign: "center" }}>{t.losses}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChampionsView({ T, accent }) {
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API_BASE + "/api/vct-points");
        if (res.ok) setPoints(await res.json());
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>...</div>;
  if (!points) return <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>{T.bracketNoEvent}</div>;

  return (
    <div style={{ padding: "12px 0" }}>
      {Object.entries(points).map(([region, teams]) => {
        const rInfo = REGIONS.find(r => r.key === region);
        const rAccent = rInfo?.accent || "#fff";
        return (
          <div key={region} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: rAccent, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{regionLabel(region, T)}</div>
            <div style={{ background: "#141414", borderRadius: 10, overflow: "hidden", border: "1px solid #1e1e1e" }}>
              <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 55px", padding: "8px 12px", borderBottom: "1px solid #222", fontSize: 9, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>#</span>
                <span>{T.bracketTeams || "Team"}</span>
                <span style={{ textAlign: "right" }}>PTS</span>
              </div>
              {teams.map((t, i) => {
                const qualified = i < 2;
                return (
                  <div key={t.team} style={{ display: "grid", gridTemplateColumns: "30px 1fr 55px", padding: "7px 12px", borderBottom: i < teams.length - 1 ? "1px solid #1a1a1a" : "none", background: qualified ? "rgba(255,70,85,0.06)" : "transparent" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: qualified ? "#ff4655" : "#444" }}>{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: qualified ? "#fff" : "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.team}
                      {qualified && <span style={{ fontSize: 8, fontWeight: 800, color: "#ff4655", marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{T.bracketQualified}</span>}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: qualified ? "#ff4655" : "#555", textAlign: "right" }}>{t.pts}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RegionStandings({ regionKey, accent, T }) {
  const [points, setPoints] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API_BASE + "/api/vct-points");
        if (res.ok) setPoints(await res.json());
      } catch (e) { /* silent */ }
    })();
  }, []);

  if (!points || !points[regionKey]) return null;
  const teams = points[regionKey];
  const visible = expanded ? teams : teams.slice(0, 7);

  return (
    <div style={{ padding: "0 16px 24px" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 7px", marginBottom: 10, background: `${accent}12`, borderRadius: 5, border: `1px solid ${accent}25` }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: accent, letterSpacing: "0.08em", textTransform: "uppercase" }}>{T.bracketPoints}</span>
      </div>
      <div style={{ background: "#111", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 50px", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 8, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <span>#</span>
          <span>{T.bracketTeams || "Team"}</span>
          <span style={{ textAlign: "right" }}>PTS</span>
        </div>
        {visible.map((t, i) => {
          const qualified = i < 2;
          return (
            <div key={t.team} style={{
              display: "grid", gridTemplateColumns: "28px 1fr 50px",
              padding: "7px 12px",
              borderBottom: i < visible.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
              background: qualified ? `${accent}06` : "transparent",
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: qualified ? accent : "#333", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
              <span style={{ fontSize: 11, fontWeight: qualified ? 700 : 500, color: qualified ? "#ddd" : "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                {qualified && <span style={{ width: 2, height: 10, borderRadius: 1, background: accent, flexShrink: 0 }} />}
                {t.team}
                {qualified && <span style={{ fontSize: 7, fontWeight: 800, color: accent, marginLeft: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{T.bracketQualified}</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: qualified ? accent : "#444", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.pts}</span>
            </div>
          );
        })}
      </div>
      {teams.length > 7 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          width: "100%", marginTop: 8, padding: "8px", cursor: "pointer",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 6, fontSize: 10, fontWeight: 700, color: "#555",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {expanded ? "−" : `+ ${teams.length - 7}`}
        </button>
      )}
    </div>
  );
}

function countBracketProgress(bracket) {
  if (!bracket) return { total: 0, done: 0 };
  let total = 0, done = 0;
  for (const section of [bracket.upper, bracket.lower, bracket.grand_final]) {
    if (!section) continue;
    for (const round of section) {
      for (const m of (round.matches || [])) {
        const hasTwoTeams = m.team1?.name && m.team1.name !== "TBD" && m.team2?.name && m.team2.name !== "TBD";
        if (!hasTwoTeams) continue;
        total++;
        const st = (m.status || "").toLowerCase();
        if (st === "completed" || st === "finished") done++;
      }
    }
  }
  return { total, done };
}

function BracketProgressBar({ bracket, accentColor }) {
  const { total, done } = countBracketProgress(bracket);
  if (total === 0) return null;
  return (
    <div style={{ padding: "8px 16px 4px", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#1e1e1e", overflow: "hidden" }}>
        <div style={{ width: `${(done / total) * 100}%`, height: "100%", background: accentColor, borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ color: "#666", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{done}/{total}</span>
    </div>
  );
}

function BracketPage({ vlrEvents, onBack, T, predictions, onLiveClick, prefetchedBrackets }) {
  const [stage, setStage] = useState(null);
  const [phase, setPhase] = useState(null);
  const [region, setRegion] = useState(null);
  const [bracketData, setBracketData] = useState(prefetchedBrackets || {});
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyEvent, setHistoryEvent] = useState(null);
  useEffect(() => {
    if (prefetchedBrackets) setBracketData(prev => ({ ...prev, ...prefetchedBrackets }));
  }, [prefetchedBrackets]);
  const accent = region ? (REGIONS.find((r) => r.key === region) || {}).accent || "#C4F000" : "#C4F000";
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage, phase, region]);

  const goBack = () => {
    if (region) setRegion(null);
    else if (phase) setPhase(null);
    else if (stage) setStage(null);
    else onBack();
  };

  const stageAvailable = (key) => {
    if (!vlrEvents) return false;
    if (key === "masters") return !!vlrEvents.masters;
    if (key === "champions") return true;
    return Object.keys(vlrEvents[key] || {}).length > 0;
  };

  const regionAvailable = (rKey) => {
    if (!vlrEvents || !stage) return false;
    return vlrEvents[stage] && !!vlrEvents[stage][rKey];
  };

  const fetchBracket = async (eventId) => {
    try {
      const res = await fetch(API_BASE + "/api/vlr-bracket/" + eventId);
      if (res.ok) {
        const data = await res.json();
        setBracketData((prev) => ({ ...prev, [eventId + ":all"]: data }));
      }
    } catch (e) { /* silent */ }
  };

  const selectRegion = async (rKey) => {
    setRegion(rKey);
    let ev;
    if (stage === "masters") ev = vlrEvents.masters;
    else ev = vlrEvents[stage] && vlrEvents[stage][rKey];
    if (!ev) return;
    const cacheKey = ev.event_id + ":all";
    if (bracketData[cacheKey]) return;
    setLoading(true);
    try { await fetchBracket(ev.event_id); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!stage || !region || !vlrEvents) return;
    let ev;
    if (stage === "masters") ev = vlrEvents.masters;
    else ev = vlrEvents[stage] && vlrEvents[stage][region];
    if (!ev) return;
    const id = setInterval(() => fetchBracket(ev.event_id), 45000);
    return () => clearInterval(id);
  }, [stage, region, vlrEvents]);

  const currentData = React.useMemo(() => {
    if (!stage || !region || !vlrEvents) return null;
    let ev;
    if (stage === "masters") ev = vlrEvents.masters;
    else ev = vlrEvents[stage] && vlrEvents[stage][region];
    if (!ev) return null;
    return bracketData[ev.event_id + ":all"] || null;
  }, [stage, region, vlrEvents, bracketData]);

  const openHistory = async () => {
    setShowHistory(true);
    if (historyData) return;
    try {
      const res = await fetch(API_BASE + "/api/vlr-history");
      if (res.ok) setHistoryData(await res.json());
    } catch (e) { /* silent */ }
  };

  const selectHistoryEvent = async (ev) => {
    setHistoryEvent(ev);
    const cacheKey = ev.event_id + ":all";
    if (bracketData[cacheKey]) return;
    setLoading(true);
    try {
      const res = await fetch(API_BASE + "/api/vlr-bracket/" + ev.event_id);
      if (res.ok) {
        const data = await res.json();
        setBracketData((prev) => ({ ...prev, [cacheKey]: data }));
      }
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  const historyBracketData = historyEvent ? bracketData[historyEvent.event_id + ":all"] : null;

  const stageInfo = BRACKET_STAGES.find((s) => s.key === stage);
  const phaseInfo = BRACKET_PHASES.find(p => p.key === phase);
  let headerTitle = "Bracket VCT";
  if (stage && !phase) headerTitle = T[stageInfo?.labelKey] || stage;
  if (stage && phase && !region) headerTitle = (T[stageInfo?.labelKey] || stage) + " · " + (T[phaseInfo?.labelKey] || phase);
  if (stage && phase && region) headerTitle = regionLabel(region, T) + " · " + (T[phaseInfo?.labelKey] || phase);

  const headerColor = stageInfo?.color || phaseInfo?.color || (region && (REGIONS.find(r => r.key === region) || {}).accent) || "#fff";

  const pageStylePlain = { height: "100%", backgroundColor: "#0a0a0a", overflowY: "auto", overscrollBehavior: "contain" };
  const headerStyle = {
    display: "flex", alignItems: "center", gap: 12,
    padding: "16px 16px 14px",
    background: "#0A0A0A",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "sticky", top: 0, zIndex: 20,
  };
  const backBtn = (fn) => (
    <button onClick={fn || goBack} style={{
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
      color: "#999", cursor: "pointer", padding: 6,
      borderRadius: 50, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
      width: 32, height: 32, flexShrink: 0,
    }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
  );
  const titleSpan = (text, color) => (
    <span style={{ fontSize: 15, fontWeight: 800, color: color || "#fff", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
  );

  const renderBracketSection = (bracket, accentColor, isGroupStage) => {
    if (!bracket) return null;
    return <>
      <DragScroll>
        {bracket.upper?.length > 0 && <BracketTree rounds={bracket.upper} accent={accentColor} label={T.bracketUpper} labelColor={accentColor} isPlayoffs qualifiedLabel={isGroupStage ? T.bracketQualified : undefined} predictions={predictions} onLiveClick={onLiveClick} />}
        {bracket.lower?.length > 0 && <BracketTree rounds={bracket.lower} accent={accentColor} label={T.bracketLower} labelColor="#ff4655" isPlayoffs qualifiedLabel={isGroupStage ? T.bracketQualified : undefined} predictions={predictions} onLiveClick={onLiveClick} />}
        {bracket.grand_final?.length > 0 && <BracketTree rounds={bracket.grand_final} accent={accentColor} label={T.bracketGrandFinal} labelColor="#FFD700" isPlayoffs qualifiedLabel={isGroupStage ? undefined : T.bracketQualified} qualifiedIsLabel predictions={predictions} onLiveClick={onLiveClick} />}
      </DragScroll>
    </>;
  };

  // --- History views ---
  if (showHistory) {
    if (historyEvent && historyBracketData) {
      return (
        <div style={pageStylePlain}>
          <div style={headerStyle}>
            <button onClick={() => setHistoryEvent(null)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#888", fontSize: 16, cursor: "pointer", padding: "4px 8px", borderRadius: 6, lineHeight: 1, display: "flex", alignItems: "center" }}>←</button>
            {titleSpan(historyEvent.title)}
          </div>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>...</div>}
          {renderBracketSection(historyBracketData.playoffs?.bracket, "#C4F000")}
        </div>
      );
    }
    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>
          <button onClick={() => { setShowHistory(false); setHistoryEvent(null); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#888", fontSize: 16, cursor: "pointer", padding: "4px 8px", borderRadius: 6, lineHeight: 1, display: "flex", alignItems: "center" }}>←</button>
          {titleSpan(T.bracketHistory)}
        </div>
        {!historyData && <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>...</div>}
        {historyData && (
          <div style={{ padding: "16px 16px 32px" }}>
            {BRACKET_STAGES.map((s) => {
              const events = historyData[s.key] || [];
              if (events.length === 0) return null;
              return (
                <div key={s.key} style={{ marginBottom: 24 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 7px", marginBottom: 10, background: `${s.color}12`, borderRadius: 5, border: `1px solid ${s.color}25` }}>
                    <div style={{ width: 3, height: 12, borderRadius: 2, background: s.color }} />
                    <span style={{ fontSize: 9, fontWeight: 800, color: s.color, letterSpacing: "0.08em", textTransform: "uppercase" }}>{T[s.labelKey] || s.key}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {events.map((ev) => (
                      <button key={ev.event_id} onClick={() => selectHistoryEvent(ev)} style={{
                        background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8,
                        padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "space-between", width: "100%",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      }}>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#ccc" }}>{ev.title}</div>
                          {ev.dates && <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>{ev.dates}</div>}
                        </div>
                        <ChevronRight size={14} color="#444" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Step 1 : Choose stage ---
  if (!stage) {
    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>
          {backBtn(onBack)}
          {titleSpan("Bracket VCT")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "20px 16px" }}>
          {BRACKET_STAGES.map((s) => {
            const avail = stageAvailable(s.key);
            return (
              <button key={s.key} onClick={() => avail && setStage(s.key)} style={{
                background: avail ? `linear-gradient(135deg, ${s.color}0A 0%, #111 60%)` : "#111",
                border: avail ? `1px solid ${s.color}30` : "1px solid rgba(255,255,255,0.04)",
                borderRadius: 12, padding: "36px 12px", cursor: avail ? "pointer" : "default",
                opacity: avail ? 1 : 0.25,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                boxShadow: avail ? `0 4px 20px ${s.color}10` : "none",
                transition: "transform 0.15s",
              }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: s.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{T[s.labelKey] || s.key}</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: "4px 16px 20px" }}>
          <button onClick={openHistory} style={{
            width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10, padding: "13px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase" }}>{T.bracketHistory}</span>
          </button>
        </div>
      </div>
    );
  }

  // --- Champions ---
  if (stage === "champions") {
    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>{backBtn()}{titleSpan(T.bracketChampions, "#ff4655")}</div>
        <div style={{ padding: "0 16px 32px" }}><ChampionsView T={T} accent="#ff4655" /></div>
      </div>
    );
  }

  // --- Masters ---
  if (stage === "masters") {
    if (!region) {
      return (
        <div style={pageStylePlain}>
          <div style={headerStyle}>{backBtn()}{titleSpan(T.bracketMasters, "#FFD700")}</div>
          <div style={{ textAlign: "center", padding: 40 }}>
            {vlrEvents?.masters
              ? <button onClick={() => selectRegion("ALL")} style={{
                  background: "linear-gradient(135deg, #FFD70010 0%, #111 60%)",
                  border: "1px solid #FFD70030", borderRadius: 12, padding: "28px 32px", cursor: "pointer",
                  boxShadow: "0 4px 20px rgba(255,215,0,0.08)",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#FFD700", textTransform: "uppercase", letterSpacing: "0.04em" }}>{vlrEvents.masters.title || "Masters"}</span>
                </button>
              : <span style={{ color: "#555", fontSize: 13 }}>{T.bracketNoEvent}</span>}
          </div>
        </div>
      );
    }
    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>{backBtn()}{titleSpan(T.bracketMasters, "#FFD700")}</div>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>...</div>}
        {renderBracketSection(currentData?.playoffs?.bracket, "#FFD700")}
        {!loading && !currentData?.playoffs?.bracket && <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>{T.bracketNoEvent}</div>}
      </div>
    );
  }

  // --- Step 2 : Choose phase ---
  if (!phase) {
    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>{backBtn()}{titleSpan(headerTitle, stageInfo?.color)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "20px 16px" }}>
          {BRACKET_PHASES.map((p) => (
            <button key={p.key} onClick={() => setPhase(p.key)} style={{
              background: `linear-gradient(90deg, ${p.color}08 0%, #111 50%)`,
              border: `1px solid ${p.color}20`,
              borderRadius: 10, padding: "24px 18px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: `0 2px 12px ${p.color}08`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: p.color }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: p.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{T[p.labelKey] || p.key}</span>
              </div>
              <ChevronRight size={16} color="#444" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Step 3 : Choose region ---
  if (!region) {
    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>{backBtn()}{titleSpan(headerTitle, phaseInfo?.color)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "20px 16px" }}>
          {REGIONS.map((r) => {
            const avail = regionAvailable(r.key);
            return (
              <button key={r.key} onClick={() => avail && selectRegion(r.key)} style={{
                background: avail ? `linear-gradient(135deg, ${r.accent}0A 0%, #111 60%)` : "#111",
                border: avail ? `1px solid ${r.accent}25` : "1px solid rgba(255,255,255,0.04)",
                borderRadius: 12, padding: "30px 12px", cursor: avail ? "pointer" : "default",
                opacity: avail ? 1 : 0.2,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                boxShadow: avail ? `0 4px 16px ${r.accent}10` : "none",
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: r.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>{regionLabel(r.key, T)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Step 4 : Show bracket ---
  const renderBracketView = () => {
    if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>...</div>;
    if (!currentData) return <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>{T.bracketNoEvent}</div>;

    if (phase === "play_ins") {
      const bracket = currentData.play_ins?.bracket;
      const hasBracket = bracket && (bracket.upper?.length > 0 || bracket.lower?.length > 0);
      return hasBracket ? <DragScroll>
        {bracket.upper?.length > 0 && <BracketTree rounds={bracket.upper} accent={accent} label={T.bracketUpper} labelColor={accent} qualifiedLabel={T.bracketQualified} />}
        {bracket.lower?.length > 0 && <BracketTree rounds={bracket.lower} accent={accent} label={T.bracketLower} labelColor="#ff4655" qualifiedLabel={T.bracketQualified} />}
      </DragScroll> : (
        <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>{T.bracketNoEvent}</div>
      );
    }

    if (phase === "playoffs") {
      const bracket = renderBracketSection(currentData.playoffs?.bracket, accent);
      return (
        <>
          {bracket || <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>{T.bracketNoEvent}</div>}
          <RegionStandings regionKey={region} accent={accent} T={T} />
        </>
      );
    }
    return null;
  };

  return (
    <div style={pageStylePlain}>
      <div style={headerStyle}>
        {backBtn()}
        {titleSpan(headerTitle, accent)}
      </div>
      {renderBracketView()}
      {currentData?.teams?.length > 0 && (
        <div style={{ padding: "0 16px 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 7px", marginBottom: 10, background: "rgba(255,255,255,0.03)", borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: "#555" }} />
            <span style={{ fontSize: 9, fontWeight: 800, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" }}>{T.bracketTeams}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {currentData.teams.map(t => (
              <span key={t} style={{
                fontSize: 10, fontWeight: 600, color: "#777",
                background: "#111", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 5, padding: "4px 8px",
              }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CS2_BRACKET_COMPS = [
  { key: "major", labelKey: "cs2BracketMajor", color: "#FFD700", icon: "🏆" },
  { key: "iem", labelKey: "cs2BracketIEM", color: "#00BFFF", icon: "⚡" },
  { key: "blast", labelKey: "cs2BracketBlast", color: "#FF6B00", icon: "💥" },
  { key: "esl", labelKey: "cs2BracketESL", color: "#0078D4", icon: "🛡" },
  { key: "pgl", labelKey: "cs2BracketPGL", color: "#E040FB", icon: "🎮" },
];

function getCS2Phases(compKey, serieName) {
  const s = (serieName || "").toLowerCase();
  if (compKey === "major" || (compKey === "iem" && s.includes("major"))) {
    return [
      { key: "stage1", labelKey: "cs2BracketStage1" },
      { key: "stage2", labelKey: "cs2BracketStage2" },
      { key: "stage3", labelKey: "cs2BracketStage3" },
      { key: "playoffs", labelKey: "cs2BracketPlayoffs" },
    ];
  }
  if (compKey === "blast" && s.includes("bounty")) {
    return [
      { key: "play_ins", labelKey: "cs2BracketPlayIns" },
      { key: "final", labelKey: "cs2BracketFinal" },
    ];
  }
  return [
    { key: "group_stage", labelKey: "cs2BracketGroupStage" },
    { key: "playoffs", labelKey: "cs2BracketPlayoffs" },
  ];
}

function matchPhaseToTournament(phase, tournament) {
  const tName = (tournament.name || "").toLowerCase();
  if (phase.key === "stage1" && (tName.includes("stage 1") || tName.includes("challengers stage") || tName.includes("opening stage"))) return true;
  if (phase.key === "stage2" && (tName.includes("stage 2") || tName.includes("legends stage") || tName.includes("elimination stage"))) return true;
  if (phase.key === "stage3" && tName.includes("stage 3")) return true;
  if (phase.key === "playoffs" && (tName.includes("playoff") || (tName.includes("final") && !tName.includes("group")) || tName.includes("champions stage"))) return true;
  if (phase.key === "play_ins" && (tName.includes("play-in") || tName.includes("play_in") || tName.includes("opening"))) return true;
  if (phase.key === "final" && (tName.includes("final") && !tName.includes("group"))) return true;
  if (phase.key === "group_stage" && (tName.includes("group") || tName.includes("swiss") || tName.includes("round robin") || tName.includes("regular") || (tName.includes("stage") && !(/stage\s*[123]/).test(tName)))) return true;
  return false;
}

function CS2BracketPage({ cs2Events, onBack, T, predictions, onLiveClick, prefetchedBrackets }) {
  const [comp, setComp] = useState(null);
  const [serie, setSerie] = useState(null);
  const [phase, setPhase] = useState(null);
  const [bracketData, setBracketData] = useState(prefetchedBrackets || {});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (prefetchedBrackets) setBracketData(prev => ({ ...prev, ...prefetchedBrackets }));
  }, [prefetchedBrackets]);

  useEffect(() => { window.scrollTo(0, 0); }, [comp, serie, phase]);

  const goBack = () => {
    if (phase) setPhase(null);
    else if (comp) { setComp(null); setSerie(null); }
    else onBack();
  };

  const fetchCs2Bracket = async (serieId) => {
    try {
      const res = await fetch(API_BASE + "/api/cs2-bracket/" + serieId);
      if (res.ok) {
        const data = await res.json();
        setBracketData((prev) => ({ ...prev, ["cs2:" + serieId]: data }));
      }
    } catch (e) { /* silent */ }
  };

  const selectSerie = async (s) => {
    setSerie(s);
    const cacheKey = "cs2:" + s.serie_id;
    if (bracketData[cacheKey]) return;
    setLoading(true);
    try { await fetchCs2Bracket(s.serie_id); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!serie) return;
    const id = setInterval(() => fetchCs2Bracket(serie.serie_id), 45000);
    return () => clearInterval(id);
  }, [serie]);

  const currentData = serie ? bracketData["cs2:" + serie.serie_id] : null;

  const renderBracketSection = (bracket, accentColor, isGroupStage) => {
    if (!bracket) return null;
    return <>
      <DragScroll>
        {bracket.upper?.length > 0 && <BracketTree rounds={bracket.upper} accent={accentColor} label={T.bracketUpper} labelColor={accentColor} isPlayoffs qualifiedLabel={isGroupStage ? T.bracketQualified : undefined} predictions={predictions} onLiveClick={onLiveClick} />}
        {bracket.lower?.length > 0 && <BracketTree rounds={bracket.lower} accent={accentColor} label={T.bracketLower} labelColor="#ff4655" isPlayoffs qualifiedLabel={isGroupStage ? T.bracketQualified : undefined} predictions={predictions} onLiveClick={onLiveClick} />}
        {bracket.grand_final?.length > 0 && <BracketTree rounds={bracket.grand_final} accent={accentColor} label={T.bracketGrandFinal} labelColor="#FFD700" isPlayoffs qualifiedLabel={isGroupStage ? undefined : T.bracketQualified} qualifiedIsLabel predictions={predictions} onLiveClick={onLiveClick} />}
      </DragScroll>
    </>;
  };

  const pageStylePlain = { height: "100%", backgroundColor: "#0a0a0a", overflowY: "auto", overscrollBehavior: "contain" };
  const headerStyle = {
    display: "flex", alignItems: "center", gap: 12,
    padding: "16px 16px 14px",
    background: "#0A0A0A",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "sticky", top: 0, zIndex: 20,
  };
  const backBtn = (fn) => (
    <button onClick={fn || goBack} style={{
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
      color: "#999", cursor: "pointer", padding: 6,
      borderRadius: 50, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
      width: 32, height: 32, flexShrink: 0,
    }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
  );
  const titleSpan = (text, color) => (
    <span style={{ fontSize: 15, fontWeight: 800, color: color || "#fff", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
  );

  const compInfo = CS2_BRACKET_COMPS.find((c) => c.key === comp);
  const accent = compInfo?.color || "#FFD700";

  // --- Step 3: Show phase content ---
  if (comp && phase) {
    if (!serie && !loading) {
      return (
        <div style={pageStylePlain}>
          <div style={headerStyle}>{backBtn()}{titleSpan(T[compInfo?.labelKey] || comp, accent)}</div>
          <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>{T.cs2BracketNoEvent}</div>
        </div>
      );
    }
    if (!serie || !currentData) {
      return (
        <div style={pageStylePlain}>
          <div style={headerStyle}>{backBtn()}{titleSpan(T[compInfo?.labelKey] || comp, accent)}</div>
          <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>...</div>
        </div>
      );
    }
    const phases = getCS2Phases(comp, serie.title);
    const phaseInfo = phases.find((p) => p.key === phase);
    const phaseLabel = phaseInfo ? (T[phaseInfo.labelKey] || phaseInfo.key) : phase;

    const matchingPhases = (currentData.phases || []).filter((p) => matchPhaseToTournament({ key: phase }, p));
    const fallbackPhases = matchingPhases.length > 0 ? matchingPhases : (currentData.phases || []);

    const hasAnyContent = fallbackPhases.some((p) => {
      const b = p.playoffs?.bracket;
      const hasBracket = b && (b.upper?.length > 0 || b.lower?.length > 0 || b.grand_final?.length > 0);
      const hasGroup = p.group_stage?.matches?.length > 0 || Object.keys(p.group_stage?.standings || {}).length > 0;
      return hasBracket || hasGroup;
    });

    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>
          {backBtn()}
          {titleSpan(serie.title + " · " + phaseLabel, accent)}
        </div>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>...</div>}
        {!loading && fallbackPhases.map((p) => {
          const b = p.playoffs?.bracket;
          const hasBracket = b && (b.upper?.length > 0 || b.lower?.length > 0 || b.grand_final?.length > 0);
          const hasStandings = Object.keys(p.group_stage?.standings || {}).length > 0;
          if (!hasBracket && !hasStandings) return null;
          const showLabel = fallbackPhases.length > 1;
          return (
            <div key={p.tournament_id}>
              {showLabel && (
                <div style={{ padding: "16px 16px 0" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 7px", background: `${accent}12`, borderRadius: 5, border: `1px solid ${accent}25` }}>
                    <div style={{ width: 3, height: 12, borderRadius: 2, background: accent }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: "0.08em", textTransform: "uppercase" }}>{p.name}</span>
                  </div>
                </div>
              )}
              {hasStandings && <GroupStandings standings={p.group_stage.standings} accent={accent} T={T} />}
              {hasBracket && renderBracketSection(b, accent, phase === "group_stage")}
            </div>
          );
        })}
        {!loading && !hasAnyContent && (
          <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>{T.cs2BracketNoEvent}</div>
        )}
      </div>
    );
  }

  // --- Step 2: Choose phase (direct, pas de liste d'events) ---
  if (comp && !phase) {
    const events = cs2Events ? (cs2Events[comp] || []) : [];
    const bestEvent = events.find((e) => e.status === "running") || events[0] || null;
    const serieName = bestEvent?.title || serie?.title || "";
    const phases = getCS2Phases(comp, serieName);

    return (
      <div style={pageStylePlain}>
        <div style={headerStyle}>{backBtn()}{titleSpan(T[compInfo?.labelKey] || comp, accent)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "20px 16px" }}>
          {phases.map((p) => (
            <button key={p.key} onClick={() => { if (bestEvent && !serie) selectSerie(bestEvent); setPhase(p.key); }} style={{
              background: `linear-gradient(90deg, ${accent}08 0%, #111 50%)`,
              border: `1px solid ${accent}20`,
              borderRadius: 10, padding: "24px 18px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: `0 2px 12px ${accent}08`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: accent }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>{T[p.labelKey] || p.key}</span>
              </div>
              <ChevronRight size={16} color="#444" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Step 1: Choose competition ---
  return (
    <div style={pageStylePlain}>
      <div style={headerStyle}>
        {backBtn(onBack)}
        {titleSpan("Bracket CS2")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "20px 16px" }}>
        {CS2_BRACKET_COMPS.map((c) => {
          const events = cs2Events ? (cs2Events[c.key] || []) : [];
          const hasRunning = events.some((e) => e.status === "running");
          return (
            <button key={c.key} onClick={() => setComp(c.key)} style={{
              background: `linear-gradient(135deg, ${c.color}0A 0%, #111 60%)`,
              border: `1px solid ${c.color}30`,
              borderRadius: 12, padding: "32px 12px", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              boxShadow: `0 4px 20px ${c.color}10`,
              transition: "transform 0.15s",
              position: "relative",
            }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: c.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{T[c.labelKey] || c.key}</span>
              {hasRunning && (
                <span style={{ fontSize: 8, fontWeight: 800, color: "#ff3b3b", border: "1px solid #ff3b3b55", borderRadius: 9999, padding: "1px 6px", textTransform: "uppercase" }}>LIVE</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ValorantTab({ selectedRegions, toggleRegion, selectedStatuses, toggleStatus, predictions, onSeriesChange, toggleExpand, changeScore, T, lang, upcoming, live, results, loading, error, teamLogoCache, isMatchNotifOn, toggleMatchNotif, vlrEvents, showBracketPage, setShowBracketPage, remainingPreds, gamePoints, prefetchedBrackets }) {
  if (showBracketPage) {
    return <BracketPage vlrEvents={vlrEvents} onBack={() => setShowBracketPage(false)} T={T} predictions={predictions} onLiveClick={() => { setShowBracketPage(false); toggleStatus("upcoming"); }} prefetchedBrackets={prefetchedBrackets} />;
  }

  const single = selectedRegions.length === 1 ? REGIONS.find((r) => r.key === selectedRegions[0]) : null;
  const glowAccent = single ? single.accent : "#ffffff";
  const allSelected = selectedRegions.length === REGIONS.length;
  const showFinished = selectedStatuses[0] === "finished";

  const accentFor = (region) => (REGIONS.find((r) => r.key === region) || {}).accent || "#fff";

  // Un match remonté "finished" côté PandaScore mais dont le score par map
  // n'est pas encore résolu (toujours en cours de retentative côté backend,
  // cf. RETRY_DELAYS_MS) reste affiché dans l'onglet "à venir" plutôt que
  // "Terminé", pour ne jamais montrer un score par map à 0-0 alors que le
  // vrai score n'est pas encore arrivé. Le badge affiche quand même "Terminé"
  // (pas "LIVE") puisque match.status vaut déjà "finished" (voir plus haut
  // `const finished = match.status === "finished"`). Fenêtre de 48h après la
  // date du match — même délai que le règlement des pronostics plus bas —
  // passé laquelle on l'affiche quand même dans "Terminé" avec ce qu'on a,
  // plutôt que de le laisser coincé indéfiniment dans "à venir".
  const hasSeriesScore = (m) => m.score1 != null && m.score2 != null && (m.score1 > 0 || m.score2 > 0);
  const resultsReady = results.filter((m) => hasSeriesScore(m));
  const resultsPending = results.filter((m) => !hasSeriesScore(m));

  // dédoublonne par id : un match tout juste terminé peut, le temps d'un
  // poll, apparaître à la fois dans `live` (PandaScore n'a pas encore
  // actualisé /valorant-live) et dans `resultsPending` (déjà remonté par
  // /valorant-results) — on garde la version resultsPending (plus complète).
  function dedupeById(list) {
    const seen = new Map();
    for (const m of list) {
      if (!seen.has(String(m.id))) seen.set(String(m.id), m);
    }
    return [...seen.values()];
  }

  const source = showFinished ? resultsReady : dedupeById([...resultsPending, ...live, ...upcoming]);

  const combined = source
    .filter((m) => m.region && selectedRegions.includes(m.region))
    .map((m) => ({ ...m, _accent: accentFor(m.region) }))
    .sort((a, b) => {
      const ka = (a.day || "") + (a.time || "");
      const kb = (b.day || "") + (b.time || "");
      return showFinished ? kb.localeCompare(ka) : ka.localeCompare(kb);
    });

  let lastDay = null;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-40 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 0%, " + glowAccent + "22, transparent 70%)" }} />
      <div className="relative px-4 pt-4 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.valorantTitle}</h1>
            <p style={{ color: "#888", fontSize: "12px" }}>{T.valorantSubtitle}</p>
          </div>
          {gamePoints > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(204,247,29,0.08)", border: "1px solid rgba(204,247,29,0.15)", borderRadius: 10, padding: "4px 10px" }}>
              <Trophy size={12} color="#CCF71D" />
              <span style={{ color: "#CCF71D", fontSize: 13, fontWeight: 900 }}>{gamePoints}</span>
              <span style={{ color: "#888", fontSize: 9, fontWeight: 700 }}>pts</span>
            </div>
          )}
        </div>
      </div>
      <PredBadge remainingPreds={remainingPreds} T={T} />

      <div className="flex gap-2 px-4 pt-1">
        {["upcoming", "finished"].map((s) => {
          const active = selectedStatuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className="rounded-full"
              style={{ padding: "7px 14px", fontSize: "11px", fontWeight: 700, background: active ? "#fff" : "#161616", color: active ? "#000" : "#888", border: active ? "1px solid transparent" : "1px solid #2a2a2a" }}
            >
              {s === "upcoming" ? T.statusUpcoming : T.calendarDone}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 relative">
        <button
          onClick={() => toggleRegion("ALL")}
          className="shrink-0 rounded-full transition-all"
          style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: allSelected ? "#fff" : "#161616", color: allSelected ? "#000" : "#888", border: allSelected ? "none" : "1px solid #2a2a2a" }}
        >
          {T.regionAll}
        </button>
        {REGIONS.map((r) => {
          const active = selectedRegions.includes(r.key);
          return (
            <button
              key={r.key}
              onClick={() => toggleRegion(r.key)}
              className="shrink-0 rounded-full transition-all"
              style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: active ? r.accent : "#161616", color: active ? "#000" : "#888", border: active ? "1px solid transparent" : "1px solid #2a2a2a" }}
            >
              {regionLabel(r.key, T)}
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-2">
        <button
          onClick={() => setShowBracketPage(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#C4F000", fontSize: 15, fontWeight: 700, padding: 0 }}
        >
          {T.bracketShow}
        </button>
      </div>

      <div className="px-4 pb-6 relative">
        {combined.map((m) => {
          const showDay = m.day !== lastDay;
          lastDay = m.day;
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="pt-3 pb-2" style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {dayLabel(m.day, lang, T)}
                </div>
              )}
              <MatchCard match={m} accent={m._accent} pred={predictions[m.id]} onSeriesChange={onSeriesChange} onToggleExpand={toggleExpand} onScoreChange={changeScore} T={T} lang={lang} teamLogoCache={teamLogoCache} notifActive={isMatchNotifOn(m.id, m.region)} onToggleNotif={toggleMatchNotif} remainingPreds={remainingPreds} />
            </React.Fragment>
          );
        })}
        {combined.length === 0 && (
          <div className="text-center pt-10 pb-4">
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, border: "3px solid #333", borderTopColor: "#C4F000", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ color: "#888", fontSize: "12px", fontWeight: 600 }}>Chargement...</span>
              </div>
            ) : error ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <AlertCircle size={24} color="#ef4444" />
                <p style={{ color: "#ef4444", fontSize: "12px", fontWeight: 700 }}>Connexion impossible</p>
                <p style={{ color: "#666", fontSize: "11px" }}>Réessai auto dans 60s</p>
              </div>
            ) : (
              <p style={{ color: "#888", fontSize: "12px" }}>Aucun match</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Couleur d'accent unique pour les cartes CS2 : contrairement à Valorant, la
// région n'est plus un attribut du MATCH (un match peut opposer deux
// équipes de régions différentes), donc pas de couleur "par région" par
// carte — juste une couleur CS2 fixe, cohérente sur tout l'onglet.
const CS2_ACCENT = "#3B82F6";

function regionAccentCS2(key) {
  return (REGIONS_CS2.find((r) => r.key === key) || {}).accent || CS2_ACCENT;
}

function regionCodeCS2(key) {
  if (key === "EUROPE") return "EU";
  if (key === "AMERICAS") return "AM";
  if (key === "ASIA") return "AS";
  return "";
}

const RL_ACCENT = "#4A90D9";

const REGIONS_RL = [
  { key: "EUROPE", accent: "#4A90D9" },
  { key: "AMERICAS", accent: "#FF5A1F" },
  { key: "OCEANIA", accent: "#1DE9D8" },
];

function regionLabelRL(key, T) {
  if (key === "EUROPE") return T.rlRegionEurope;
  if (key === "AMERICAS") return T.rlRegionAmericas;
  if (key === "OCEANIA") return T.rlRegionOceania;
  return key;
}

function regionAccentRL(key) {
  return (REGIONS_RL.find((r) => r.key === key) || {}).accent || RL_ACCENT;
}

function regionCodeRL(key) {
  if (key === "EUROPE") return "EU";
  if (key === "AMERICAS") return "AM";
  if (key === "OCEANIA") return "OC";
  return "";
}

function Cs2Tab({ selectedRegions, toggleRegion, selectedStatuses, toggleStatus, predictions, onSeriesChange, toggleExpand, changeScore, T, lang, upcoming, live, results, loading, error, teamLogoCache, isMatchNotifOn, toggleMatchNotif, cs2Events, showCs2BracketPage, setShowCs2BracketPage, remainingPreds, gamePoints, prefetchedBrackets }) {
  if (showCs2BracketPage) {
    return <CS2BracketPage cs2Events={cs2Events} onBack={() => setShowCs2BracketPage(false)} T={T} predictions={predictions} onLiveClick={() => { setShowCs2BracketPage(false); toggleStatus("upcoming"); }} prefetchedBrackets={prefetchedBrackets} />;
  }
  const allSelected = selectedRegions.length === REGIONS_CS2.length;
  const showFinished = selectedStatuses[0] === "finished";

  // Même logique de "grâce" que côté Valorant : un match "finished" côté
  // PandaScore mais dont le score par map n'est pas encore résolu
  // (retentative en cours côté backend, cf RETRY_DELAYS_MS dans
  // cs2-history-store.js) reste affiché dans "à venir" plutôt que "Terminé",
  // pour ne jamais montrer un faux 0-0.
  const hasSeriesScore = (m) => m.score1 != null && m.score2 != null && (m.score1 > 0 || m.score2 > 0);
  const hasRealMapScore = (m) => Array.isArray(m.map_scores) && m.map_scores.length > 0;
  const resultsReady = results.filter((m) => hasSeriesScore(m));
  const resultsPending = results.filter((m) => !hasSeriesScore(m));

  function dedupeById(list) {
    const seen = new Map();
    for (const m of list) {
      if (!seen.has(String(m.id))) seen.set(String(m.id), m);
    }
    return [...seen.values()];
  }

  // Filet de sécurité : un match qui a déjà un vrai score par map enregistré
  // (donc déjà dans resultsReady) ne doit plus JAMAIS pouvoir réapparaître
  // dans "à venir" — même si live/upcoming le renvoient par erreur (données
  // PandaScore en retard, requête trop lente coupée en cours de route...).
  // Une fois le score reçu, il reste acquis pour de bon.
  const resolvedIds = new Set(resultsReady.filter(hasRealMapScore).map((m) => String(m.id)));
  const liveSafe = live.filter((m) => !resolvedIds.has(String(m.id)));
  const upcomingSafe = upcoming.filter((m) => !resolvedIds.has(String(m.id)));

  const source = showFinished ? resultsReady : dedupeById([...resultsPending, ...liveSafe, ...upcomingSafe]);

  // Filtre par ÉQUIPE, pas par match : si toutes les régions sont
  // sélectionnées (par défaut), on montre tout, y compris les stages
  // communs / Majors où les deux équipes n'ont pas forcément de région
  // connue. Si une sélection partielle est active, on ne garde que les
  // matchs impliquant au moins une équipe de la/les région(s) choisie(s).
  const combined = source
    .filter((m) => allSelected || (m.team1Region && selectedRegions.includes(m.team1Region)) || (m.team2Region && selectedRegions.includes(m.team2Region)))
    .sort((a, b) => {
      const ka = (a.day || "") + (a.time || "");
      const kb = (b.day || "") + (b.time || "");
      if (showFinished) return kb.localeCompare(ka);
      // Onglet "à venir" : priorité par catégorie d'abord (terminés sans
      // score par map tout en haut, puis live, puis à venir en dessous),
      // le tri par date ne s'applique qu'À L'INTÉRIEUR de chaque catégorie
      // — sinon la date toute seule mélangeait tout et cassait l'ordre.
      function categoryRank(m) {
        if (m.status === "finished") return 0; // terminé, en attente de son score par map
        if (m.status === "running") return 1; // live
        return 2; // à venir
      }
      const ra = categoryRank(a);
      const rb = categoryRank(b);
      if (ra !== rb) return ra - rb;
      // Terminés récemment en attente : le plus récent d'abord. Live/à
      // venir : le plus proche d'abord.
      return ra === 0 ? kb.localeCompare(ka) : ka.localeCompare(kb);
    });

  let lastDay = null;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-40 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 0%, " + CS2_ACCENT + "22, transparent 70%)" }} />
      <div className="relative px-4 pt-4 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.cs2Title}</h1>
            <p style={{ color: "#888", fontSize: "12px" }}>{T.cs2Subtitle}</p>
          </div>
          {gamePoints > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 10, padding: "4px 10px" }}>
              <Trophy size={12} color="#3B82F6" />
              <span style={{ color: "#3B82F6", fontSize: 13, fontWeight: 900 }}>{gamePoints}</span>
              <span style={{ color: "#888", fontSize: 9, fontWeight: 700 }}>pts</span>
            </div>
          )}
        </div>
      </div>
      <PredBadge remainingPreds={remainingPreds} T={T} />

      <div className="flex gap-2 px-4 pt-1">
        {["upcoming", "finished"].map((s) => {
          const active = selectedStatuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className="rounded-full"
              style={{ padding: "7px 14px", fontSize: "11px", fontWeight: 700, background: active ? "#fff" : "#161616", color: active ? "#000" : "#888", border: active ? "1px solid transparent" : "1px solid #2a2a2a" }}
            >
              {s === "upcoming" ? T.statusUpcoming : T.calendarDone}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 relative">
        <button
          onClick={() => toggleRegion("ALL")}
          className="shrink-0 rounded-full transition-all"
          style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: allSelected ? "#fff" : "#161616", color: allSelected ? "#000" : "#888", border: allSelected ? "none" : "1px solid #2a2a2a" }}
        >
          {T.regionAll}
        </button>
        {REGIONS_CS2.map((r) => {
          const active = selectedRegions.includes(r.key);
          return (
            <button
              key={r.key}
              onClick={() => toggleRegion(r.key)}
              className="shrink-0 rounded-full transition-all"
              style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: active ? r.accent : "#161616", color: active ? "#000" : "#888", border: active ? "1px solid transparent" : "1px solid #2a2a2a" }}
            >
              {regionLabelCS2(r.key, T)}
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-2">
        <button
          onClick={() => setShowCs2BracketPage(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#FFD700", fontSize: 15, fontWeight: 700, padding: 0 }}
        >
          {T.cs2BracketShow}
        </button>
      </div>

      <div className="px-4 pb-6 relative">
        {combined.map((m) => {
          const showDay = m.day !== lastDay;
          lastDay = m.day;
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="pt-3 pb-2" style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {dayLabel(m.day, lang, T)}
                </div>
              )}
              <MatchCard
                match={m}
                accent={CS2_ACCENT}
                pred={predictions[m.id]}
                onSeriesChange={onSeriesChange}
                onToggleExpand={toggleExpand}
                onScoreChange={changeScore}
                T={T}
                lang={lang}
                teamLogoCache={teamLogoCache}
                streamUrl={m.streamUrl}
                useRegionStreamFallback={false}
                team1RegionColor={m.team1Region ? regionAccentCS2(m.team1Region) : null}
                team2RegionColor={m.team2Region ? regionAccentCS2(m.team2Region) : null}
                team1RegionCode={m.team1Region ? regionCodeCS2(m.team1Region) : null}
                team2RegionCode={m.team2Region ? regionCodeCS2(m.team2Region) : null}
                notifActive={isMatchNotifOn(m.id, m.region)}
                onToggleNotif={toggleMatchNotif}
                remainingPreds={remainingPreds}
              />
            </React.Fragment>
          );
        })}
        {combined.length === 0 && (
          <div className="text-center pt-10 pb-4">
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, border: "3px solid #333", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ color: "#888", fontSize: "12px", fontWeight: 600 }}>Chargement...</span>
              </div>
            ) : error ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <AlertCircle size={24} color="#ef4444" />
                <p style={{ color: "#ef4444", fontSize: "12px", fontWeight: 700 }}>Connexion impossible</p>
                <p style={{ color: "#666", fontSize: "11px" }}>Réessai auto dans 60s</p>
              </div>
            ) : (
              <p style={{ color: "#888", fontSize: "12px" }}>Aucun match</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RlTab({ selectedRegions, toggleRegion, selectedStatuses, toggleStatus, T, lang, upcoming, live, results, loading, error, isMatchNotifOn, toggleMatchNotif, toggleExpand, teamLogoCache, predictions, onSeriesChange, changeScore, remainingPreds, gamePoints }) {
  const allSelected = selectedRegions.length === REGIONS_RL.length;
  const showFinished = selectedStatuses[0] === "finished";

  const source = showFinished ? results : [...live, ...upcoming];

  const combined = source
    .filter((m) => allSelected || (m.team1Region && selectedRegions.includes(m.team1Region)) || (m.team2Region && selectedRegions.includes(m.team2Region)))
    .sort((a, b) => {
      const ka = (a.day || "") + (a.time || "");
      const kb = (b.day || "") + (b.time || "");
      if (showFinished) return kb.localeCompare(ka);
      function categoryRank(m) {
        if (m.status === "running") return 0;
        return 1;
      }
      const ra = categoryRank(a);
      const rb = categoryRank(b);
      if (ra !== rb) return ra - rb;
      return ka.localeCompare(kb);
    });

  let lastDay = null;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-40 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 0%, " + RL_ACCENT + "22, transparent 70%)" }} />
      <div className="relative px-4 pt-4 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.rlTitle}</h1>
            <p style={{ color: "#888", fontSize: "12px" }}>{T.rlSubtitle}</p>
          </div>
          {gamePoints > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(74,144,217,0.08)", border: "1px solid rgba(74,144,217,0.15)", borderRadius: 10, padding: "4px 10px" }}>
              <Trophy size={12} color="#4A90D9" />
              <span style={{ color: "#4A90D9", fontSize: 13, fontWeight: 900 }}>{gamePoints}</span>
              <span style={{ color: "#888", fontSize: 9, fontWeight: 700 }}>pts</span>
            </div>
          )}
        </div>
      </div>
      <PredBadge remainingPreds={remainingPreds} T={T} />

      <div className="flex gap-2 px-4 pt-1">
        {["upcoming", "finished"].map((s) => {
          const active = selectedStatuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className="rounded-full"
              style={{ padding: "7px 14px", fontSize: "11px", fontWeight: 700, background: active ? "#fff" : "#161616", color: active ? "#000" : "#888", border: active ? "1px solid transparent" : "1px solid #2a2a2a" }}
            >
              {s === "upcoming" ? T.statusUpcoming : T.calendarDone}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 relative">
        <button
          onClick={() => toggleRegion("ALL")}
          className="shrink-0 rounded-full transition-all"
          style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: allSelected ? "#fff" : "#161616", color: allSelected ? "#000" : "#888", border: allSelected ? "none" : "1px solid #2a2a2a" }}
        >
          {T.regionAll}
        </button>
        {REGIONS_RL.map((r) => {
          const active = selectedRegions.includes(r.key);
          return (
            <button
              key={r.key}
              onClick={() => toggleRegion(r.key)}
              className="shrink-0 rounded-full transition-all"
              style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: active ? r.accent : "#161616", color: active ? "#000" : "#888", border: active ? "1px solid transparent" : "1px solid #2a2a2a" }}
            >
              {regionLabelRL(r.key, T)}
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-6 relative">
        {combined.map((m) => {
          const showDay = m.day !== lastDay;
          lastDay = m.day;
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="pt-3 pb-2" style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {dayLabel(m.day, lang, T)}
                </div>
              )}
              <MatchCard
                match={m}
                accent={RL_ACCENT}
                pred={predictions[m.id]}
                onSeriesChange={onSeriesChange}
                onToggleExpand={toggleExpand}
                onScoreChange={changeScore}
                T={T}
                lang={lang}
                teamLogoCache={teamLogoCache}
                streamUrl={m.streamUrl}
                useRegionStreamFallback={false}
                team1RegionColor={m.team1Region ? regionAccentRL(m.team1Region) : null}
                team2RegionColor={m.team2Region ? regionAccentRL(m.team2Region) : null}
                team1RegionCode={m.team1Region ? regionCodeRL(m.team1Region) : null}
                team2RegionCode={m.team2Region ? regionCodeRL(m.team2Region) : null}
                notifActive={isMatchNotifOn(m.id, m.team1Region || m.team2Region)}
                onToggleNotif={toggleMatchNotif}
                remainingPreds={remainingPreds}
              />
            </React.Fragment>
          );
        })}
        {combined.length === 0 && (
          <div className="text-center pt-10 pb-4">
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, border: "3px solid #333", borderTopColor: "#4A90D9", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ color: "#888", fontSize: "12px", fontWeight: 600 }}>Chargement...</span>
              </div>
            ) : error ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <AlertCircle size={24} color="#ef4444" />
                <p style={{ color: "#ef4444", fontSize: "12px", fontWeight: 700 }}>Connexion impossible</p>
                <p style={{ color: "#666", fontSize: "11px" }}>Réessai auto dans 60s</p>
              </div>
            ) : (
              <p style={{ color: "#888", fontSize: "12px" }}>Aucun match</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderTab({ label, img, T }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 text-center" style={{ minHeight: "560px" }}>
      <div className="rounded-full flex items-center justify-center mb-4" style={{ width: "72px", height: "72px", background: "#111" }}>
        <img src={img} alt={label} style={{ width: "34px", height: "34px", objectFit: "contain" }} />
      </div>
      <h2 className="font-black" style={{ color: "#111", fontSize: "20px" }}>{label}</h2>
      <p style={{ color: "#555", fontSize: "13px" }} className="mt-2">{T.placeholderSoon.replace("{label}", label)}</p>
    </div>
  );
}

function getScoreForCats(cats, pointsPerGame, userPoints) {
  if (cats.includes("tout")) return userPoints;
  let total = 0;
  if (cats.includes("valo")) total += pointsPerGame.valo || 0;
  if (cats.includes("cs2")) total += pointsPerGame.cs2 || 0;
  if (cats.includes("rl")) total += pointsPerGame.rl || 0;
  return total;
}

const SCORE_CAT_KEYS = {
  tout: "scoreTout", valo: "scoreValo", cs2: "scoreCs2", rl: "scoreRl",
};

function validateBio(text) {
  if (BIO_LINK_RE.test(text)) return false;
  const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return !BIO_BLOCKED_WORDS.some((w) => lower.includes(w));
}

function resizeImage(file, maxSize, cb) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function TeamSearchSelect({ value, onChange, teams, label, T }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = teams.filter((t) => t.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <label style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      <button onClick={() => setOpen(!open)} className="mt-1 w-full flex items-center justify-between" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: value ? "#fff" : "#666", fontSize: "13px", borderRadius: "12px", padding: "10px 14px" }}>
        <span className="truncate">{value || "—"}</span>
        <ChevronDown size={14} color="#666" />
      </button>
      {open && (
        <div className="mt-1 rounded-xl overflow-hidden" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #2a2a2a" }}>
            <Search size={14} color="#666" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." autoFocus style={{ background: "transparent", border: "none", color: "#fff", fontSize: "12px", outline: "none", flex: 1 }} />
          </div>
          <div className="dark-scroll" style={{ maxHeight: "140px", overflowY: "auto" }}>
            <button onClick={() => { onChange(""); setOpen(false); setSearch(""); }} className="w-full text-left px-3 py-2" style={{ color: "#666", fontSize: "12px" }}>—</button>
            {filtered.map((t) => (
              <button key={t} onClick={() => { onChange(t); setOpen(false); setSearch(""); }} className="w-full text-left px-3 py-2" style={{ color: t === value ? "#CCF71D" : "#ccc", fontSize: "12px", background: t === value ? "#222" : "transparent" }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSetupModal({ onClose, onSave, profile, valoTeams, cs2Teams, rlTeams, T }) {
  const [pseudo, setPseudo] = useState(profile?.pseudo || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatar, setAvatar] = useState(profile?.avatar || null);
  const [favValo, setFavValo] = useState(profile?.favTeams?.valo || "");
  const [favCs2, setFavCs2] = useState(profile?.favTeams?.cs2 || "");
  const [favRl, setFavRl] = useState(profile?.favTeams?.rl || "");
  const [pseudoColor, setPseudoColor] = useState(profile?.pseudoColor || "#ffffff");
  const [bioError, setBioError] = useState(false);
  const fileRef = useRef(null);

  const PSEUDO_COLORS = [
    "#ffffff","#CCF71D","#FF4655","#3B82F6","#F59E0B","#A855F7","#EC4899",
    "#10B981","#EF4444","#06B6D4","#F97316","#8B5CF6","#14B8A6",
    "#E11D48","#FBBF24","#22D3EE","#F472B6","#84CC16",
  ];

  const bioOk = bio.trim() === "" || validateBio(bio);
  const canSave = pseudo.trim().length >= 2 && bioOk;

  function handleBioChange(e) {
    const v = e.target.value;
    setBio(v);
    setBioError(v.trim() !== "" && !validateBio(v));
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeImage(file, 128, (dataUrl) => setAvatar(dataUrl));
  }

  function handleSave() {
    if (!canSave) return;
    onSave({ pseudo: pseudo.trim(), bio: bio.trim(), avatar, favTeams: { valo: favValo, cs2: favCs2, rl: favRl }, pseudoColor });
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl flex flex-col" style={{ background: "#111", maxHeight: "88%", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ flexShrink: 0 }}>
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.profileTitle}</h2>
          <button onClick={onClose} className="rounded-full p-1" style={{ background: "#222" }}>
            <X size={18} color="#888" />
          </button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-6 flex flex-col gap-4" style={{ flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          <div className="flex flex-col items-center">
            <label style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "flex-start" }}>{T.profileAvatar}</label>
            <button onClick={() => fileRef.current?.click()} className="mt-2 rounded-full flex items-center justify-center overflow-hidden" style={{ width: 80, height: 80, background: "#1e1e1e", border: "2px solid #2a2a2a" }}>
              {avatar ? (
                <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Camera size={28} color="#555" />
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
          </div>
          <div>
            <label style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{T.profilePseudo}</label>
            <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} placeholder="ex: SplitKing" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#fff", fontSize: "13px", borderRadius: "12px", padding: "10px 14px", width: "100%", outline: "none" }} className="mt-1" />
          </div>
          <div>
            <label style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Couleur du pseudo</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {PSEUDO_COLORS.map(c => (
                <button key={c} onClick={() => setPseudoColor(c)} style={{
                  width: 28, height: 28, borderRadius: "50%", background: c, border: pseudoColor === c ? "3px solid #fff" : "2px solid #333",
                  cursor: "pointer", boxShadow: pseudoColor === c ? `0 0 10px ${c}66` : "none", transition: "all 0.15s",
                }} />
              ))}
            </div>
            <p style={{ color: pseudoColor, fontSize: 13, fontWeight: 800, marginTop: 6 }}>{pseudo || "Pseudo"}</p>
          </div>
          <div>
            <label style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{T.profileBio}</label>
            <textarea value={bio} onChange={handleBioChange} maxLength={80} rows={2} placeholder="..." style={{ background: "#1e1e1e", border: bioError ? "1px solid #e74c3c" : "1px solid #2a2a2a", color: "#fff", fontSize: "13px", borderRadius: "12px", padding: "10px 14px", width: "100%", outline: "none", resize: "none" }} className="mt-1" />
            {bioError && <p style={{ color: "#e74c3c", fontSize: "10px", marginTop: "4px" }}>{T.bioError || "Pas de liens, insultes ou gros mots."}</p>}
          </div>
          <TeamSearchSelect value={favValo} onChange={setFavValo} teams={valoTeams} label={T.profileFavValo} T={T} />
          <TeamSearchSelect value={favCs2} onChange={setFavCs2} teams={cs2Teams} label={T.profileFavCs2} T={T} />
          <TeamSearchSelect value={favRl} onChange={setFavRl} teams={rlTeams} label={T.profileFavRl} T={T} />
          <button onClick={handleSave} disabled={!canSave} className="rounded-xl font-bold w-full py-3 mt-2" style={{ background: canSave ? "#CCF71D" : "#333", color: canSave ? "#000" : "#666", fontSize: "14px" }}>
            {T.profileSave}
          </button>
        </div>
      </div>
    </div>
  );
}

function FriendModal({ onClose, T, profile, userPoints, initialTab }) {
  const [tab, setTab] = useState(initialTab || "search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [followingSet, setFollowingSet] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchTimer = useRef(null);

  const userId = profile?.userId;

  useEffect(() => {
    if (userId) loadSocial();
  }, [userId]);

  async function loadSocial() {
    if (!userId) return;
    try {
      const [fing, fers] = await Promise.all([
        fetch(API_BASE + "/api/social/following/" + userId).then(r => r.json()),
        fetch(API_BASE + "/api/social/followers/" + userId).then(r => r.json()),
      ]);
      setFollowing(fing);
      setFollowers(fers);
      setFollowingSet(new Set(fing.map(u => u.id)));
    } catch {}
  }

  function handleSearch(val) {
    setQuery(val);
    setSearched(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(API_BASE + "/api/social/search?q=" + encodeURIComponent(val.trim()) + "&userId=" + (userId || ""));
        const data = await r.json();
        setResults(data);
      } catch { setResults([]); }
      setLoading(false);
      setSearched(true);
    }, 400);
  }

  async function handleFollow(targetId) {
    if (!userId) return;
    setFollowingSet(s => new Set([...s, targetId]));
    try {
      await fetch(API_BASE + "/api/social/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followerId: userId, followedId: targetId }) });
      loadSocial();
    } catch {}
  }

  async function handleUnfollow(targetId) {
    if (!userId) return;
    setFollowingSet(s => { const n = new Set(s); n.delete(targetId); return n; });
    try {
      await fetch(API_BASE + "/api/social/unfollow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followerId: userId, followedId: targetId }) });
      loadSocial();
    } catch {}
  }

  const tabStyle = (active) => ({ padding: "8px 0", fontSize: "12px", fontWeight: 700, color: active ? "#fff" : "#666", borderBottom: active ? "2px solid #CCF71D" : "2px solid transparent", flex: 1, textAlign: "center", background: "none" });

  function UserRow({ user }) {
    const iFollow = followingSet.has(user.id);
    return (
      <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid #262626" }}>
        <div className="rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ width: 36, height: 36, background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
          {user.avatar ? <img src={user.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={16} color="#555" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate" style={{ fontSize: "13px" }}>{user.pseudo}</p>
          <p style={{ color: "#666", fontSize: "11px" }}>{user.points || 0} pts</p>
        </div>
        {user.id !== userId && (
          iFollow ? (
            <button onClick={() => handleUnfollow(user.id)} className="rounded-lg px-3 py-1.5 font-bold" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888", fontSize: "11px" }}>{T.friendUnfollow}</button>
          ) : (
            <button onClick={() => handleFollow(user.id)} className="rounded-lg px-3 py-1.5 font-bold" style={{ background: "#CCF71D", color: "#000", fontSize: "11px" }}>{T.friendFollow}</button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#111", maxHeight: "80%", minHeight: "50%" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.profileAddFriend || "Social"}</h2>
          <button onClick={onClose} className="rounded-full p-1" style={{ background: "#222" }}>
            <X size={18} color="#888" />
          </button>
        </div>
        <div className="flex px-5" style={{ borderBottom: "1px solid #1e1e1e" }}>
          {(!initialTab || initialTab === "search") ? (
            <button onClick={() => setTab("search")} style={{ ...tabStyle(true), flex: 1 }}>{T.friendTabSearch}</button>
          ) : (
            <>
              <button onClick={() => setTab("followers")} style={tabStyle(tab === "followers")}>{T.friendTabFollowers} ({followers.length})</button>
              <button onClick={() => setTab("following")} style={tabStyle(tab === "following")}>{T.friendTabFollowing} ({following.length})</button>
            </>
          )}
        </div>
        <div className="px-5 py-4 flex-1 overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {tab === "search" && (
            <div>
              <div className="flex items-center gap-2 rounded-xl px-3 mb-3" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                <Search size={14} color="#666" />
                <input value={query} onChange={(e) => handleSearch(e.target.value)} placeholder={T.friendSearchPlaceholder} style={{ background: "transparent", border: "none", color: "#fff", fontSize: "13px", outline: "none", flex: 1, padding: "10px 0" }} />
              </div>
              {loading && <p style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "12px 0" }}>...</p>}
              {!loading && searched && results.length === 0 && <p style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "12px 0" }}>{T.friendNoResults}</p>}
              {results.map(u => <UserRow key={u.id} user={u} />)}
            </div>
          )}
          {tab === "following" && (
            <div>
              {following.length === 0 && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>{T.friendEmpty}</p>}
              {following.map(u => <UserRow key={u.id} user={u} />)}
            </div>
          )}
          {tab === "followers" && (
            <div>
              {followers.length === 0 && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>{T.friendEmpty}</p>}
              {followers.map(u => <UserRow key={u.id} user={u} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatePostScreen({ onClose, T, profile, prefillText }) {
  const [content, setContent] = useState(prefillText || "");
  const [matchData, setMatchData] = useState(null);
  const [posting, setPosting] = useState(false);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("write");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const photoRef = useRef(null);

  useEffect(() => {
    if (!profile?.userId) return;
    fetch(API_BASE + "/api/posts/user/" + profile.userId).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setHistory(d);
    }).catch(() => {});
  }, [profile?.userId]);

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    if (file.size > 5 * 1024 * 1024) { setPhotoError("Image trop lourde (max 5 Mo)"); return; }
    if (!file.type.startsWith("image/")) { setPhotoError("Format non supporté"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        setPhotoPreview(dataUrl);
        setPhotoFile(file);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function handlePost() {
    if (!profile?.userId || (!content.trim() && !matchData && !photoPreview)) return;
    setPosting(true);
    const postData = { userId: profile.userId, type: photoPreview ? "photo" : matchData ? "result" : "text", content: content.trim(), matchData };
    if (photoPreview) postData.image = photoPreview;
    fetch(API_BASE + "/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postData),
    }).then(r => r.json()).then(() => {
      setContent("");
      setMatchData(null);
      setPhotoPreview(null);
      setPhotoFile(null);
      setTab("history");
      fetch(API_BASE + "/api/posts/user/" + profile.userId).then(r => r.json()).then(d => {
        if (Array.isArray(d)) setHistory(d);
      });
    }).catch(() => {}).finally(() => setPosting(false));
  }

  const canPost = content.trim() || matchData || photoPreview;

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #262626" }}>
        <button onClick={onClose} className="rounded-full p-1.5" style={{ background: "#181818" }}>
          <ArrowLeft size={18} color="#ccc" />
        </button>
        <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.createPost || "Créer un post"}</h2>
        <div style={{ width: 34 }} />
      </div>

      <div className="flex gap-0" style={{ borderBottom: "1px solid #262626" }}>
        <button onClick={() => setTab("write")} className="flex-1 py-2.5 text-center" style={{ fontSize: "12px", fontWeight: 700, color: tab === "write" ? "#CCF71D" : "#666", borderBottom: tab === "write" ? "2px solid #CCF71D" : "2px solid transparent" }}>{T.postWrite || "Écrire"}</button>
        <button onClick={() => setTab("history")} className="flex-1 py-2.5 text-center" style={{ fontSize: "12px", fontWeight: 700, color: tab === "history" ? "#CCF71D" : "#666", borderBottom: tab === "history" ? "2px solid #CCF71D" : "2px solid transparent" }}>{T.postHistory || "Historique"}</button>
      </div>

      {tab === "write" && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="rounded-full overflow-hidden shrink-0" style={{ width: 40, height: 40, background: "#1e1e1e" }}>
              {profile?.avatar ? <img src={profile.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={18} color="#555" style={{ margin: "11px" }} />}
            </div>
            <div className="flex-1">
              <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{profile?.pseudo || "Toi"}</span>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value.slice(0, 500))}
                placeholder={T.postPlaceholder || "Partagez vos résultats, analyses..."}
                className="w-full resize-none mt-1"
                style={{ background: "transparent", border: "none", color: "#ddd", fontSize: "14px", minHeight: "80px", outline: "none", lineHeight: 1.5 }}
              />
            </div>
          </div>

          {photoPreview && (
            <div style={{ position: "relative", marginBottom: 12, borderRadius: 12, overflow: "hidden" }}>
              <img src={photoPreview} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 12 }} />
              <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); }} className="absolute" style={{ top: 8, right: 8, background: "rgba(0,0,0,0.7)", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}>
                <X size={14} color="#fff" />
              </button>
            </div>
          )}

          {photoError && <p style={{ color: "#e05252", fontSize: "11px", marginBottom: 8 }}>{photoError}</p>}

          <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 12, marginBottom: 12 }}>
            <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: "none" }} />
            <button onClick={() => photoRef.current?.click()} className="flex items-center gap-2" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CCF71D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{ color: "#CCF71D", fontSize: "12px", fontWeight: 700 }}>Photo</span>
            </button>
            <p style={{ color: "#444", fontSize: "9px", marginTop: 4 }}>Max 5 Mo · Pas de contenu publicitaire ou inapproprié</p>
          </div>

          <p style={{ color: "#555", fontSize: "10px", textAlign: "right" }}>{content.length}/500</p>

          <button
            onClick={handlePost}
            disabled={posting || !canPost}
            className="w-full rounded-xl py-3 mt-3 font-bold"
            style={{ background: canPost ? "#CCF71D" : "#222", color: canPost ? "#000" : "#555", fontSize: "14px", transition: "all 0.2s" }}
          >
            {posting ? "..." : (T.postPublish || "Publier")}
          </button>
        </div>
      )}

      {tab === "history" && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {history.length === 0 && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>{T.postEmpty || "Aucun post"}</p>}
          {history.map(p => (
            <div key={p.id} className="rounded-xl p-3 mb-3" style={{ background: "#141414", border: "1px solid #262626" }}>
              {p.image && <img src={p.image} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 8, maxHeight: 250, objectFit: "cover" }} />}
              <p style={{ color: "#fff", fontSize: "13px", lineHeight: 1.5 }}>{p.content}</p>
              {p.match_data && (
                <div className="mt-2 rounded-lg px-3 py-2" style={{ background: "#0d0d0d", border: "1px solid #222" }}>
                  <span style={{ color: "#888", fontSize: "11px" }}>{p.match_data.team1} vs {p.match_data.team2} — {p.match_data.score}</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span style={{ color: "#444", fontSize: "10px" }}>{new Date(p.created_at).toLocaleDateString()}</span>
                <span style={{ color: "#666", fontSize: "10px" }}>{p.likes || 0} likes</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostsFeedScreen({ onClose, T, profile }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API_BASE + "/api/posts/feed?limit=50&userId=" + (profile?.userId || "")).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setPosts(d);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function toggleLike(post) {
    if (!profile?.userId) return;
    const action = post.liked ? "unlike" : "like";
    fetch(API_BASE + `/api/posts/${post.id}/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile.userId }),
    }).then(() => {
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p));
    });
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #262626" }}>
        <button onClick={onClose} className="rounded-full p-1.5" style={{ background: "#181818" }}>
          <ArrowLeft size={18} color="#ccc" />
        </button>
        <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.postFeed || "Fil d'actualité"}</h2>
        <div style={{ width: 34 }} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>...</p>}
        {!loading && posts.length === 0 && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>{T.postEmpty || "Aucun post"}</p>}
        {posts.map(p => (
          <div key={p.id} className="rounded-xl p-3 mb-3" style={{ background: "#141414", border: "1px solid #262626" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-full overflow-hidden" style={{ width: 28, height: 28, background: "#1e1e1e" }}>
                {p.avatar ? <img src={p.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={14} color="#555" />}
              </div>
              <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700 }}>{p.pseudo || "?"}</span>
              <span style={{ color: "#444", fontSize: "10px", marginLeft: "auto" }}>{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
            {p.content && <p style={{ color: "#ddd", fontSize: "13px", lineHeight: 1.5 }}>{p.content}</p>}
            {p.match_data && (
              <div className="mt-2 rounded-lg px-3 py-2" style={{ background: "#0d0d0d", border: "1px solid #222" }}>
                <span style={{ color: "#888", fontSize: "11px" }}>{p.match_data.team1} vs {p.match_data.team2} — {p.match_data.score}</span>
              </div>
            )}
            <div className="flex items-center gap-4 mt-2">
              <button onClick={() => toggleLike(p)} className="flex items-center gap-1">
                <span style={{ color: p.liked ? "#CCF71D" : "#555", fontSize: "18px" }}>{p.liked ? "♥" : "♡"}</span>
                <span style={{ color: "#666", fontSize: "11px" }}>{p.likes || 0}</span>
              </button>
              <button onClick={() => { if (navigator.share) navigator.share({ title: "Split", text: p.content || "", url: window.location.href }); }}>
                <Share2 size={14} color="#555" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceMessage({ src }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  return (
    <button onClick={() => {
      if (!audioRef.current) { audioRef.current = new Audio(src); audioRef.current.onended = () => setPlaying(false); }
      if (playing) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false); }
      else { audioRef.current.play(); setPlaying(true); }
    }} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "rgba(204,247,29,0.1)", border: "1px solid rgba(204,247,29,0.2)" }}>
      {playing ? <Square size={12} color="#CCF71D" /> : <Play size={12} color="#CCF71D" />}
      <span style={{ color: "#CCF71D", fontSize: "11px", fontWeight: 700 }}>{playing ? "Stop" : "Vocal"}</span>
    </button>
  );
}

function MessagesScreen({ onClose, T, profile }) {
  const [tab, setTab] = useState("community");
  const [conversations, setConversations] = useState([]);
  const [communityMessages, setCommunityMessages] = useState([]);
  const [activeDm, setActiveDm] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [cryptoKeys, setCryptoKeys] = useState(null);
  const communityPollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    initCrypto();
    loadConversations();
    loadCommunity();
    return () => { if (communityPollRef.current) clearInterval(communityPollRef.current); };
  }, []);

  useEffect(() => {
    if (tab === "community") {
      communityPollRef.current = setInterval(pollCommunity, 5000);
      return () => clearInterval(communityPollRef.current);
    }
  }, [tab, communityMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [communityMessages, dmMessages]);

  async function initCrypto() {
    if (!profile?.userId) return;
    const stored = localStorage.getItem("split_crypto_keys_" + profile.userId);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const privKey = await crypto.subtle.importKey("jwk", parsed.privateKey, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
        const pubKey = await crypto.subtle.importKey("jwk", parsed.publicKey, { name: "ECDH", namedCurve: "P-256" }, true, []);
        setCryptoKeys({ privateKey: privKey, publicKey: pubKey, publicKeyJwk: parsed.publicKey });
        await fetch(API_BASE + "/api/messages/keys", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: profile.userId, publicKey: JSON.stringify(parsed.publicKey) }),
        });
        return;
      } catch(e) { /* regenerate */ }
    }
    const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
    const pubJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    localStorage.setItem("split_crypto_keys_" + profile.userId, JSON.stringify({ publicKey: pubJwk, privateKey: privJwk }));
    setCryptoKeys({ privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, publicKeyJwk: pubJwk });
    await fetch(API_BASE + "/api/messages/keys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile.userId, publicKey: JSON.stringify(pubJwk) }),
    });
  }

  async function deriveSharedKey(theirPublicKeyJwk) {
    if (!cryptoKeys) return null;
    const theirKey = await crypto.subtle.importKey("jwk", theirPublicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return crypto.subtle.deriveKey({ name: "ECDH", public: theirKey }, cryptoKeys.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function encryptMessage(text, sharedKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, encoded);
    return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))), iv: btoa(String.fromCharCode(...iv)) };
  }

  async function decryptMessage(ciphertextB64, ivB64, sharedKey) {
    try {
      const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, ciphertext);
      return new TextDecoder().decode(decrypted);
    } catch { return "[Message chiffré]"; }
  }

  function loadConversations() {
    if (!profile?.userId) return;
    fetch(API_BASE + "/api/messages/conversations/" + profile.userId).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setConversations(d);
    }).catch(() => {});
  }

  function loadCommunity() {
    fetch(API_BASE + "/api/messages/community?limit=100").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setCommunityMessages(d.reverse());
    }).catch(() => {});
  }

  function pollCommunity() {
    const lastId = communityMessages.length > 0 ? communityMessages[communityMessages.length - 1].id : 0;
    fetch(API_BASE + "/api/messages/community/poll?after=" + lastId).then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) setCommunityMessages(prev => [...prev, ...d]);
    }).catch(() => {});
  }

  async function openDm(partner) {
    setActiveDm(partner);
    setTab("dm");
    if (!profile?.userId) return;
    const msgs = await fetch(API_BASE + "/api/messages/dm/" + profile.userId + "/" + partner.partnerId).then(r => r.json());
    if (!Array.isArray(msgs)) { setDmMessages([]); return; }
    const keyResp = await fetch(API_BASE + "/api/messages/keys/" + partner.partnerId).then(r => r.json()).catch(() => null);
    if (!keyResp?.publicKey || !cryptoKeys) { setDmMessages(msgs.reverse().map(m => ({ ...m, text: "[Clé manquante]" }))); return; }
    const theirKeyJwk = JSON.parse(keyResp.publicKey);
    const sharedKey = await deriveSharedKey(theirKeyJwk);
    const decrypted = await Promise.all(msgs.reverse().map(async m => {
      const isMe = m.sender_id === profile.userId;
      const text = await decryptMessage(isMe ? m.sender_copy : m.ciphertext, isMe ? m.sender_iv : m.iv, sharedKey);
      return { ...m, text, isMe };
    }));
    setDmMessages(decrypted);
  }

  async function sendDm() {
    if (!input.trim() || !activeDm || !profile?.userId || !cryptoKeys) return;
    setSending(true);
    try {
      const keyResp = await fetch(API_BASE + "/api/messages/keys/" + activeDm.partnerId).then(r => r.json());
      if (!keyResp?.publicKey) { setSending(false); return; }
      const theirKeyJwk = JSON.parse(keyResp.publicKey);
      const sharedKey = await deriveSharedKey(theirKeyJwk);
      const { ciphertext, iv } = await encryptMessage(input.trim(), sharedKey);
      const { ciphertext: senderCopy, iv: senderIv } = await encryptMessage(input.trim(), sharedKey);
      await fetch(API_BASE + "/api/messages/dm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: profile.userId, receiverId: activeDm.partnerId, ciphertext, iv, senderCopy, senderIv }),
      });
      setDmMessages(prev => [...prev, { text: input.trim(), isMe: true, created_at: new Date().toISOString() }]);
      setInput("");
    } catch {} finally { setSending(false); }
  }

  function deleteMsg(msgId, type) {
    const url = type === "dm" ? API_BASE + "/api/messages/dm/" + msgId : API_BASE + "/api/messages/community/" + msgId;
    fetch(url, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile.userId }),
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        if (type === "dm") setDmMessages(prev => prev.filter(m => m.id !== msgId));
        else setCommunityMessages(prev => prev.filter(m => m.id !== msgId));
      }
    }).catch(() => {});
    setDeletingId(null);
  }

  function sendCommunity() {
    if (!input.trim() || !profile?.userId) return;
    setSending(true);
    fetch(API_BASE + "/api/messages/community", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile.userId, content: input.trim() }),
    }).then(r => r.json()).then(d => {
      if (d.id) setCommunityMessages(prev => [...prev, { id: d.id, user_id: profile.userId, pseudo: profile.pseudo, avatar: profile.avatar, content: input.trim(), created_at: new Date().toISOString() }]);
      setInput("");
    }).catch(() => {}).finally(() => setSending(false));
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #262626" }}>
        <button onClick={activeDm ? () => { setActiveDm(null); setTab("dms"); } : onClose} className="rounded-full p-1.5" style={{ background: "#181818" }}>
          <ArrowLeft size={18} color="#ccc" />
        </button>
        <h2 className="font-black text-white" style={{ fontSize: "18px" }}>
          {activeDm ? activeDm.pseudo : (T.messagesTitle || "Discussion")}
        </h2>
        {activeDm && (
          <div className="flex items-center gap-1">
            <Shield size={12} color="#22c55e" />
            <span style={{ color: "#22c55e", fontSize: "9px", fontWeight: 700 }}>E2E</span>
          </div>
        )}
        {!activeDm && <div style={{ width: 34 }} />}
      </div>

      {!activeDm && (
        <div className="flex gap-0 shrink-0" style={{ borderBottom: "1px solid #262626" }}>
          <button onClick={() => setTab("community")} className="flex-1 py-2.5 text-center" style={{ fontSize: "12px", fontWeight: 700, color: tab === "community" ? "#CCF71D" : "#666", borderBottom: tab === "community" ? "2px solid #CCF71D" : "2px solid transparent" }}>{T.msgCommunity || "Communauté"}</button>
          <button onClick={() => setTab("dms")} className="flex-1 py-2.5 text-center" style={{ fontSize: "12px", fontWeight: 700, color: tab === "dms" ? "#CCF71D" : "#666", borderBottom: tab === "dms" ? "2px solid #CCF71D" : "2px solid transparent" }}>{T.msgDms || "Messages"}</button>
        </div>
      )}

      {tab === "community" && !activeDm && (
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col justify-end" style={{ minHeight: 0 }}>
          <div>
            {communityMessages.length === 0 && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>{T.msgEmpty || "Aucun message"}</p>}
            {communityMessages.map(m => {
              const isVoice = m.content?.startsWith("[VOICE]");
              const isOwn = m.user_id === profile?.userId;
              return (
                <div key={m.id} className="flex gap-2 mb-3"
                  onClick={() => { if (isOwn) setDeletingId(deletingId === m.id ? null : m.id); }}
                  style={{ cursor: isOwn ? "pointer" : "default" }}
                >
                  <div className="rounded-full overflow-hidden shrink-0" style={{ width: 28, height: 28, background: "#1e1e1e" }}>
                    {m.avatar ? <img src={m.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={14} color="#555" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span style={{ color: "#CCF71D", fontSize: "11px", fontWeight: 700 }}>{m.pseudo || "?"}</span>
                    {isVoice ? <VoiceMessage src={m.content.slice(7)} /> : <p style={{ color: "#ddd", fontSize: "13px", lineHeight: 1.4, wordBreak: "break-word" }}>{m.content}</p>}
                    {deletingId === m.id && (
                      <div className="flex gap-2 mt-1">
                        <button onClick={e => { e.stopPropagation(); deleteMsg(m.id, "community"); }} className="rounded-lg px-3 py-1" style={{ background: "#3a1a1a", border: "1px solid #5a2a2a", color: "#ef4444", fontSize: "11px", fontWeight: 700 }}>Supprimer</button>
                        <button onClick={e => { e.stopPropagation(); setDeletingId(null); }} className="rounded-lg px-3 py-1" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888", fontSize: "11px", fontWeight: 700 }}>Annuler</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {tab === "dms" && !activeDm && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {conversations.length === 0 && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>{T.msgNoDms || "Aucune conversation"}</p>}
          {conversations.map(c => (
            <button key={c.partnerId} onClick={() => openDm(c)} className="w-full flex items-center gap-3 py-3 rounded-xl px-2" style={{ background: "transparent" }}>
              <div className="rounded-full overflow-hidden shrink-0" style={{ width: 40, height: 40, background: "#1e1e1e" }}>
                {c.avatar ? <img src={c.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={18} color="#555" />}
              </div>
              <div className="flex-1 text-left">
                <p style={{ color: "#fff", fontSize: "14px", fontWeight: 700 }}>{c.pseudo}</p>
                <p style={{ color: "#555", fontSize: "11px" }}>{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString() : ""}</p>
              </div>
              <Shield size={12} color="#22c55e" />
            </button>
          ))}
        </div>
      )}

      {activeDm && (
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col justify-end" style={{ minHeight: 0 }}>
          <div>
            {dmMessages.length === 0 && <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>{T.msgEmpty || "Aucun message"}</p>}
            {dmMessages.map((m, i) => (
              <div key={m.id || i} className={`flex mb-2 ${m.isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className="rounded-xl px-3 py-2 max-w-[75%]"
                  style={{ background: m.isMe ? "#1a3a1a" : "#1a1a1a", border: m.isMe ? "1px solid #2a4a2a" : "1px solid #2a2a2a", cursor: m.isMe ? "pointer" : "default" }}
                  onClick={() => { if (m.isMe && m.id) setDeletingId(deletingId === ("dm-" + m.id) ? null : "dm-" + m.id); }}
                >
                  <p style={{ color: "#eee", fontSize: "13px", lineHeight: 1.4, wordBreak: "break-word" }}>{m.text}</p>
                  {deletingId === ("dm-" + m.id) && (
                    <div className="flex gap-2 mt-1">
                      <button onClick={e => { e.stopPropagation(); deleteMsg(m.id, "dm"); }} className="rounded-lg px-3 py-1" style={{ background: "#3a1a1a", border: "1px solid #5a2a2a", color: "#ef4444", fontSize: "11px", fontWeight: 700 }}>Supprimer</button>
                      <button onClick={e => { e.stopPropagation(); setDeletingId(null); }} className="rounded-lg px-3 py-1" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888", fontSize: "11px", fontWeight: 700 }}>Annuler</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {(tab === "community" || activeDm) && (
        <div className="px-3 flex gap-2 items-center shrink-0" style={{ borderTop: "1px solid #1a1a1a", background: "#0a0a0a", paddingTop: 6, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 4px)" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); activeDm ? sendDm() : sendCommunity(); } }}
            placeholder={activeDm ? (T.msgDmPlaceholder || "Message chiffré...") : (T.msgPlaceholder || "Message...")}
            className="flex-1 rounded-xl px-4 py-2"
            style={{ background: "#141414", border: "1px solid #2a2a2a", color: "#fff", fontSize: "13px", outline: "none" }}
          />
          <button
            onClick={activeDm ? sendDm : sendCommunity}
            disabled={sending || !input.trim()}
            className="rounded-xl px-3 py-2 shrink-0"
            style={{ background: input.trim() ? "#CCF71D" : "#222", transition: "all 0.2s" }}
          >
            <Send size={16} color={input.trim() ? "#000" : "#555"} />
          </button>
        </div>
      )}
    </div>
  );
}

function ClassementTab({ T, scoreCats, toggleScoreCat, userPoints, pointsPerGame, profile, onOpenProfile, onEditProfile, profileView, setProfileView, profileStats, onViewMatch, showFriendModal, setShowFriendModal, setShowMessages }) {
  const score = getScoreForCats(scoreCats, pointsPerGame, userPoints);
  const [showRewards, setShowRewards] = useState(false);
  const [socialStats, setSocialStats] = useState({ following: 0, followers: 0, views: 0 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [carouselSlide, setCarouselSlide] = useState(0);
  const carouselDragX = useRef(null);
  const registeredCount = leaderboard.length;
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postPrefill, setPostPrefill] = useState("");
  const [nexusPosts, setNexusPosts] = useState([]);
  const [spectatorUser, setSpectatorUser] = useState(null);
  const [spectatorStats, setSpectatorStats] = useState(null);
  const [friendModalTab, setFriendModalTab] = useState("search");
  const [specMenu, setSpecMenu] = useState(false);
  const [specInfoPopup, setSpecInfoPopup] = useState(false);

  useEffect(() => {
    if (profile?.userId) {
      fetch(API_BASE + "/api/social/me/" + profile.userId).then(r => r.json()).then(d => {
        if (d.following !== undefined) setSocialStats(d);
      }).catch(() => {});
      fetch(API_BASE + "/api/social/following/" + profile.userId).then(r => r.json()).then(d => {
        if (Array.isArray(d)) setFriendsList(d);
      }).catch(() => {});
    }
    fetch(API_BASE + "/api/social/leaderboard").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setLeaderboard(d);
    }).catch(() => {});
    fetch(API_BASE + "/api/posts/feed?limit=20&userId=" + (profile?.userId || "")).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setNexusPosts(d);
    }).catch(() => {});
  }, [profile?.userId, profileView]);

  useEffect(() => {
    function onCreatePost(e) {
      setPostPrefill(e.detail?.text || "");
      setCarouselSlide(1);
      setShowCreatePost(true);
    }
    window.addEventListener("split-create-post", onCreatePost);
    return () => window.removeEventListener("split-create-post", onCreatePost);
  }, []);

  if (profileView && profile) {
    const { exact, bon, parie, history } = profileStats;
    return (
      <div className="px-4 pt-6 pb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setProfileView(false)} className="rounded-full p-1.5" style={{ background: "#181818" }}>
              <ArrowLeft size={18} color="#ccc" />
            </button>
            <h1 className="font-black text-white" style={{ fontSize: "22px", letterSpacing: "-0.02em" }}>{T.profileTitle}</h1>
          </div>
          <button onClick={onEditProfile} className="rounded-lg px-3 py-1.5" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
            <span style={{ color: "#ccc", fontSize: 11, fontWeight: 700 }}>{T.profileEdit || "Modifier"}</span>
          </button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="rounded-full overflow-hidden flex items-center justify-center" style={{ width: 72, height: 72, background: "#1e1e1e", border: "2px solid #333", flexShrink: 0 }}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <User size={32} color="#555" />
            )}
          </div>
          <div className="flex-1 flex justify-around text-center">
            <button onClick={() => { setShowFriendModal(true); setFriendModalTab("followers"); }} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <p className="font-black text-white" style={{ fontSize: "18px" }}>{socialStats.followers}</p>
              <p style={{ color: "#888", fontSize: "10px" }}>{T.friendTabFollowers}</p>
            </button>
            <button onClick={() => { setShowFriendModal(true); setFriendModalTab("following"); }} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <p className="font-black text-white" style={{ fontSize: "18px" }}>{socialStats.following}</p>
              <p style={{ color: "#888", fontSize: "10px" }}>{T.friendTabFollowing}</p>
            </button>
            <div>
              <p className="font-black" style={{ fontSize: "18px", color: "#CCF71D" }}>{userPoints}</p>
              <p style={{ color: "#888", fontSize: "10px" }}>{T.profilePoint}</p>
            </div>
          </div>
        </div>

        {profile.bio && <p style={{ color: "#ccc", fontSize: "13px" }} className="mb-3">{profile.bio}</p>}

        {(() => {
          const eb = localStorage.getItem("split_equipped_badge") || "";
          const ebe = localStorage.getItem("split_equipped_badge_emoji") || "";
          const et = localStorage.getItem("split_equipped_title") || "";
          if (!eb && !et) return null;
          return (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {eb && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 800, color: "#EAB308" }}><span style={{ fontSize: 14 }}>{ebe || "🏅"}</span>{eb}</span>}
              {et && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 800, color: "#c084fc" }}>{et}</span>}
            </div>
          );
        })()}

        {(profile.favTeams?.valo || profile.favTeams?.cs2 || profile.favTeams?.rl) && (
          <div className="mb-3">
            <p style={{ color: "#888", fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{T.profileFavLabel || "Équipes préférées"}</p>
            <div className="flex gap-2 flex-wrap">
              {profile.favTeams.valo && <span className="rounded-full px-3 py-1.5" style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#ff4655", fontSize: "11px", fontWeight: 700 }}>Valorant : {profile.favTeams.valo}</span>}
              {profile.favTeams.cs2 && <span className="rounded-full px-3 py-1.5" style={{ background: "#1e1e1a", border: "1px solid #2e2e2a", color: "#f0a500", fontSize: "11px", fontWeight: 700 }}>CS2 : {profile.favTeams.cs2}</span>}
              {profile.favTeams.rl && <span className="rounded-full px-3 py-1.5" style={{ background: "#1a1e2e", border: "1px solid #2a2e3e", color: "#3B82F6", fontSize: "11px", fontWeight: 700 }}>RL : {profile.favTeams.rl}</span>}
            </div>
          </div>
        )}

        <div className="rounded-2xl px-4 py-3 mb-5 flex justify-around text-center" style={{ background: "#141414", border: "1px solid #262626" }}>
          <div>
            <p className="font-black text-white" style={{ fontSize: "18px" }}>{exact}</p>
            <p style={{ color: "#888", fontSize: "10px" }}>{T.profileExact}</p>
          </div>
          <div>
            <p className="font-black text-white" style={{ fontSize: "18px" }}>{bon}</p>
            <p style={{ color: "#888", fontSize: "10px" }}>{T.profileBon}</p>
          </div>
          <div>
            <p className="font-black text-white" style={{ fontSize: "18px" }}>{parie}</p>
            <p style={{ color: "#888", fontSize: "10px" }}>{T.profileParie}</p>
          </div>
        </div>

        {(() => {
          const allPts = leaderboard.map(u => u.points);
          const rank = getUserRank(userPoints || 0, allPts.length >= 50 ? allPts : undefined);
          const nextLabel = rank.nextPts ? `${rank.nextPts} pts` : "MAX";
          return (
            <div className="rounded-2xl py-6 mb-5 flex flex-col items-center gap-1" style={{ background: rank.bg, border: `1px solid ${rank.border}` }}>
              {rank.logo === "unranked" ? (
                <svg width="120" height="120" viewBox="0 0 48 48" fill="none">
                  <path d="M24 4L6 14v12c0 10.5 7.7 20.3 18 22.8C34.3 46.3 42 36.5 42 26V14L24 4z" fill="none" stroke="#555" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M24 10L12 17v9c0 7.5 5.1 14.5 12 16.3 6.9-1.8 12-8.8 12-16.3v-9L24 10z" fill="rgba(80,80,80,0.15)" stroke="#444" strokeWidth="0.5"/>
                  <text x="24" y="30" textAnchor="middle" fill="#555" fontSize="16" fontWeight="800" fontFamily="system-ui">?</text>
                </svg>
              ) : rank.logo ? (
                <img src={rank.logo} alt={rank.name} style={{ width: 120, height: 120, objectFit: "contain", filter: rank.name === "Infinite" ? "drop-shadow(0 0 20px rgba(56,189,248,0.6))" : rank.name === "Global Elite" ? "drop-shadow(0 0 16px rgba(234,179,8,0.5))" : "none" }} />
              ) : (
                <Shield size={80} color="#666" />
              )}
              <p className="font-black mt-2" style={{ color: rank.color, fontSize: "22px", letterSpacing: "-0.02em" }}>{rank.label}</p>
              <div className="flex items-center gap-2 px-8 w-full mt-1">
                <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${rank.progress * 100}%`, height: "100%", background: rank.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                </div>
                <span style={{ color: "#888", fontSize: "10px", fontWeight: 700 }}>{nextLabel}</span>
              </div>
            </div>
          );
        })()}

        <p className="font-bold text-white mb-3" style={{ fontSize: "14px" }}>{T.profileHistory}</p>
        <div className="flex flex-col gap-2">
          {history.length === 0 && <p style={{ color: "#555", fontSize: "12px" }}>—</p>}
          {history.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "#141414", border: "1px solid #1e1e1e" }}>
              <span className="rounded px-2 py-0.5 font-bold shrink-0" style={{ fontSize: "10px", textTransform: "uppercase", background: h.game === "valo" ? "#1a1a2e" : "#1e1e1a", color: h.game === "valo" ? "#ff4655" : "#f0a500", border: "1px solid " + (h.game === "valo" ? "#2a2a3e" : "#2e2e2a") }}>
                {h.game === "valo" ? "Valo" : "Cs2"}
              </span>
              <span className="font-bold shrink-0" style={{ color: h.pts > 0 ? "#CCF71D" : "#666", fontSize: "13px", minWidth: "45px" }}>+{h.pts}</span>
              <span className="flex-1 truncate" style={{ color: "#aaa", fontSize: "12px" }}>{h.team1} vs {h.team2}</span>
              <button onClick={() => onViewMatch(h.id, h.game)} style={{ color: "#CCF71D", fontSize: "12px", fontWeight: 700 }}>{T.profileVoir}</button>
            </div>
          ))}
        </div>

        {showFriendModal && <FriendModal onClose={() => { setShowFriendModal(false); setFriendModalTab("search"); }} T={T} profile={profile} userPoints={userPoints} initialTab={friendModalTab} />}
      </div>
    );
  }

  if (spectatorUser) {
    const su = spectatorUser;
    const ss = spectatorStats || {};
    const allPts = leaderboard.map(u => u.points);
    const rank = getUserRank(su.displayPts || su.points || 0, allPts.length >= 50 ? allPts : undefined);
    return (
      <div className="px-4 pt-6 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => { setSpectatorUser(null); setSpectatorStats(null); }} className="rounded-full p-1.5" style={{ background: "#181818" }}>
            <ArrowLeft size={18} color="#ccc" />
          </button>
          <h1 className="font-black text-white flex-1" style={{ fontSize: "22px", letterSpacing: "-0.02em" }}>{su.pseudo}</h1>
          <div style={{ position: "relative" }}>
            <button onClick={() => setSpecMenu(v => !v)} className="rounded-full p-1.5" style={{ background: "#181818", border: "1px solid #2a2a2a" }}>
              <MoreHorizontal size={16} color="#999" />
            </button>
            {specMenu && (
              <>
                <div onClick={() => setSpecMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 11, background: "#1c1c1c", border: "1px solid #333", borderRadius: 10, overflow: "hidden", minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                  <button onClick={() => { setSpecMenu(false); }} className="w-full text-left flex items-center gap-2" style={{ padding: "10px 14px", color: "#e05252", fontSize: "12px", fontWeight: 700, background: "transparent", border: "none", borderBottom: "1px solid #2a2a2a", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    Bannir
                  </button>
                  <button onClick={() => { setSpecMenu(false); }} className="w-full text-left flex items-center gap-2" style={{ padding: "10px 14px", color: "#f59e0b", fontSize: "12px", fontWeight: 700, background: "transparent", border: "none", borderBottom: "1px solid #2a2a2a", cursor: "pointer" }}>
                    <AlertCircle size={14} />
                    Signaler
                  </button>
                  <button onClick={() => { setSpecMenu(false); setSpecInfoPopup(true); }} className="w-full text-left flex items-center gap-2" style={{ padding: "10px 14px", color: "#aaa", fontSize: "12px", fontWeight: 700, background: "transparent", border: "none", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Info sur ce compte
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center mb-4">
          <div className="rounded-full overflow-hidden flex items-center justify-center mb-3" style={{ width: 80, height: 80, background: "#1e1e1e", border: "2px solid #333" }}>
            {su.avatar ? <img src={su.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={36} color="#555" />}
          </div>
          <div className="flex justify-around text-center w-full mb-2">
            <div>
              <p className="font-black text-white" style={{ fontSize: "18px" }}>{ss.followers || 0}</p>
              <p style={{ color: "#888", fontSize: "10px" }}>{T.friendTabFollowers}</p>
            </div>
            <div>
              <p className="font-black text-white" style={{ fontSize: "18px" }}>{ss.following || 0}</p>
              <p style={{ color: "#888", fontSize: "10px" }}>{T.friendTabFollowing}</p>
            </div>
            <div>
              <p className="font-black" style={{ fontSize: "18px", color: "#CCF71D" }}>{su.displayPts || su.points || 0}</p>
              <p style={{ color: "#888", fontSize: "10px" }}>{T.profilePoint}</p>
            </div>
          </div>
        </div>

        {su.bio && <p style={{ color: "#ccc", fontSize: "13px" }} className="mb-3">{su.bio}</p>}

        {(() => {
          const seb = su.equipped_badge || "";
          const sebe = su.equipped_badge_emoji || "";
          const set2 = su.equipped_title || "";
          if (!seb && !set2) return null;
          return (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {seb && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 800, color: "#EAB308" }}><span style={{ fontSize: 14 }}>{sebe || "🏅"}</span>{seb}</span>}
              {set2 && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 800, color: "#c084fc" }}>{set2}</span>}
            </div>
          );
        })()}

        {profile && ss.iFollow !== undefined && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => {
              const action = ss.iFollow ? "unfollow" : "follow";
              fetch(API_BASE + `/api/social/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followerId: profile.userId, followedId: su.id }) }).then(() => {
                setSpectatorStats(prev => ({ ...prev, iFollow: !prev.iFollow, followers: (prev.followers || 0) + (prev.iFollow ? -1 : 1) }));
              });
            }} className="flex-1 rounded-xl font-bold py-2.5" style={{ background: ss.iFollow ? "#1a1a1a" : "#CCF71D", color: ss.iFollow ? "#aaa" : "#000", fontSize: "13px", border: ss.iFollow ? "1px solid #333" : "none" }}>
              {ss.iFollow ? (T.friendUnfollow || "Ne plus suivre") : (T.friendFollow || "S'abonner")}
            </button>
            <button onClick={() => { setShowMessages(true); }} className="flex-1 rounded-xl font-bold py-2.5 flex items-center justify-center gap-2" style={{ background: "#1a1a1a", color: "#ccc", fontSize: "13px", border: "1px solid #333" }}>
              <MessageCircle size={14} /> Discussion
            </button>
          </div>
        )}

        {(su.fav_teams_valo || su.fav_teams_cs2 || su.fav_teams_rl) && (
          <div className="mb-3">
            <p style={{ color: "#888", fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{T.profileFavLabel || "Équipes préférées"}</p>
            <div className="flex gap-2 flex-wrap">
              {su.fav_teams_valo && <span className="rounded-full px-3 py-1.5" style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#ff4655", fontSize: "11px", fontWeight: 700 }}>Valorant : {su.fav_teams_valo}</span>}
              {su.fav_teams_cs2 && <span className="rounded-full px-3 py-1.5" style={{ background: "#1e1e1a", border: "1px solid #2e2e2a", color: "#f0a500", fontSize: "11px", fontWeight: 700 }}>CS2 : {su.fav_teams_cs2}</span>}
              {su.fav_teams_rl && <span className="rounded-full px-3 py-1.5" style={{ background: "#1a1e2e", border: "1px solid #2a2e3e", color: "#3B82F6", fontSize: "11px", fontWeight: 700 }}>RL : {su.fav_teams_rl}</span>}
            </div>
          </div>
        )}

        <div className="rounded-2xl py-6 mb-5 flex flex-col items-center gap-1" style={{ background: rank.bg, border: `1px solid ${rank.border}` }}>
          {rank.logo === "unranked" ? (
            <svg width="100" height="100" viewBox="0 0 48 48" fill="none">
              <path d="M24 4L6 14v12c0 10.5 7.7 20.3 18 22.8C34.3 46.3 42 36.5 42 26V14L24 4z" fill="none" stroke="#555" strokeWidth="1.5" strokeLinejoin="round"/>
              <text x="24" y="30" textAnchor="middle" fill="#555" fontSize="16" fontWeight="800" fontFamily="system-ui">?</text>
            </svg>
          ) : rank.logo ? (
            <img src={rank.logo} alt={rank.name} style={{ width: 100, height: 100, objectFit: "contain", filter: rank.name === "Infinite" ? "drop-shadow(0 0 20px rgba(56,189,248,0.6))" : rank.name === "Global Elite" ? "drop-shadow(0 0 16px rgba(234,179,8,0.5))" : "none" }} />
          ) : (
            <Shield size={80} color="#666" />
          )}
          <p className="font-black mt-2" style={{ color: rank.color, fontSize: "22px" }}>{rank.label}</p>
        </div>

        {specInfoPopup && (
          <>
            <div onClick={() => setSpecInfoPopup(false)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)" }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 51, background: "#1c1c1c", border: "1px solid #333", borderRadius: 16, padding: "20px 24px", minWidth: 260, boxShadow: "0 8px 30px rgba(0,0,0,0.6)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-full overflow-hidden" style={{ width: 44, height: 44, background: "#1e1e1e" }}>
                  {su.avatar ? <img src={su.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={20} color="#555" />}
                </div>
                <div>
                  <p style={{ color: "#fff", fontSize: "14px", fontWeight: 800 }}>{su.pseudo}</p>
                  <p style={{ color: "#666", fontSize: "11px" }}>ID: {su.id?.slice(0, 8)}...</p>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 12 }}>
                <p style={{ color: "#888", fontSize: "11px" }}>Date de création</p>
                <p style={{ color: "#ccc", fontSize: "13px", fontWeight: 700 }}>{ss.createdAt ? new Date(ss.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "Inconnue"}</p>
              </div>
              <button onClick={() => setSpecInfoPopup(false)} className="w-full rounded-lg py-2 mt-4 font-bold" style={{ background: "#262626", color: "#ccc", fontSize: "12px", border: "none", cursor: "pointer" }}>Fermer</button>
            </div>
          </>
        )}
      </div>
    );
  }

  function onCarouselDown(e) { carouselDragX.current = e.clientX ?? e.touches?.[0]?.clientX ?? null; }
  function onCarouselUp(e) {
    if (carouselDragX.current === null) return;
    const endX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? 0;
    const dx = endX - carouselDragX.current;
    if (Math.abs(dx) > 40) setCarouselSlide(s => dx < 0 ? Math.min(1, s + 1) : Math.max(0, s - 1));
    carouselDragX.current = null;
  }

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5 pt-3 pb-1">
        {[0, 1].map(i => (
          <span key={i} className="rounded-full" style={{ width: carouselSlide === i ? 16 : 6, height: 6, background: carouselSlide === i ? "#fff" : "rgba(255,255,255,0.3)", transition: "all 0.25s" }} />
        ))}
      </div>

      {/* Carousel track */}
      <div
        style={{ display: "flex", width: "200%", transform: `translateX(-${carouselSlide * 50}%)`, transition: "transform 0.35s ease", touchAction: "pan-y" }}
        onPointerDown={onCarouselDown}
        onPointerUp={onCarouselUp}
      >
        {/* SLIDE 1: Classement */}
        <div style={{ width: "50%", flexShrink: 0 }}>
          <div className="px-4 pt-2 pb-6">
            <div className="flex items-center justify-between mb-1">
              <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.classementTitle}</h1>
              {(() => {
                const allPts = leaderboard.map(u => u.points);
                const rank = getUserRank(userPoints || 0, allPts.length >= 50 ? allPts : undefined);
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: rank.bg, border: `1px solid ${rank.border}`, borderRadius: 16, padding: "8px 14px" }}>
                    {rank.logo === "unranked" ? (
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <path d="M24 4L6 14v12c0 10.5 7.7 20.3 18 22.8C34.3 46.3 42 36.5 42 26V14L24 4z" fill="none" stroke="#555" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M24 10L12 17v9c0 7.5 5.1 14.5 12 16.3 6.9-1.8 12-8.8 12-16.3v-9L24 10z" fill="rgba(80,80,80,0.15)" stroke="#444" strokeWidth="1"/>
                        <text x="24" y="30" textAnchor="middle" fill="#555" fontSize="16" fontWeight="800" fontFamily="system-ui">?</text>
                      </svg>
                    ) : rank.logo ? (
                      <img src={rank.logo} alt={rank.name} style={{ width: 38, height: 38, objectFit: "contain", filter: rank.name === "Infinite" ? "drop-shadow(0 0 10px rgba(56,189,248,0.5))" : rank.name === "Global Elite" ? "drop-shadow(0 0 8px rgba(234,179,8,0.4))" : "none" }} />
                    ) : (
                      <Shield size={32} color="#666" />
                    )}
                    <span style={{ color: rank.color, fontSize: 11, fontWeight: 800 }}>{rank.label}</span>
                  </div>
                );
              })()}
            </div>
            <p style={{ color: "#888", fontSize: "12px" }} className="mb-4">{T.classementSubtitle}</p>

            <button onClick={() => setShowRewards(true)} className="relative rounded-xl overflow-hidden mb-4 w-full" style={{ height: "72px", background: "#000", boxShadow: "inset 0 0 0 1px rgba(191,155,48,0.3)", display: "block" }}>
              <img src={REWARDS_BANNER} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "left center" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)" }} />
              <div className="absolute flex items-center gap-2" style={{ right: "14px", top: "50%", transform: "translateY(-50%)" }}>
                <Trophy size={16} color="#bf9b30" />
                <span style={{ color: "#bf9b30", fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>{T.settingsRewards}</span>
                <ChevronRight size={14} color="#bf9b30" />
              </div>
            </button>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4">
              {SCORE_CATS.map((c) => {
                const active = scoreCats.includes(c);
                return (
                  <button key={c} onClick={() => toggleScoreCat(c)} className="shrink-0 rounded-full transition-all" style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: active ? "#fff" : "#161616", color: active ? "#000" : "#888", border: active ? "1px solid transparent" : "1px solid #2a2a2a" }}>
                    {T[SCORE_CAT_KEYS[c]] || c}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              {!profile && (
                <div className="flex flex-col items-center text-center mt-6" style={{ minHeight: "300px" }}>
                  <div className="rounded-full flex items-center justify-center mb-4" style={{ width: 64, height: 64, background: "#141414", border: "1px solid #262626" }}>
                    <User size={26} color="#444" />
                  </div>
                  <p className="font-black text-white" style={{ fontSize: "16px" }}>{T.profileCreate}</p>
                  <p style={{ color: "#777", fontSize: "12.5px", maxWidth: "260px" }} className="mt-2">{T.profileCreateSub}</p>
                  <button onClick={onOpenProfile} className="rounded-xl font-bold px-6 py-2.5 mt-4" style={{ background: "#CCF71D", color: "#000", fontSize: "13px" }}>
                    {T.profileCreate}
                  </button>
                </div>
              )}
              {profile && leaderboard.length === 0 && score === 0 && (
                <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>{T.classementSubtitle}</p>
              )}
              {profile && (() => {
                function getUserPtsForFilter(u) {
                  if (scoreCats.includes("tout")) return u.points;
                  let t = 0;
                  if (scoreCats.includes("valo")) t += u.points_valo || 0;
                  if (scoreCats.includes("cs2")) t += u.points_cs2 || 0;
                  if (scoreCats.includes("rl")) t += u.points_rl || 0;
                  return t;
                }
                const merged = leaderboard.map(u => ({ ...u, displayPts: getUserPtsForFilter(u) }));
                const myIdx = merged.findIndex(u => u.id === profile.userId);
                if (myIdx === -1 && score > 0) {
                  merged.push({ id: profile.userId, pseudo: profile.pseudo, avatar: profile.avatar, points: score, points_valo: pointsPerGame.valo || 0, points_cs2: pointsPerGame.cs2 || 0, points_rl: pointsPerGame.rl || 0, displayPts: score });
                } else if (myIdx >= 0) {
                  merged[myIdx] = { ...merged[myIdx], displayPts: Math.max(merged[myIdx].displayPts, score) };
                }
                merged.sort((a, b) => b.displayPts - a.displayPts);
                const filtered = merged;
                if (filtered.length === 0) return null;
                const top100 = filtered.slice(0, 100);
                const myRankIdx = filtered.findIndex(u => u.id === profile.userId);
                const meInTop = myRankIdx >= 0 && myRankIdx < 100;
                function renderRow(u, i) {
                  const isMe = u.id === profile.userId;
                  const rankLogo = getUserRank(u.displayPts);
                  const logoSize = rankLogo.name === "Immortal" ? 28 : 22;
                  const uTitle = isMe ? (localStorage.getItem("split_equipped_title") || "") : (u.equipped_title || "");
                  const uBadge = isMe ? (localStorage.getItem("split_equipped_badge") || "") : (u.equipped_badge || "");
                  const uBadgeEmoji = isMe ? (localStorage.getItem("split_equipped_badge_emoji") || "") : (u.equipped_badge_emoji || "");
                  const uBanner = isMe ? (localStorage.getItem("split_equipped_banner_color") || "") : (u.equipped_banner || "");
                  const uPseudoColor = isMe ? (profile?.pseudoColor || "#fff") : (u.pseudo_color || "#ccc");
                  return (
                    <button key={u.id} onClick={() => {
                      if (isMe) { setProfileView(true); return; }
                      fetch(API_BASE + "/api/social/profile/" + u.id + "?viewerId=" + (profile.userId || "")).then(r => r.json()).then(d => {
                        setSpectatorUser({ ...u, ...d });
                        setSpectatorStats(d);
                      }).catch(() => { setSpectatorUser(u); });
                    }} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{
                      position: "relative", overflow: "hidden", textAlign: "left",
                      background: uBanner
                        ? `linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.7) 100%), url(${uBanner}) center/cover no-repeat`
                        : (isMe ? "#141414" : "#0e0e0e"),
                      border: uBanner ? "1px solid rgba(255,255,255,0.18)" : (isMe ? "1px solid #262626" : "1px solid #1a1a1a"),
                    }}>
                      <span className="font-black shrink-0" style={{ color: i < 3 ? "#CCF71D" : uBanner ? "#eee" : "#888", fontSize: "16px", width: 24, textAlign: "center", position: "relative", textShadow: uBanner ? "0 2px 6px rgba(0,0,0,0.9)" : "none" }}>{i + 1}</span>
                      <div className="rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ width: 36, height: 36, background: "#1e1e1e", border: isMe ? "2px solid #CCF71D" : uBanner ? "2px solid rgba(255,255,255,0.25)" : "1px solid #2a2a2a", position: "relative" }}>
                        {u.avatar ? <img src={u.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={16} color="#555" />}
                      </div>
                      <div className="flex-1 min-w-0" style={{ position: "relative" }}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold truncate" style={{ fontSize: "13px", color: uPseudoColor, textShadow: uBanner ? "0 1px 4px rgba(0,0,0,0.8)" : "none" }}>{u.pseudo}{isMe ? " (toi)" : ""}</span>
                          {uBadge && <span style={{ fontSize: 12, flexShrink: 0, lineHeight: 1 }} title={uBadge}>{uBadgeEmoji || "🏅"}</span>}
                          {uTitle && <span style={{ fontSize: 9, fontWeight: 800, color: "#c084fc", background: uBanner ? "rgba(0,0,0,0.65)" : "rgba(168,85,247,0.12)", padding: "2px 7px", borderRadius: 4, flexShrink: 0, letterSpacing: 0.5, border: uBanner ? "1px solid rgba(168,85,247,0.3)" : "none", textShadow: "none" }}>{uTitle}</span>}
                        </div>
                      </div>
                      {rankLogo.logo && rankLogo.logo !== "unranked" ? (
                        uBanner ? (
                          <div style={{ width: logoSize + 10, height: logoSize + 10, borderRadius: 8, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", border: "1px solid rgba(255,255,255,0.1)" }}>
                            <img src={rankLogo.logo} alt={rankLogo.name} style={{ width: logoSize, height: logoSize, objectFit: "contain" }} />
                          </div>
                        ) : (
                          <img src={rankLogo.logo} alt={rankLogo.name} style={{ width: logoSize, height: logoSize, objectFit: "contain", flexShrink: 0 }} />
                        )
                      ) : null}
                      <div className="text-right shrink-0" style={{ position: "relative" }}>
                        <span style={{ color: isMe ? "#CCF71D" : "#ddd", fontSize: "16px", fontWeight: 900, textShadow: uBanner ? "0 2px 6px rgba(0,0,0,0.9)" : "none" }}>{u.displayPts}</span>
                        <span style={{ color: uBanner ? "#bbb" : "#888", fontSize: "10px", fontWeight: 600, marginLeft: 2 }}>pts</span>
                      </div>
                    </button>
                  );
                }
                return (
                  <>
                    {!meInTop && score > 0 && (
                      <div className="sticky top-0 z-10 mb-2" style={{ marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16, paddingTop: 4, paddingBottom: 4, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
                        {renderRow({ id: profile.userId, pseudo: profile.pseudo, avatar: profile.avatar, displayPts: score }, myRankIdx >= 0 ? myRankIdx : filtered.length - 1)}
                      </div>
                    )}
                    {top100.map((u, i) => renderRow(u, i))}
                  </>
                );
              })()}
            </div>

            {/* Share + Swipe arrow hint */}
            {carouselSlide === 0 && (
              <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <button onClick={() => { if (navigator.share) navigator.share({ title: "Split", text: "Mes résultats sur Split !", url: window.location.href }); }} className="rounded-full p-1.5" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <Share2 size={13} color="#ccc" />
                </button>
                <div style={{ opacity: 0.25, pointerEvents: "none" }}>
                  <ChevronRight size={20} color="#fff" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SLIDE 2: Nexus */}
        <div style={{ width: "50%", flexShrink: 0 }}>
          <div className="px-4 pt-2 pb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-white" style={{ fontSize: "20px", letterSpacing: "-0.02em" }}>Nexus</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowCreatePost(true)} className="rounded-full p-2" style={{ background: "#181818", border: "1px solid #2a2a2a" }}>
                  <Plus size={16} color="#CCF71D" />
                </button>
                <button onClick={() => setShowMessages(true)} className="rounded-full p-2" style={{ background: "#181818", border: "1px solid #2a2a2a" }}>
                  <MessageCircle size={16} color="#ccc" />
                </button>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <button onClick={() => profile ? setProfileView(true) : onOpenProfile()} className="flex flex-col items-center shrink-0">
                <div className="rounded-full overflow-hidden flex items-center justify-center" style={{ width: 56, height: 56, background: "#1e1e1e", border: "2px solid #CCF71D" }}>
                  {profile?.avatar ? <img src={profile.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={24} color="#555" />}
                </div>
                <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700, marginTop: 4 }}>{profile?.pseudo || "Toi"}</span>
              </button>
              <div className="flex gap-3 overflow-x-auto no-scrollbar flex-1" style={{ paddingBottom: 4 }}>
                {friendsList.length === 0 && (
                  <p style={{ color: "#555", fontSize: "12px", alignSelf: "center", padding: "12px 0" }}>{T.friendEmpty}</p>
                )}
                {friendsList.map(f => (
                  <button key={f.id} onClick={() => { setSpectatorUser({ id: f.id, pseudo: f.pseudo, avatar: f.avatar, points: f.points || 0, bio: f.bio }); fetch(API_BASE + "/api/social/profile/" + f.id + "?viewerId=" + (profile?.userId || "")).then(r => r.json()).then(d => setSpectatorStats(d)).catch(() => {}); }} className="flex flex-col items-center shrink-0" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <div className="rounded-full overflow-hidden flex items-center justify-center" style={{ width: 50, height: 50, background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                      {f.avatar ? <img src={f.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={20} color="#555" />}
                    </div>
                    <span className="truncate" style={{ color: "#aaa", fontSize: "9px", fontWeight: 600, marginTop: 3, maxWidth: 50, textAlign: "center" }}>{f.pseudo}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {nexusPosts.length === 0 && <p style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "20px 0" }}>{T.postEmpty || "Aucun post"}</p>}
              {nexusPosts.map(p => (
                <div key={p.id} className="rounded-xl p-3" style={{ background: "#141414", border: "1px solid #262626" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => { if (p.user_id && p.user_id !== profile?.userId) { setSpectatorUser({ id: p.user_id, pseudo: p.pseudo, avatar: p.avatar, points: p.points || 0, bio: p.bio }); fetch(API_BASE + "/api/social/profile/" + p.user_id + "?viewerId=" + (profile?.userId || "")).then(r => r.json()).then(d => setSpectatorStats(d)).catch(() => {}); } else if (p.user_id === profile?.userId) { setProfileView(true); } }} className="rounded-full overflow-hidden shrink-0" style={{ width: 28, height: 28, background: "#1e1e1e", border: "none", cursor: "pointer", padding: 0 }}>
                      {p.avatar ? <img src={p.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={12} color="#555" />}
                    </button>
                    <button onClick={() => { if (p.user_id && p.user_id !== profile?.userId) { setSpectatorUser({ id: p.user_id, pseudo: p.pseudo, avatar: p.avatar, points: p.points || 0, bio: p.bio }); fetch(API_BASE + "/api/social/profile/" + p.user_id + "?viewerId=" + (profile?.userId || "")).then(r => r.json()).then(d => setSpectatorStats(d)).catch(() => {}); } else if (p.user_id === profile?.userId) { setProfileView(true); } }} style={{ color: "#fff", fontSize: "11px", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{p.pseudo || "?"}</button>
                    <span style={{ color: "#444", fontSize: "10px", marginLeft: "auto" }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  {p.image && <img src={p.image} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 8, maxHeight: 250, objectFit: "cover" }} />}
                  {p.content && <p style={{ color: "#ddd", fontSize: "12px", lineHeight: 1.5 }}>{p.content}</p>}
                  {p.match_data && (
                    <div className="mt-2 rounded-lg px-2 py-1.5" style={{ background: "#0d0d0d", border: "1px solid #222" }}>
                      <span style={{ color: "#888", fontSize: "10px" }}>{p.match_data.team1} vs {p.match_data.team2} — {p.match_data.score}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <button onClick={() => {
                      if (!profile?.userId) return;
                      const action = p.liked ? "unlike" : "like";
                      fetch(API_BASE + `/api/posts/${p.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: profile.userId }) })
                        .then(() => setNexusPosts(prev => prev.map(x => x.id === p.id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x)));
                    }} className="flex items-center gap-1">
                      <span style={{ color: p.liked ? "#CCF71D" : "#555", fontSize: "16px" }}>{p.liked ? "♥" : "♡"}</span>
                      <span style={{ color: "#666", fontSize: "10px" }}>{p.likes || 0}</span>
                    </button>
                    <button onClick={() => { if (navigator.share) navigator.share({ title: "Split", text: p.content || "", url: window.location.href }); }}>
                      <Share2 size={12} color="#555" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showFriendModal && <FriendModal onClose={() => { setShowFriendModal(false); setFriendModalTab("search"); }} T={T} profile={profile} userPoints={userPoints} initialTab={friendModalTab} />}

      {showCreatePost && <CreatePostScreen onClose={() => { setShowCreatePost(false); setPostPrefill(""); fetch(API_BASE + "/api/posts/feed?limit=20&userId=" + (profile?.userId || "")).then(r => r.json()).then(d => { if (Array.isArray(d)) setNexusPosts(d); }).catch(() => {}); }} T={T} profile={profile} prefillText={postPrefill} />}

      {showRewards && (
        <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowRewards(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#111", maxHeight: "80%" }}>
            <div className="relative rounded-t-3xl overflow-hidden" style={{ height: "120px" }}>
              <img src={REWARDS_BANNER} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left center" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #111 0%, transparent 60%)" }} />
              <button onClick={() => setShowRewards(false)} className="absolute" style={{ top: 12, right: 12 }}><X size={20} color="#999" /></button>
            </div>
            <div className="px-5 pb-6" style={{ marginTop: "-16px", position: "relative" }}>
              <h2 className="font-black" style={{ fontSize: "20px", color: "#bf9b30" }}>{T.rewardsTitle}</h2>
              <p style={{ color: "#ccc", fontSize: "13px", marginTop: 8, lineHeight: 1.5 }}>{T.rewardsGoal}</p>
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <span style={{ color: "#888", fontSize: "12px", fontWeight: 600 }}>{registeredCount} / 1 000 {T.rewardsRegistered}</span>
                  <span style={{ color: "#bf9b30", fontSize: "12px", fontWeight: 700 }}>{Math.min(100, Math.round(registeredCount / 10))}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: "8px", background: "#222" }}>
                  <div className="rounded-full" style={{ height: "100%", width: Math.min(100, registeredCount / 10) + "%", background: "linear-gradient(to right, #bf9b30, #d4af37)", transition: "width 0.5s ease" }} />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-5 rounded-xl px-4 py-3" style={{ background: "#181818", border: "1px solid #262626" }}>
                <Trophy size={20} color="#bf9b30" />
                <div>
                  <p style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>???</p>
                  <p style={{ color: "#666", fontSize: "11px" }}>1 000 {T.rewardsRegistered}</p>
                </div>
                <div className="ml-auto">
                  <Lock size={16} color="#555" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LanguageMenu({ current, onSelect, onClose }) {
  return (
    <div className="absolute inset-0 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="absolute rounded-2xl overflow-hidden" style={{ top: "52px", left: "16px", background: "#181818", border: "1px solid #2a2a2a", minWidth: "170px" }}>
        {LANGS.map((l) => (
          <button key={l.code} onClick={() => { onSelect(l.code); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5" style={{ background: current === l.code ? "#242424" : "transparent" }}>
            <span style={{ fontSize: "16px" }}>{l.flag}</span>
            <span style={{ color: "#fff", fontSize: "13px" }}>{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsModal({ onClose, notifGames, setNotifGames, favoriteTeam, setFavoriteTeam, teams, T, profile }) {
  const allTeams = teams || [];
  const [activeSection, setActiveSection] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const [forgotMsg, setForgotMsg] = useState(false);

  const GAMES = [
    { key: "valorant", label: "Valorant", img: NAV_VALORANT_IMG, accent: "#FF4655",
      regions: REGIONS.map((r) => ({ key: r.key, label: regionLabel(r.key, T), accent: r.accent })) },
    { key: "cs2", label: "CS2", img: NAV_CSGO_IMG, accent: "#F5A623",
      regions: REGIONS_CS2.map((r) => ({ key: r.key, label: regionLabelCS2(r.key, T), accent: r.accent })) },
    { key: "rl", label: "Rocket League", img: NAV_RL_IMG, accent: "#4A90D9",
      regions: REGIONS_RL.map((r) => ({ key: r.key, label: regionLabelRL(r.key, T), accent: r.accent })) },
  ];

  function toggleGame(gKey) {
    setNotifGames((p) => ({ ...p, [gKey]: { ...p[gKey], on: !p[gKey].on } }));
  }
  function toggleRegion(gKey, rKey) {
    setNotifGames((p) => ({ ...p, [gKey]: { ...p[gKey], regions: { ...p[gKey].regions, [rKey]: !p[gKey].regions[rKey] } } }));
  }

  const sectionStyle = { background: "#181818", borderRadius: "16px", overflow: "hidden" };
  const rowStyle = { padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" };
  const labelStyle = { color: "#fff", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: "12px" };
  const chevStyle = { color: "#555", transition: "transform 0.2s" };

  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#111", maxHeight: "88%" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.settingsTitle}</h2>
          <button onClick={onClose}><X size={20} color="#999" /></button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-6" style={{ flex: 1 }}>

          {/* COMPTE */}
          <div style={sectionStyle} className="mb-3">
            <button onClick={() => setActiveSection(activeSection === "account" ? null : "account")} style={rowStyle} className="w-full">
              <span style={labelStyle}><User size={18} color="#CCF71D" />{T.settingsAccount}</span>
              <ChevronDown size={16} style={{ ...chevStyle, transform: activeSection === "account" ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>
            {activeSection === "account" && (
              <div className="px-4 pb-4" style={{ borderTop: "1px solid #262626" }}>
                <div className="mt-3">
                  <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{T.settingsPseudo}</p>
                  <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: "#222", border: "1px solid #2a2a2a" }}>
                    <User size={14} color="#666" />
                    <input value={profile?.pseudo || ""} readOnly className="flex-1" style={{ background: "transparent", color: "#fff", fontSize: "13px", padding: "10px 0", outline: "none", border: "none" }} />
                  </div>
                </div>
                <div className="mt-3">
                  <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{T.settingsEmail}</p>
                  <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: "#1e1e1e", border: "1px solid #222" }}>
                    <Mail size={14} color="#555" />
                    <input value="—" readOnly className="flex-1" style={{ background: "transparent", color: "#666", fontSize: "13px", padding: "10px 0", outline: "none", border: "none" }} />
                  </div>
                </div>
                <div className="mt-3">
                  <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{T.settingsPassword}</p>
                  <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: "#222", border: "1px solid #2a2a2a" }}>
                    <Lock size={14} color="#666" />
                    <input type={showPwd ? "text" : "password"} value="password" readOnly className="flex-1" style={{ background: "transparent", color: "#888", fontSize: "13px", padding: "10px 0", outline: "none", border: "none" }} />
                    <button onClick={() => setShowPwd(!showPwd)} style={{ padding: 4 }}>
                      {showPwd ? <EyeOff size={16} color="#666" /> : <Eye size={16} color="#666" />}
                    </button>
                  </div>
                  <button onClick={() => setForgotMsg(true)} style={{ color: "#CCF71D", fontSize: "12px", fontWeight: 600, marginTop: 8, background: "none", border: "none" }}>
                    {T.settingsForgotPwd}
                  </button>
                  {forgotMsg && <p style={{ color: "#888", fontSize: "11px", marginTop: 4 }}>{T.settingsForgotSent}</p>}
                </div>
              </div>
            )}
          </div>

          {/* FORFAIT */}
          <div style={sectionStyle} className="mb-3">
            <button onClick={() => setActiveSection(activeSection === "plan" ? null : "plan")} style={rowStyle} className="w-full">
              <span style={labelStyle}><CreditCard size={18} color="#CCF71D" />{T.settingsPlan}</span>
              <div className="flex items-center gap-2">
                <span style={{ color: "#CCF71D", fontSize: "12px", fontWeight: 700, background: "rgba(204,247,29,0.12)", padding: "3px 10px", borderRadius: 9999 }}>{T.settingsPlanFree}</span>
                <ChevronDown size={16} style={{ ...chevStyle, transform: activeSection === "plan" ? "rotate(180deg)" : "rotate(0deg)" }} />
              </div>
            </button>
            {activeSection === "plan" && (
              <div className="px-4 pb-4" style={{ borderTop: "1px solid #262626" }}>
                <p style={{ color: "#888", fontSize: "13px", marginTop: 12 }}>{T.settingsPlanDesc}</p>
              </div>
            )}
          </div>

          {/* NOTIFICATIONS */}
          <div style={sectionStyle} className="mb-3">
            <button onClick={() => setActiveSection(activeSection === "notif" ? null : "notif")} style={rowStyle} className="w-full">
              <span style={labelStyle}><Bell size={18} color="#CCF71D" />{T.settingsNotifications}</span>
              <ChevronDown size={16} style={{ ...chevStyle, transform: activeSection === "notif" ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>
            {activeSection === "notif" && (
              <div className="px-4 pb-4" style={{ borderTop: "1px solid #262626" }}>
                <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10, marginBottom: 8 }}>{T.settingsNotifGames}</p>
                <div className="flex flex-col gap-3 mb-4">
                  {GAMES.map((g) => {
                    const gState = notifGames[g.key] || { on: false, regions: {}, stages: {} };
                    return (
                      <div key={g.key} className="rounded-xl overflow-hidden" style={{ background: "#222", border: gState.on ? `1px solid ${g.accent}33` : "1px solid #2a2a2a" }}>
                        <button onClick={() => toggleGame(g.key)} className="flex items-center justify-between w-full px-3 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <img src={g.img} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
                            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{g.label}</span>
                          </span>
                          <span className="rounded-full" style={{ width: 36, height: 20, background: gState.on ? g.accent : "#333", position: "relative", transition: "background 0.2s" }}>
                            <span className="rounded-full" style={{ width: 16, height: 16, background: "#fff", position: "absolute", top: 2, left: gState.on ? 18 : 2, transition: "left 0.2s" }} />
                          </span>
                        </button>
                        {gState.on && (
                          <div className="px-3 pb-2.5" style={{ borderTop: "1px solid #2a2a2a" }}>
                            <p style={{ color: "#555", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 8, marginBottom: 6 }}>{T.settingsNotifRegions}</p>
                            <div className="flex flex-wrap gap-2">
                              {g.regions.map((r) => (
                                <button key={r.key} onClick={() => toggleRegion(g.key, r.key)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: gState.regions[r.key] ? `${r.accent}22` : "#2a2a2a", border: gState.regions[r.key] ? `1px solid ${r.accent}` : "1px solid #333" }}>
                                  <span style={{ width: 6, height: 6, borderRadius: 9999, background: r.accent, display: "inline-block" }} />
                                  <span style={{ color: gState.regions[r.key] ? r.accent : "#888", fontSize: "11px", fontWeight: 600 }}>{r.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{T.settingsFavTeam}</p>
                <select value={favoriteTeam} onChange={(e) => setFavoriteTeam(e.target.value)} className="w-full rounded-xl" style={{ background: "#222", color: "#fff", fontSize: "13px", padding: "10px 12px", border: "1px solid #2a2a2a" }}>
                  <option value="">{T.settingsFavTeamNone}</option>
                  {allTeams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* RÉCOMPENSES */}
          <div style={sectionStyle} className="mb-3">
            <button onClick={() => setActiveSection(activeSection === "rewards" ? null : "rewards")} style={rowStyle} className="w-full">
              <span style={labelStyle}><Gift size={18} color="#CCF71D" />{T.settingsRewards}</span>
              <ChevronDown size={16} style={{ ...chevStyle, transform: activeSection === "rewards" ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>
            {activeSection === "rewards" && (
              <div className="px-4 pb-4" style={{ borderTop: "1px solid #262626" }}>
                <p style={{ color: "#888", fontSize: "13px", marginTop: 12 }}>{T.settingsRewardsDesc}</p>
              </div>
            )}
          </div>

          {/* DÉCONNEXION */}
          <div style={sectionStyle}>
            <button style={{ ...rowStyle, cursor: "pointer" }} className="w-full">
              <span style={{ ...labelStyle, color: "#ff4655" }}><LogOut size={18} color="#ff4655" />{T.settingsLogout}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function CalendarModal({ onClose, T, lang }) {
  const [expanded, setExpanded] = useState({});
  const timeline = TIMELINE_I18N[lang] || TIMELINE_I18N.fr;
  const todayISO = getTodayISO();
  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl flex flex-col" style={{ background: "#111", maxHeight: "88%", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ flexShrink: 0 }}>
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.calendarModalTitle}</h2>
          <button onClick={onClose}><X size={20} color="#999" /></button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-5" style={{ flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          {timeline.map((item, idx) => {
            const status = computeStageStatus(item, todayISO); // "done" | "live" | "soon"
            const statusColor = status === "done" ? "#666" : status === "live" ? "#ff3b3b" : "#CCF71D";
            const statusLabel = status === "done" ? T.calendarDone : status === "live" ? T.calendarLive : T.calendarSoon;
            return (
            <div key={item.key} className="flex gap-3 pb-5">
              <div className="flex flex-col items-center">
                <div className="rounded-full" style={{ width: 10, height: 10, background: status === "done" ? "#444" : statusColor, marginTop: 4 }} />
                {idx < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: "#262626", marginTop: 4 }} />}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-white" style={{ fontSize: status === "live" ? "22px" : "14px" }}>{item.title}</span>
                  <span style={{ fontSize: "9px", fontWeight: 700, color: statusColor, border: "1px solid " + statusColor + "55", borderRadius: "9999px", padding: "2px 8px", textTransform: "uppercase" }}>
                    {statusLabel}
                  </span>
                </div>
                {status === "live" && (
                  <div className="flex gap-1 mt-1.5 mb-1">
                    {REGIONS.map((r) => <span key={r.key} style={{ width: 6, height: 6, borderRadius: 9999, background: r.accent, display: "inline-block" }} />)}
                  </div>
                )}
                <p style={{ color: "#888", fontSize: "12px" }} className="mt-1">{item.range}</p>
                {item.detail && (
                  <>
                    <button onClick={() => setExpanded((p) => ({ ...p, [item.key]: !p[item.key] }))} className="flex items-center gap-1 mt-2" style={{ color: "#CCF71D", fontSize: "11px", fontWeight: 700 }}>
                      {expanded[item.key] ? T.calendarHideDetail : T.calendarShowDetail}
                      <ChevronDown size={12} style={{ transform: expanded[item.key] ? "rotate(180deg)" : "rotate(0deg)" }} />
                    </button>
                    {expanded[item.key] && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {item.detail.map((d) => {
                          const reg = REGIONS.find((r) => r.key === d.region);
                          return (
                            <div key={d.region} className="flex items-center justify-between rounded-lg px-3 py-1.5" style={{ background: "#181818" }}>
                              <span style={{ color: reg ? reg.accent : "#fff", fontSize: "11px", fontWeight: 700 }}>{reg ? regionLabel(reg.key, T) : d.region}</span>
                              <span style={{ color: "#999", fontSize: "11px" }}>{d.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CS2_TIMELINE_I18N = {
  fr: [
    { key: "s1-quals", title: "Stage 1 — Qualifications", start: "2026-01-20", end: "2026-03-09", range: "Janvier – Mars 2026", big: true, detail: [
      { region: "EUROPE", text: "20 janv. – 9 mars" }, { region: "AMERICAS", text: "22 janv. – 8 mars" }, { region: "ASIA", text: "25 janv. – 2 mars" } ] },
    { key: "iem-katowice", title: "IEM Katowice", start: "2026-02-05", end: "2026-02-16", range: "5 – 16 févr. 2026 · Pologne" },
    { key: "major-1", title: "PGL Major", start: "2026-03-20", end: "2026-04-06", range: "20 mars – 6 avr. 2026 · Copenhague" },
    { key: "s2-quals", title: "Stage 2 — Qualifications", start: "2026-04-20", end: "2026-06-15", range: "Avril – Juin 2026", big: true, detail: [
      { region: "EUROPE", text: "20 avr. – 15 juin" }, { region: "AMERICAS", text: "22 avr. – 14 juin" }, { region: "ASIA", text: "25 avr. – 8 juin" } ] },
    { key: "iem-cologne", title: "IEM Cologne", start: "2026-07-07", end: "2026-07-20", range: "7 – 20 juil. 2026 · Allemagne" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-10", end: "2026-09-07", range: "Août – Septembre 2026", big: true, detail: [
      { region: "EUROPE", text: "10 – 24 août" }, { region: "AMERICAS", text: "17 – 31 août" }, { region: "ASIA", text: "24 août – 7 sept." } ] },
    { key: "major-2", title: "Major Champions", start: "2026-10-01", end: "2026-10-19", range: "1 – 19 oct. 2026" },
  ],
  en: [
    { key: "s1-quals", title: "Stage 1 — Qualifiers", start: "2026-01-20", end: "2026-03-09", range: "January – March 2026", big: true, detail: [
      { region: "EUROPE", text: "Jan 20 – Mar 9" }, { region: "AMERICAS", text: "Jan 22 – Mar 8" }, { region: "ASIA", text: "Jan 25 – Mar 2" } ] },
    { key: "iem-katowice", title: "IEM Katowice", start: "2026-02-05", end: "2026-02-16", range: "Feb 5–16, 2026 · Poland" },
    { key: "major-1", title: "PGL Major", start: "2026-03-20", end: "2026-04-06", range: "Mar 20 – Apr 6, 2026 · Copenhagen" },
    { key: "s2-quals", title: "Stage 2 — Qualifiers", start: "2026-04-20", end: "2026-06-15", range: "April – June 2026", big: true, detail: [
      { region: "EUROPE", text: "Apr 20 – Jun 15" }, { region: "AMERICAS", text: "Apr 22 – Jun 14" }, { region: "ASIA", text: "Apr 25 – Jun 8" } ] },
    { key: "iem-cologne", title: "IEM Cologne", start: "2026-07-07", end: "2026-07-20", range: "Jul 7–20, 2026 · Germany" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-10", end: "2026-09-07", range: "August – September 2026", big: true, detail: [
      { region: "EUROPE", text: "Aug 10–24" }, { region: "AMERICAS", text: "Aug 17–31" }, { region: "ASIA", text: "Aug 24 – Sep 7" } ] },
    { key: "major-2", title: "Major Champions", start: "2026-10-01", end: "2026-10-19", range: "Oct 1–19, 2026" },
  ],
  es: [
    { key: "s1-quals", title: "Stage 1 — Clasificación", start: "2026-01-20", end: "2026-03-09", range: "Enero – Marzo 2026", big: true, detail: [
      { region: "EUROPE", text: "20 ene. – 9 mar." }, { region: "AMERICAS", text: "22 ene. – 8 mar." }, { region: "ASIA", text: "25 ene. – 2 mar." } ] },
    { key: "iem-katowice", title: "IEM Katowice", start: "2026-02-05", end: "2026-02-16", range: "5 – 16 feb. 2026 · Polonia" },
    { key: "major-1", title: "PGL Major", start: "2026-03-20", end: "2026-04-06", range: "20 mar. – 6 abr. 2026 · Copenhague" },
    { key: "s2-quals", title: "Stage 2 — Clasificación", start: "2026-04-20", end: "2026-06-15", range: "Abril – Junio 2026", big: true, detail: [
      { region: "EUROPE", text: "20 abr. – 15 jun." }, { region: "AMERICAS", text: "22 abr. – 14 jun." }, { region: "ASIA", text: "25 abr. – 8 jun." } ] },
    { key: "iem-cologne", title: "IEM Cologne", start: "2026-07-07", end: "2026-07-20", range: "7 – 20 jul. 2026 · Alemania" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-10", end: "2026-09-07", range: "Agosto – Septiembre 2026", big: true, detail: [
      { region: "EUROPE", text: "10 – 24 ago." }, { region: "AMERICAS", text: "17 – 31 ago." }, { region: "ASIA", text: "24 ago. – 7 sept." } ] },
    { key: "major-2", title: "Major Champions", start: "2026-10-01", end: "2026-10-19", range: "1 – 19 oct. 2026" },
  ],
  it: [
    { key: "s1-quals", title: "Stage 1 — Qualificazioni", start: "2026-01-20", end: "2026-03-09", range: "Gennaio – Marzo 2026", big: true, detail: [
      { region: "EUROPE", text: "20 gen – 9 mar" }, { region: "AMERICAS", text: "22 gen – 8 mar" }, { region: "ASIA", text: "25 gen – 2 mar" } ] },
    { key: "iem-katowice", title: "IEM Katowice", start: "2026-02-05", end: "2026-02-16", range: "5 – 16 feb 2026 · Polonia" },
    { key: "major-1", title: "PGL Major", start: "2026-03-20", end: "2026-04-06", range: "20 mar – 6 apr 2026 · Copenaghen" },
    { key: "s2-quals", title: "Stage 2 — Qualificazioni", start: "2026-04-20", end: "2026-06-15", range: "Aprile – Giugno 2026", big: true, detail: [
      { region: "EUROPE", text: "20 apr – 15 giu" }, { region: "AMERICAS", text: "22 apr – 14 giu" }, { region: "ASIA", text: "25 apr – 8 giu" } ] },
    { key: "iem-cologne", title: "IEM Cologne", start: "2026-07-07", end: "2026-07-20", range: "7 – 20 lug 2026 · Germania" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-10", end: "2026-09-07", range: "Agosto – Settembre 2026", big: true, detail: [
      { region: "EUROPE", text: "10 – 24 ago" }, { region: "AMERICAS", text: "17 – 31 ago" }, { region: "ASIA", text: "24 ago – 7 set" } ] },
    { key: "major-2", title: "Major Champions", start: "2026-10-01", end: "2026-10-19", range: "1 – 19 ott 2026" },
  ],
  de: [
    { key: "s1-quals", title: "Stage 1 — Qualifikation", start: "2026-01-20", end: "2026-03-09", range: "Januar – März 2026", big: true, detail: [
      { region: "EUROPE", text: "20. Jan. – 9. März" }, { region: "AMERICAS", text: "22. Jan. – 8. März" }, { region: "ASIA", text: "25. Jan. – 2. März" } ] },
    { key: "iem-katowice", title: "IEM Katowice", start: "2026-02-05", end: "2026-02-16", range: "5. – 16. Feb. 2026 · Polen" },
    { key: "major-1", title: "PGL Major", start: "2026-03-20", end: "2026-04-06", range: "20. März – 6. Apr. 2026 · Kopenhagen" },
    { key: "s2-quals", title: "Stage 2 — Qualifikation", start: "2026-04-20", end: "2026-06-15", range: "April – Juni 2026", big: true, detail: [
      { region: "EUROPE", text: "20. Apr. – 15. Juni" }, { region: "AMERICAS", text: "22. Apr. – 14. Juni" }, { region: "ASIA", text: "25. Apr. – 8. Juni" } ] },
    { key: "iem-cologne", title: "IEM Cologne", start: "2026-07-07", end: "2026-07-20", range: "7. – 20. Juli 2026 · Deutschland" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-10", end: "2026-09-07", range: "August – September 2026", big: true, detail: [
      { region: "EUROPE", text: "10. – 24. Aug." }, { region: "AMERICAS", text: "17. – 31. Aug." }, { region: "ASIA", text: "24. Aug. – 7. Sept." } ] },
    { key: "major-2", title: "Major Champions", start: "2026-10-01", end: "2026-10-19", range: "1. – 19. Okt. 2026" },
  ],
  ja: [
    { key: "s1-quals", title: "Stage 1 — 予選", start: "2026-01-20", end: "2026-03-09", range: "2026年1月~3月", big: true, detail: [
      { region: "EUROPE", text: "1月20日~3月9日" }, { region: "AMERICAS", text: "1月22日~3月8日" }, { region: "ASIA", text: "1月25日~3月2日" } ] },
    { key: "iem-katowice", title: "IEM Katowice", start: "2026-02-05", end: "2026-02-16", range: "2026年2月5日~16日・ポーランド" },
    { key: "major-1", title: "PGL Major", start: "2026-03-20", end: "2026-04-06", range: "2026年3月20日~4月6日・コペンハーゲン" },
    { key: "s2-quals", title: "Stage 2 — 予選", start: "2026-04-20", end: "2026-06-15", range: "2026年4月~6月", big: true, detail: [
      { region: "EUROPE", text: "4月20日~6月15日" }, { region: "AMERICAS", text: "4月22日~6月14日" }, { region: "ASIA", text: "4月25日~6月8日" } ] },
    { key: "iem-cologne", title: "IEM Cologne", start: "2026-07-07", end: "2026-07-20", range: "2026年7月7日~20日・ドイツ" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-10", end: "2026-09-07", range: "2026年8月~9月", big: true, detail: [
      { region: "EUROPE", text: "8月10日~24日" }, { region: "AMERICAS", text: "8月17日~31日" }, { region: "ASIA", text: "8月24日~9月7日" } ] },
    { key: "major-2", title: "Major Champions", start: "2026-10-01", end: "2026-10-19", range: "2026年10月1日~19日" },
  ],
  cn: [
    { key: "s1-quals", title: "Stage 1 — 资格赛", start: "2026-01-20", end: "2026-03-09", range: "2026年1月–3月", big: true, detail: [
      { region: "EUROPE", text: "1月20日–3月9日" }, { region: "AMERICAS", text: "1月22日–3月8日" }, { region: "ASIA", text: "1月25日–3月2日" } ] },
    { key: "iem-katowice", title: "IEM Katowice", start: "2026-02-05", end: "2026-02-16", range: "2026年2月5日–16日·波兰" },
    { key: "major-1", title: "PGL Major", start: "2026-03-20", end: "2026-04-06", range: "2026年3月20日–4月6日·哥本哈根" },
    { key: "s2-quals", title: "Stage 2 — 资格赛", start: "2026-04-20", end: "2026-06-15", range: "2026年4月–6月", big: true, detail: [
      { region: "EUROPE", text: "4月20日–6月15日" }, { region: "AMERICAS", text: "4月22日–6月14日" }, { region: "ASIA", text: "4月25日–6月8日" } ] },
    { key: "iem-cologne", title: "IEM Cologne", start: "2026-07-07", end: "2026-07-20", range: "2026年7月7日–20日·德国" },
    { key: "playoffs", title: "PLAYOFFS", start: "2026-08-10", end: "2026-09-07", range: "2026年8月–9月", big: true, detail: [
      { region: "EUROPE", text: "8月10日–24日" }, { region: "AMERICAS", text: "8月17日–31日" }, { region: "ASIA", text: "8月24日–9月7日" } ] },
    { key: "major-2", title: "Major Champions", start: "2026-10-01", end: "2026-10-19", range: "2026年10月1日–19日" },
  ],
};

function cs2RegionLabel(key, T) {
  if (key === "EUROPE") return T.cs2RegionEurope || "Europe";
  if (key === "AMERICAS") return T.cs2RegionAmericas || "Americas";
  if (key === "ASIA") return T.cs2RegionAsia || "Asia";
  return key;
}

function Cs2CalendarModal({ onClose, T, lang }) {
  const [expanded, setExpanded] = useState({});
  const timeline = CS2_TIMELINE_I18N[lang] || CS2_TIMELINE_I18N.fr;
  const todayISO = getTodayISO();

  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#111", maxHeight: "88%" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.cs2CalendarModalTitle}</h2>
          <button onClick={onClose}><X size={20} color="#999" /></button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-5" style={{ flex: 1 }}>
          {timeline.map((item, idx) => {
            const status = computeStageStatus(item, todayISO);
            const statusColor = status === "done" ? "#666" : status === "live" ? "#ff3b3b" : "#CCF71D";
            const statusLabel = status === "done" ? T.calendarDone : status === "live" ? T.calendarLive : T.calendarSoon;
            return (
              <div key={item.key} className="flex gap-3 pb-5">
                <div className="flex flex-col items-center">
                  <div className="rounded-full" style={{ width: 10, height: 10, background: status === "done" ? "#444" : statusColor, marginTop: 4 }} />
                  {idx < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: "#262626", marginTop: 4 }} />}
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white" style={{ fontSize: status === "live" ? "22px" : "14px" }}>{item.title}</span>
                    <span style={{ fontSize: "9px", fontWeight: 700, color: statusColor, border: "1px solid " + statusColor + "55", borderRadius: "9999px", padding: "2px 8px", textTransform: "uppercase" }}>
                      {statusLabel}
                    </span>
                  </div>
                  {status === "live" && (
                    <div className="flex gap-1 mt-1.5 mb-1">
                      {REGIONS_CS2.map((r) => <span key={r.key} style={{ width: 6, height: 6, borderRadius: 9999, background: r.accent, display: "inline-block" }} />)}
                    </div>
                  )}
                  <p style={{ color: "#888", fontSize: "12px" }} className="mt-1">{item.range}</p>
                  {item.detail && (
                    <>
                      <button onClick={() => setExpanded((p) => ({ ...p, [item.key]: !p[item.key] }))} className="flex items-center gap-1 mt-2" style={{ color: "#CCF71D", fontSize: "11px", fontWeight: 700 }}>
                        {expanded[item.key] ? T.calendarHideDetail : T.calendarShowDetail}
                        <ChevronDown size={12} style={{ transform: expanded[item.key] ? "rotate(180deg)" : "rotate(0deg)" }} />
                      </button>
                      {expanded[item.key] && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {item.detail.map((d) => {
                            const reg = REGIONS_CS2.find((r) => r.key === d.region);
                            return (
                              <div key={d.region} className="flex items-center justify-between rounded-lg px-3 py-1.5" style={{ background: "#181818" }}>
                                <span style={{ color: reg ? reg.accent : "#fff", fontSize: "11px", fontWeight: 700 }}>{cs2RegionLabel(d.region, T)}</span>
                                <span style={{ color: "#999", fontSize: "11px" }}>{d.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TopHeader({ isLight, onOpenLang, currentLang, onOpenSettings }) {
  const lang = LANGS.find((l) => l.code === currentLang);
  return (
    <div className="flex items-center justify-between px-4 py-2.5 relative z-20" style={{ background: isLight ? "#EDEDED" : "#0a0a0a", borderBottom: "1px solid " + (isLight ? "#ddd" : "#1a1a1a") }}>
      <button onClick={onOpenLang} className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: isLight ? "#fff" : "#181818" }}>
        <span style={{ fontSize: "14px" }}>{lang.flag}</span>
        <span style={{ color: isLight ? "#333" : "#fff", fontSize: "11px", fontWeight: 700 }}>{lang.code.toUpperCase()}</span>
        <ChevronDown size={12} color={isLight ? "#444" : "#888"} />
      </button>
      <img src={SPLIT_LOGO} alt="Split" style={{ height: "35px", objectFit: "contain", filter: isLight ? "invert(1)" : "none" }} />
      <button onClick={onOpenSettings} className="rounded-full p-1.5" style={{ background: isLight ? "#fff" : "#181818" }}>
        <Settings size={16} color={isLight ? "#444" : "#ccc"} />
      </button>
    </div>
  );
}

function ScrollToTopButton({ visible, onClick }) {
  return (
    <button
      onClick={onClick}
      className="absolute rounded-full flex items-center justify-center"
      style={{
        right: "16px",
        bottom: "130px",
        width: "40px",
        height: "40px",
        background: "#CCF71D",
        zIndex: 40,
        boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 1s ease, transform 1s ease",
      }}
    >
      <ChevronUp size={20} color="#000" strokeWidth={2.6} />
    </button>
  );
}

export default function ClutchApp() {
  const [activeTab, setActiveTab] = useState("home");
  // Toutes les régions sélectionnées par défaut au chargement (même logique
  // que CS2 ci-dessous) — pas de raison de partir filtré sur EMEA seul.
  const [selectedRegions, setSelectedRegions] = useState(REGIONS.map((r) => r.key));
  const [preAllRegions, setPreAllRegions] = useState(REGIONS.map((r) => r.key));
  // Sélection région CS2 : état séparé de Valorant (valeurs différentes —
  // EUROPE/AMERICAS/ASIA), mais même mécanique de toggle (cf toggleRegionCS2
  // plus bas). Toutes sélectionnées par défaut : contrairement à VCT, les
  // stages CS2 mélangent les régions, donc pas de raison de partir filtré.
  const [selectedRegionsCS2, setSelectedRegionsCS2] = useState(REGIONS_CS2.map((r) => r.key));
  const [preAllRegionsCS2, setPreAllRegionsCS2] = useState(REGIONS_CS2.map((r) => r.key));
  const [selectedRegionsRL, setSelectedRegionsRL] = useState(REGIONS_RL.map((r) => r.key));
  const [preAllRegionsRL, setPreAllRegionsRL] = useState(REGIONS_RL.map((r) => r.key));
  const [valoStatus, setValoStatus] = useState(["upcoming"]);
  const [cs2Status, setCs2Status] = useState(["upcoming"]);
  const [rlStatus, setRlStatus] = useState(["upcoming"]);
  const [selectedCats, setSelectedCats] = useState(["VALORANT"]);
  const [preAllCats, setPreAllCats] = useState(["VALORANT"]);
  // Prédictions + points persistés en local (localStorage) : pas encore de
  // compte utilisateur (connexion à ajouter plus tard), donc on garde tout
  // rattaché à cet appareil pour l'instant. Le jour où l'auth arrive, il
  // suffira de remplacer ce stockage local par un appel serveur par utilisateur,
  // la logique de calcul des points (calcMatchPoints) ne change pas.
  const [predictions, setPredictions] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("split_predictions") || "{}");
      // Les rectangles de détail (scores par map) ne doivent jamais rester
      // ouverts après un reload : on repart toujours fermé, le reste de la
      // prédiction (scores saisis, odds...) est conservé tel quel.
      const reset = {};
      for (const [id, pred] of Object.entries(stored)) {
        reset[id] = { ...pred, expanded: false };
      }
      return reset;
    } catch (e) {
      return {};
    }
  });
  const [userPoints, setUserPoints] = useState(() => {
    const raw = parseInt(localStorage.getItem("split_points_total") || "0", 10);
    return Number.isNaN(raw) ? 0 : raw;
  });
  const [settledMatchIds, setSettledMatchIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("split_settled_matches") || "[]"));
    } catch (e) {
      return new Set();
    }
  });

  const [questState, setQuestState] = useState(() => assignDailyQuests(new Set()));
  const questMatchRefDone = useRef(false);
  const questSlotRef = useRef(halfDaySlot());
  useEffect(() => {
    const iv = setInterval(() => {
      const slot = halfDaySlot();
      if (slot !== questSlotRef.current) {
        questSlotRef.current = slot;
        const fresh = assignDailyQuests(new Set());
        setQuestState(fresh);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);
  const [streak, setStreak] = useState(() => {
    const checked = checkStreakExpiry();
    return checked;
  });
  const [showQuestModal, setShowQuestModal] = useState(false);
  const [showRewardsModal, setShowRewardsModal] = useState(false);
  const [streakPopup, setStreakPopup] = useState(null);
  const [userXp, setUserXp] = useState(() => loadXp());
  const [xpPopup, setXpPopup] = useState(null);
  const [streakExpiredNotif, setStreakExpiredNotif] = useState(null);
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  useEffect(() => {
    if (streak.justExpired) {
      const t = setTimeout(() => setStreakExpiredNotif({ lostStreak: streak.lostStreak }), 1500);
      return () => clearTimeout(t);
    }
  }, []);
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [splashFading, setSplashFading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    localStorage.setItem("split_predictions", JSON.stringify(predictions));
  }, [predictions]);

  let activePredCount = 0;
  for (const [id, p] of Object.entries(predictions)) {
    if (!p || p.seriesA === "" || p.seriesB === "") continue;
    if (settledMatchIds.has(id)) continue;
    activePredCount++;
  }
  const remainingPreds = Math.max(0, DAILY_BET_LIMIT - activePredCount);

  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showCs2Calendar, setShowCs2Calendar] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [currentLang, setCurrentLang] = useState("fr");
  const [notifGames, setNotifGames] = useState({
    valorant: { on: false, regions: {}, stages: {} },
    cs2: { on: false, regions: {}, stages: {} },
    rl: { on: false, regions: {}, stages: {} },
  });
  const [matchNotifOverrides, setMatchNotifOverrides] = useState({});
  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("split_profile")); } catch { return null; }
  });
  const [pointsPerGame, setPointsPerGame] = useState(() => {
    try { return JSON.parse(localStorage.getItem("split_points_per_game") || '{"valo":0,"cs2":0,"rl":0}'); } catch { return { valo: 0, cs2: 0, rl: 0 }; }
  });
  const [showProfile, setShowProfile] = useState(false);
  const [profileView, setProfileView] = useState(false);
  const [showFriendModal, setShowFriendModal] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  function syncProfileToBackend(p, pts, ppg, xp) {
    if (!p?.userId) return;
    const equippedTitle = localStorage.getItem("split_equipped_title") || "";
    const equippedBanner = localStorage.getItem("split_equipped_banner_color") || "";
    const equippedBadge = localStorage.getItem("split_equipped_badge") || "";
    const equippedBadgeEmoji = localStorage.getItem("split_equipped_badge_emoji") || "";
    fetch(API_BASE + "/api/social/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.userId, pseudo: p.pseudo, avatar: p.avatar, bio: p.bio, favTeams: p.favTeams, points: pts || 0, pointsPerGame: ppg || pointsPerGame, xp: xp || 0, pseudoColor: p.pseudoColor || null, equippedTitle, equippedBanner, equippedBadge, equippedBadgeEmoji }),
    }).catch(() => {});
  }
  useEffect(() => {
    if (!profile) return;
    if (!profile.userId) {
      const updated = { ...profile, userId: crypto.randomUUID() };
      setProfile(updated);
      localStorage.setItem("split_profile", JSON.stringify(updated));
      syncProfileToBackend(updated, userPoints, pointsPerGame, userXp);
    } else {
      syncProfileToBackend(profile, userPoints, pointsPerGame, userXp);
      fetch(API_BASE + "/api/social/me/" + profile.userId).then(r => r.json()).then(d => {
        if (d.xp && d.xp > userXp) { setUserXp(d.xp); saveXp(d.xp); }
      }).catch(() => {});
    }
    const adminPseudos = ["ggez", "sayzox"];
    if (adminPseudos.includes(profile?.pseudo?.toLowerCase()) && !localStorage.getItem("split_admin_v2_" + profile.pseudo.toLowerCase())) {
      localStorage.setItem("split_admin_v2_" + profile.pseudo.toLowerCase(), "1");
      const adminXp = 50000;
      setUserXp(adminXp); saveXp(adminXp);
      const allTiers = [];
      for (let t = 1; t <= 100; t++) allTiers.push(String(t));
      localStorage.setItem("split_claimed_tiers", JSON.stringify(allTiers));
      const adminInv = [
        { emoji: "🏷️", name: "Rookie", type: "title", rarity: "commun" },
        { emoji: "🏷️", name: "Débutant", type: "title", rarity: "commun" },
        { emoji: "🏷️", name: "Challenger", type: "title", rarity: "commun" },
        { emoji: "🏷️", name: "Vétéran", type: "title", rarity: "rare" },
        { emoji: "🏷️", name: "Expert", type: "title", rarity: "rare" },
        { emoji: "🏷️", name: "GOD Tier", type: "title", rarity: "legendaire" },
        { emoji: "🏷️", name: "GOAT", type: "title", rarity: "legendaire" },
        { emoji: "🖼️", name: "Bannière Setup", type: "banner", bannerImage: "/banner-6.png", rarity: "commun" },
        { emoji: "🖼️", name: "Bannière Sunset", type: "banner", bannerImage: "/banner-10.png", rarity: "commun" },
        { emoji: "🖼️", name: "Bannière Play Grind", type: "banner", bannerImage: "/banner-1.png", rarity: "rare" },
        { emoji: "🖼️", name: "Bannière Speed", type: "banner", bannerImage: "/banner-5.png", rarity: "legendaire" },
        { emoji: "🖼️", name: "Bannière Diamant", type: "banner", bannerImage: "/banner-2.png", rarity: "legendaire" },
        { emoji: "🎴", name: "Fond Match Néon", type: "match_bg", matchBgImage: "/match-bg-1.png", rarity: "commun" },
        { emoji: "🎴", name: "Fond Match Fire", type: "match_bg", matchBgImage: "/match-bg-2.png", rarity: "commun" },
        { emoji: "🎴", name: "Fond Match Galaxy", type: "match_bg", matchBgImage: "/match-bg-3.png", rarity: "rare" },
        { emoji: "🎴", name: "Fond Match Storm", type: "match_bg", matchBgImage: "/match-bg-4.png", rarity: "rare" },
        { emoji: "🎴", name: "Fond Match Cyber", type: "match_bg", matchBgImage: "/match-bg-5.png", rarity: "epique" },
        { emoji: "🎴", name: "Fond Match Aurora", type: "match_bg", matchBgImage: "/match-bg-6.png", rarity: "epique" },
        { emoji: "🎴", name: "Fond Match Blaze", type: "match_bg", matchBgImage: "/match-bg-7.png", rarity: "legendaire" },
        { emoji: "🎴", name: "Fond Match Inferno", type: "match_bg", matchBgImage: "/match-bg-8.png", rarity: "legendaire" },
        { emoji: "🔥", name: "Boost ×2", type: "boost", rarity: "rare" },
        { emoji: "🔥", name: "Boost ×2", type: "boost", rarity: "rare" },
        { emoji: "🔥", name: "Boost ×2", type: "boost", rarity: "rare" },
        { emoji: "⭐", name: "Boost XP +500", type: "xp_bonus", xpAmount: 500, rarity: "rare" },
      ];
      localStorage.setItem("split_inventory", JSON.stringify(adminInv));
      const pseudoLow = profile.pseudo.toLowerCase();
      const adminBgs = [
        { name: "Fond Match Néon", image: "/match-bg-1.png", game: "valo", scope: "all" },
        { name: "Fond Match Galaxy", image: "/match-bg-3.png", game: "cs2", scope: "all" },
        { name: "Fond Match Cyber", image: "/match-bg-5.png", game: "rl", scope: "all" },
      ];
      localStorage.setItem("split_equipped_match_bg", JSON.stringify(adminBgs));
      localStorage.setItem("split_equipped_title", "GOD Tier");
      localStorage.setItem("split_equipped_banner", "Bannière Speed");
      localStorage.setItem("split_equipped_banner_color", "/banner-5.png");
      setTimeout(() => setXpPopup(adminXp), 800);
      if (profile.userId) fetch(API_BASE + "/api/social/xp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: profile.userId, amount: adminXp }) }).catch(() => {});
    }
  }, []);

  const [scoreCats, setScoreCats] = useState(["tout"]);

  const scrollRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const hideTimerRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  function handleContentScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const farEnough = top > 400;
    lastScrollTopRef.current = top;

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (farEnough) {
      setShowScrollTop(true);
      hideTimerRef.current = setTimeout(() => setShowScrollTop(false), 3000);
    } else {
      setShowScrollTop(false);
    }
  }

  function scrollContentToTop() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    setShowScrollTop(false);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [activeTab]);

  useEffect(() => {
    function onCreatePostNav() {
      setActiveTab("classement");
    }
    window.addEventListener("split-create-post", onCreatePostNav);
    return () => window.removeEventListener("split-create-post", onCreatePostNav);
  }, []);

  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [resultsMatches, setResultsMatches] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(false);

  const [cs2UpcomingMatches, setCs2UpcomingMatches] = useState([]);
  const [cs2LiveMatches, setCs2LiveMatches] = useState([]);
  const [cs2ResultsMatches, setCs2ResultsMatches] = useState([]);
  const [cs2DataLoading, setCs2DataLoading] = useState(true);
  const [cs2DataError, setCs2DataError] = useState(false);

  const [rlUpcomingMatches, setRlUpcomingMatches] = useState([]);
  const [rlLiveMatches, setRlLiveMatches] = useState([]);
  const [rlResultsMatches, setRlResultsMatches] = useState([]);
  const [rlDataLoading, setRlDataLoading] = useState(true);
  const [rlDataError, setRlDataError] = useState(false);

  useEffect(() => {
    if (questMatchRefDone.current) return;
    const hasData = upcomingMatches.length || cs2UpcomingMatches.length || rlUpcomingMatches.length;
    if (!hasData) return;
    questMatchRefDone.current = true;
    const saved = loadQuests();
    const slot = halfDaySlot();
    if (saved && saved.lastAssigned === slot && saved.daily.some(q => q.matchId)) return;
    if (saved && saved.lastAssigned === slot) {
      localStorage.removeItem("split_quests");
    }
    const fresh = assignDailyQuests(new Set(), { valo: upcomingMatches, cs2: cs2UpcomingMatches, rl: rlUpcomingMatches });
    setQuestState(fresh);
  }, [upcomingMatches, cs2UpcomingMatches, rlUpcomingMatches]);

  const [vlrEvents, setVlrEvents] = useState({});
  const [showBracketPage, setShowBracketPage] = useState(false);
  const [cs2Events, setCs2Events] = useState(null);
  const [showCs2BracketPage, setShowCs2BracketPage] = useState(false);
  const [prefetchedBrackets, setPrefetchedBrackets] = useState({});

  const T = currentLang === "fr" ? STR.fr : { ...STR.fr, ...(STR[currentLang] || {}) };
  const isLight = false;

  function isMatchNotifOn(matchId, gameKey, matchRegion) {
    if (matchNotifOverrides[matchId] != null) return matchNotifOverrides[matchId];
    const g = notifGames[gameKey];
    if (!g || !g.on) return false;
    if (!matchRegion) return true;
    return !!g.regions[matchRegion];
  }
  function toggleMatchNotif(matchId, currentlyActive) {
    setMatchNotifOverrides((p) => ({ ...p, [matchId]: !currentlyActive }));
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchJson(path) {
      const res = await fetch(API_BASE + path);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }

    async function load() {
      try {
        const [up, li, pa, history] = await Promise.all([
          fetchJson("/api/valorant-upcoming"),
          fetchJson("/api/valorant-live"),
          fetchJson("/api/valorant-results"),
          fetchJson("/api/match-history").catch(() => null),
        ]);
        if (cancelled) return;
        setDataError(false);
        const upT = Array.isArray(up) ? up.map(transformMatch).filter((m) => m.region) : [];
        const liT = Array.isArray(li) ? li.map(transformMatch).filter((m) => m.region) : [];
        const paT = Array.isArray(pa) ? pa.map(transformMatch).filter((m) => m.region) : [];
        const historyT = Array.isArray(history) ? history.map(transformMatch).filter((m) => m.region) : [];
        const finishedMatches = historyT.length > paT.length ? historyT : paT;
        setUpcomingMatches(attachComputedOdds(upT, finishedMatches));
        setLiveMatches(attachComputedOdds(liT, finishedMatches));
        setResultsMatches(
          (() => {
            const eloDataResults = computeEloRatings(finishedMatches, tierWeight);
            return paT.map((m) => {
              const historyWithoutSelf = finishedMatches.filter((h) => String(h.id) !== String(m.id));
              const { odds1, odds2, cote1, cote2, insufficientData } = computeMatchOddsElo(m, historyWithoutSelf, eloDataResults);
              return { ...m, odds1, odds2, cote1, cote2, insufficientData };
            });
          })()
        );
      } catch (e) {
        if (!cancelled) setDataError(true);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Même chose pour CS2, dans un effect séparé (pas de mélange des deux
  // jeux). Différence avec Valorant : /api/cs2-results renvoie déjà
  // l'historique accumulé fusionné côté backend (buildMergedResults dans
  // cs2-routes.js), donc pas besoin d'un 2e appel séparé façon
  // /api/match-history — `pa` fait déjà office de `finishedMatches`.
  useEffect(() => {
    let cancelled = false;

    async function fetchJson(path) {
      const res = await fetch(API_BASE + path);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }

    async function loadCS2() {
      try {
        const [up, li, pa, history] = await Promise.all([
          fetchJson("/api/cs2-upcoming"),
          fetchJson("/api/cs2-live"),
          fetchJson("/api/cs2-results"),
          // Historique profond CS2 (data/matches-cs2.json côté backend, même
          // principe que /api/match-history pour Valorant) — sans ça, le
          // calcul de cotes n'avait que l'historique accumulé organiquement
          // depuis qu'on travaille sur ce projet, bien trop mince pour des
          // winrates fiables. Jamais bloquant : liste vide tant que le
          // backfill n'a pas été fait côté backend.
          fetchJson("/api/cs2-match-history").catch(() => null),
        ]);
        if (cancelled) return;
        setCs2DataError(false);
        const upT = Array.isArray(up) ? up.map(transformMatchCS2) : [];
        const liT = Array.isArray(li) ? li.map(transformMatchCS2) : [];
        const paT = Array.isArray(pa) ? pa.map(transformMatchCS2) : [];
        const historyT = Array.isArray(history) ? history.map(transformMatchCS2) : [];
        const finishedMatchesCS2 = historyT.length > paT.length ? historyT : paT;

        // Déduplique par id (garde la 1ère occurrence) — sinon un même match
        // qui ressort deux fois côté backend (pagination PandaScore instable
        // quand plusieurs matchs partagent le même begin_at) s'affichait en
        // double dans "à venir".
        function dedupeByIdCS2(list) {
          const seen = new Set();
          const out = [];
          for (const m of list) {
            const key = String(m.id);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(m);
          }
          return out;
        }
        // Ne garde que les matchs réellement futurs (begin_at > maintenant)
        // dans "à venir" — un match déjà commencé/terminé ne doit jamais y
        // apparaître, même si PandaScore le renvoie encore sur cet endpoint.
        const now = Date.now();
        const upFuture = dedupeByIdCS2(upT).filter((m) => {
          if (m.score1 != null && m.score2 != null && (m.score1 > 0 || m.score2 > 0)) return false;
          if (m.status === "finished" || m.status === "canceled") return false;
          if (!m.beginAt) return true;
          const t = new Date(m.beginAt).getTime();
          return Number.isNaN(t) || t > now;
        });
        const liDeduped = dedupeByIdCS2(liT);

        setCs2UpcomingMatches(attachComputedOdds(upFuture, finishedMatchesCS2, tierWeightCS2));
        setCs2LiveMatches(attachComputedOdds(liDeduped, finishedMatchesCS2, tierWeightCS2));
        setCs2ResultsMatches(
          (() => {
            const eloDataCS2Results = computeEloRatings(finishedMatchesCS2, tierWeightCS2);
            return paT.map((m) => {
              const historyWithoutSelf = finishedMatchesCS2.filter((h) => String(h.id) !== String(m.id));
              const { odds1, odds2, cote1, cote2, insufficientData } = computeMatchOddsElo(m, historyWithoutSelf, eloDataCS2Results);
              return { ...m, odds1, odds2, cote1, cote2, insufficientData };
            });
          })()
        );
      } catch (e) {
        if (!cancelled) setCs2DataError(true);
      } finally {
        if (!cancelled) setCs2DataLoading(false);
      }
    }

    loadCS2();
    const interval = setInterval(loadCS2, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchJson(path) {
      const res = await fetch(API_BASE + path);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }
    async function loadRL() {
      try {
        const [up, li, pa, history] = await Promise.all([
          fetchJson("/api/rl-upcoming"),
          fetchJson("/api/rl-live"),
          fetchJson("/api/rl-results"),
          fetchJson("/api/rl-match-history").catch(() => null),
        ]);
        if (cancelled) return;
        setRlDataError(false);
        const upT = Array.isArray(up) ? up.map(transformMatchRL) : [];
        const liT = Array.isArray(li) ? li.map(transformMatchRL) : [];
        const paT = Array.isArray(pa) ? pa.map(transformMatchRL) : [];
        const historyT = Array.isArray(history) ? history.map(transformMatchRL) : [];
        const finishedMatchesRL = historyT.length > paT.length ? historyT : paT;

        function dedupeByIdRL(list) {
          const seen = new Set();
          const out = [];
          for (const m of list) {
            const key = String(m.id);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(m);
          }
          return out;
        }
        const now = Date.now();
        const upFuture = dedupeByIdRL(upT).filter((m) => {
          if (m.score1 != null && m.score2 != null && (m.score1 > 0 || m.score2 > 0)) return false;
          if (m.status === "finished" || m.status === "canceled") return false;
          if (!m.beginAt) return true;
          const t = new Date(m.beginAt).getTime();
          return Number.isNaN(t) || t > now;
        });
        const liDeduped = dedupeByIdRL(liT);

        setRlUpcomingMatches(attachComputedOdds(upFuture, finishedMatchesRL, tierWeightRL));
        setRlLiveMatches(attachComputedOdds(liDeduped, finishedMatchesRL, tierWeightRL));
        setRlResultsMatches(
          (() => {
            const eloDataRLResults = computeEloRatings(finishedMatchesRL, tierWeightRL);
            return paT.map((m) => {
              const historyWithoutSelf = finishedMatchesRL.filter((h) => String(h.id) !== String(m.id));
              const { odds1, odds2, cote1, cote2, insufficientData } = computeMatchOddsElo(m, historyWithoutSelf, eloDataRLResults);
              return { ...m, odds1, odds2, cote1, cote2, insufficientData };
            });
          })()
        );
      } catch (e) {
        if (!cancelled) setRlDataError(true);
      } finally {
        if (!cancelled) setRlDataLoading(false);
      }
    }
    loadRL();
    const interval = setInterval(loadRL, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    async function loadVlrEvents() {
      try {
        const res = await fetch(API_BASE + "/api/vlr-events");
        if (!res.ok) return;
        const data = await res.json();
        setVlrEvents(data || {});
      } catch (e) { /* silencieux */ }
    }
    loadVlrEvents();
    const interval = setInterval(loadVlrEvents, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadCs2Events() {
      try {
        const res = await fetch(API_BASE + "/api/cs2-events");
        if (!res.ok) return;
        const data = await res.json();
        setCs2Events(data);
      } catch (e) { /* silencieux */ }
    }
    loadCs2Events();
    const interval = setInterval(loadCs2Events, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const [newsImageReady, setNewsImageReady] = useState(false);
  useEffect(() => {
    if (splashDone) return;
    let done = false;
    function tryLoad() {
      const img = new Image();
      img.onload = () => { if (!done) { done = true; setNewsImageReady(true); } };
      img.src = NEWS_IMAGE;
    }
    tryLoad();
    const retry = setInterval(tryLoad, 500);
    const t1 = setTimeout(() => {
      clearInterval(retry);
      setSplashFading(true);
      setTimeout(() => setSplashDone(true), 500);
    }, 2000);
    return () => { clearTimeout(t1); clearInterval(retry); };
  }, [splashDone]);

  useEffect(() => {
    const allMatches = [...upcomingMatches, ...liveMatches, ...resultsMatches, ...cs2UpcomingMatches, ...cs2LiveMatches, ...cs2ResultsMatches, ...rlUpcomingMatches, ...rlLiveMatches, ...rlResultsMatches];
    const urls = new Set();
    for (const m of allMatches) {
      if (m.team1Logo) urls.add(m.team1Logo);
      if (m.team2Logo) urls.add(m.team2Logo);
    }
    for (const url of urls) {
      const img = new Image();
      img.src = url;
    }
  }, [upcomingMatches, liveMatches, resultsMatches, cs2UpcomingMatches, cs2LiveMatches, cs2ResultsMatches, rlUpcomingMatches, rlLiveMatches, rlResultsMatches]);

  useEffect(() => {
    if (!vlrEvents || Object.keys(vlrEvents).length === 0) return;
    const ids = new Set();
    for (const stageKey of ["kickoff", "stage1", "stage2"]) {
      const stageData = vlrEvents[stageKey];
      if (!stageData) continue;
      for (const regionKey of Object.keys(stageData)) {
        const ev = stageData[regionKey];
        if (ev?.event_id) ids.add(ev.event_id);
      }
    }
    if (vlrEvents.masters?.event_id) ids.add(vlrEvents.masters.event_id);
    async function prefetchVlr() {
      await Promise.all([...ids].map(async (id) => {
        try {
          const res = await fetch(API_BASE + "/api/vlr-bracket/" + id);
          if (res.ok) {
            const data = await res.json();
            setPrefetchedBrackets(prev => ({ ...prev, [id + ":all"]: data }));
          }
        } catch (e) { /* silent */ }
      }));
    }
    prefetchVlr();
    const interval = setInterval(prefetchVlr, 45000);
    return () => clearInterval(interval);
  }, [vlrEvents]);

  useEffect(() => {
    if (!cs2Events) return;
    const allSeries = [];
    for (const bucket of Object.values(cs2Events)) {
      if (Array.isArray(bucket)) {
        for (const s of bucket) {
          if (s.serie_id && (s.status === "running" || s.status === "upcoming")) {
            allSeries.push(s.serie_id);
          }
        }
      }
    }
    if (allSeries.length === 0) return;
    async function prefetchCs2() {
      await Promise.all(allSeries.map(async (sid) => {
        try {
          const res = await fetch(API_BASE + "/api/cs2-bracket/" + sid);
          if (res.ok) {
            const data = await res.json();
            setPrefetchedBrackets(prev => ({ ...prev, ["cs2:" + sid]: data }));
          }
        } catch (e) { /* silent */ }
      }));
    }
    prefetchCs2();
    const interval = setInterval(prefetchCs2, 45000);
    return () => clearInterval(interval);
  }, [cs2Events]);

  const allTeams = React.useMemo(() => {
    const set = [];
    [...upcomingMatches, ...liveMatches, ...resultsMatches].forEach((m) => {
      [m.team1, m.team2].forEach((t) => {
        if (t && t !== "TBD" && set.indexOf(t) === -1) set.push(t);
      });
    });
    return set.sort();
  }, [upcomingMatches, liveMatches, resultsMatches]);

  const cs2AllTeams = React.useMemo(() => {
    const set = [];
    [...cs2UpcomingMatches, ...cs2LiveMatches, ...cs2ResultsMatches].forEach((m) => {
      [m.team1, m.team2].forEach((t) => {
        if (t && t !== "TBD" && set.indexOf(t) === -1) set.push(t);
      });
    });
    return set.sort();
  }, [cs2UpcomingMatches, cs2LiveMatches, cs2ResultsMatches]);

  const rlAllTeams = React.useMemo(() => {
    const set = [];
    [...rlUpcomingMatches, ...rlLiveMatches, ...rlResultsMatches].forEach((m) => {
      [m.team1, m.team2].forEach((t) => {
        if (t && t !== "TBD" && set.indexOf(t) === -1) set.push(t);
      });
    });
    return set.sort();
  }, [rlUpcomingMatches, rlLiveMatches, rlResultsMatches]);

  const profileStats = React.useMemo(() => {
    let exact = 0, bon = 0, parie = 0;
    const history = [];
    for (const id of settledMatchIds) {
      const pred = predictions[id];
      if (!pred || pred.seriesA === "" || pred.seriesB === "") continue;
      const vm = resultsMatches.find((m) => String(m.id) === id);
      const cm = cs2ResultsMatches.find((m) => String(m.id) === id);
      const match = vm || cm;
      if (!match || match.status !== "finished" || match.score1 == null || match.score2 == null) continue;
      parie++;
      const predA = parseInt(pred.seriesA, 10);
      const predB = parseInt(pred.seriesB, 10);
      const predictedAWins = predA > predB;
      const actualAWins = match.score1 > match.score2;
      const pts = calcMatchPoints(match, pred);
      const game = vm ? "valo" : "cs2";
      const isCorrect = predictedAWins === actualAWins;
      if (isCorrect) bon++;
      if (isCorrect && predA === match.score1 && predB === match.score2) exact++;
      if (pts > 0) history.push({ id, game, pts, team1: match.team1 || match.team1Name, team2: match.team2 || match.team2Name, day: match.day });
    }
    history.sort((a, b) => (b.day || "").localeCompare(a.day || ""));
    return { exact, bon, parie, history };
  }, [settledMatchIds, predictions, resultsMatches, cs2ResultsMatches]);

  // Cache logo par équipe (nom complet normalisé -> URL), construit à partir
  // de TOUS les matchs déjà chargés (à venir/live/résultats). Sert de secours
  // quand PandaScore renvoie image_url: null pour un match "juste terminé"
  // (leur cache met parfois du temps à suivre) alors que la même équipe a
  // déjà un logo connu ailleurs (voir MatchCard).
  const teamLogoCache = React.useMemo(() => {
    const map = {};
    for (const m of [...upcomingMatches, ...liveMatches, ...resultsMatches]) {
      if (m.team1Logo && m.team1Name) map[normTeamName(m.team1Name)] = m.team1Logo;
      if (m.team2Logo && m.team2Name) map[normTeamName(m.team2Name)] = m.team2Logo;
    }
    return map;
  }, [upcomingMatches, liveMatches, resultsMatches]);

  // Même cache logo, séparé pour CS2 (mêmes matchs que ceux passés à Cs2Tab).
  const cs2TeamLogoCache = React.useMemo(() => {
    const map = {};
    for (const m of [...cs2UpcomingMatches, ...cs2LiveMatches, ...cs2ResultsMatches]) {
      if (m.team1Logo && m.team1Name) map[normTeamName(m.team1Name)] = m.team1Logo;
      if (m.team2Logo && m.team2Name) map[normTeamName(m.team2Name)] = m.team2Logo;
    }
    return map;
  }, [cs2UpcomingMatches, cs2LiveMatches, cs2ResultsMatches]);

  const rlTeamLogoCache = React.useMemo(() => {
    const map = {};
    for (const m of [...rlUpcomingMatches, ...rlLiveMatches, ...rlResultsMatches]) {
      if (m.team1Logo && m.team1Name) map[normTeamName(m.team1Name)] = m.team1Logo;
      if (m.team2Logo && m.team2Name) map[normTeamName(m.team2Name)] = m.team2Logo;
    }
    return map;
  }, [rlUpcomingMatches, rlLiveMatches, rlResultsMatches]);

  function toggleRegion(key) {
    const allKeys = REGIONS.map((r) => r.key);
    if (key === "ALL") {
      const isAllSelected = selectedRegions.length === allKeys.length;
      if (isAllSelected) {
        setSelectedRegions(preAllRegions.length ? preAllRegions : ["EMEA"]);
      } else {
        setPreAllRegions(selectedRegions);
        setSelectedRegions(allKeys);
      }
    } else {
      setSelectedRegions((prev) => {
        if (prev.includes(key)) {
          if (prev.length === 1) return prev;
          return prev.filter((k) => k !== key);
        }
        return [...prev, key];
      });
    }
  }

  // Même mécanique que toggleRegion, appliquée à REGIONS_CS2 (Europe/
  // Americas/Asia) et à son propre état (selectedRegionsCS2).
  function toggleRegionCS2(key) {
    const allKeys = REGIONS_CS2.map((r) => r.key);
    if (key === "ALL") {
      const isAllSelected = selectedRegionsCS2.length === allKeys.length;
      if (isAllSelected) {
        setSelectedRegionsCS2(preAllRegionsCS2.length ? preAllRegionsCS2 : [allKeys[0]]);
      } else {
        setPreAllRegionsCS2(selectedRegionsCS2);
        setSelectedRegionsCS2(allKeys);
      }
    } else {
      setSelectedRegionsCS2((prev) => {
        if (prev.includes(key)) {
          if (prev.length === 1) return prev;
          return prev.filter((k) => k !== key);
        }
        return [...prev, key];
      });
    }
  }

  function toggleRegionRL(key) {
    const allKeys = REGIONS_RL.map((r) => r.key);
    if (key === "ALL") {
      const isAllSelected = selectedRegionsRL.length === allKeys.length;
      if (isAllSelected) {
        setSelectedRegionsRL(preAllRegionsRL.length ? preAllRegionsRL : [allKeys[0]]);
      } else {
        setPreAllRegionsRL(selectedRegionsRL);
        setSelectedRegionsRL(allKeys);
      }
    } else {
      setSelectedRegionsRL((prev) => {
        if (prev.includes(key)) {
          if (prev.length === 1) return prev;
          return prev.filter((k) => k !== key);
        }
        return [...prev, key];
      });
    }
  }

  function toggleValoStatus(key) { setValoStatus([key]); }
  function toggleCs2Status(key) { setCs2Status([key]); }
  function toggleRlStatus(key) { setRlStatus([key]); }

  function toggleCat(key) {
    if (key === "ALL") {
      const isAllSelected = selectedCats.length === CATS.length;
      if (isAllSelected) {
        setSelectedCats(preAllCats.length ? preAllCats : ["VALORANT"]);
      } else {
        setPreAllCats(selectedCats);
        setSelectedCats([...CATS]);
      }
    } else {
      setSelectedCats((prev) => {
        if (prev.includes(key)) {
          if (prev.length === 1) return prev;
          return prev.filter((k) => k !== key);
        }
        return [...prev, key];
      });
    }
  }

  function toggleScoreCat(key) {
    setScoreCats([key]);
  }

  function onSeriesChange(matchId, team, digit) {
    setPredictions((prev) => {
      const cur = prev[matchId] || { seriesA: "", seriesB: "", games: [], expanded: false };
      const src = [...upcomingMatches, ...liveMatches, ...cs2UpcomingMatches, ...cs2LiveMatches, ...rlUpcomingMatches, ...rlLiveMatches].find((m) => String(m.id) === String(matchId));
      const bo = src?.number_of_games || 3;
      const validPairs = bo >= 7 ? [[4,0],[4,1],[4,2],[4,3],[3,4],[2,4],[1,4],[0,4]] : bo === 5 ? [[3,0],[3,1],[3,2],[2,3],[1,3],[0,3]] : [[2,0],[2,1],[1,2],[0,2]];
      const hadCompleteBet = cur.seriesA !== "" && cur.seriesB !== "" &&
        validPairs.some(([x,y]) => parseInt(cur.seriesA) === x && parseInt(cur.seriesB) === y);
      const next = { ...cur, [team]: digit };
      const a = next.seriesA;
      const b = next.seriesB;
      if (a !== "" && b !== "") {
        const an = parseInt(a, 10);
        const bn = parseInt(b, 10);
        const ok = validPairs.some(([x, y]) => x === an && y === bn);
        if (ok) {
          const isFirstComplete = !hadCompleteBet;
          if (isFirstComplete) {
            let activeCount = 0;
            for (const [id, p] of Object.entries(prev)) {
              if (!p || p.seriesA === "" || p.seriesB === "") continue;
              if (settledMatchIds.has(id)) continue;
              activeCount++;
            }
            if (activeCount >= DAILY_BET_LIMIT) { setShowLimitPopup(true); return prev; }
            const streakResult = updateStreak();
            setStreak(streakResult);
            if (streakResult.earned) setStreakPopup(streakResult);
            const isValo = upcomingMatches.some(m => String(m.id) === String(matchId)) || liveMatches.some(m => String(m.id) === String(matchId));
            const isCs2 = cs2UpcomingMatches.some(m => String(m.id) === String(matchId)) || cs2LiveMatches.some(m => String(m.id) === String(matchId));
            const isRl = rlUpcomingMatches.some(m => String(m.id) === String(matchId)) || rlLiveMatches.some(m => String(m.id) === String(matchId));
            setQuestState(qs => {
              if (!qs) return qs;
              const newCount = activeCount + 1;
              const inc = (q) => ({ ...q, progress: Math.min(q.progress + 1, q.target), completed: q.progress + 1 >= q.target });
              const updated = { ...qs, daily: qs.daily.map(q => {
                if (q.completed) return q;
                if (q.id === "bet_today" || q.id === "bet_3_matches" || q.id === "bet_4_matches" || q.id === "bet_5_matches") return inc(q);
                if (q.id === "bet_2_games" || q.id === "bet_both_games" || q.id === "bet_all_3_games") {
                  const games = new Set();
                  if (isValo) games.add("valo"); if (isCs2) games.add("cs2"); if (isRl) games.add("rl");
                  return { ...q, progress: Math.min(games.size, q.target), completed: games.size >= q.target };
                }
                if (q.id === "use_all_slots") return { ...q, progress: newCount, completed: newCount >= q.target };
                if (q.id === "bet_cs2" && isCs2) return inc(q);
                if (q.id === "bet_valo" && isValo) return inc(q);
                if (q.id === "bet_rl" && isRl) return inc(q);
                if (q.matchId && String(q.matchId) === String(matchId)) return inc(q);
                return q;
              }), weekly: qs.weekly && !qs.weekly.completed ? (() => {
                const w = qs.weekly;
                if (w.id === "weekly_10_bets" || w.id === "weekly_7_bets" || w.id === "weekly_15_bets" || w.id === "weekly_20_bets") return { ...w, progress: Math.min(w.progress + 1, w.target), completed: w.progress + 1 >= w.target };
                if (w.id === "weekly_3_cs2" && isCs2) return { ...w, progress: Math.min(w.progress + 1, w.target), completed: w.progress + 1 >= w.target };
                if (w.id === "weekly_3_valo" && isValo) return { ...w, progress: Math.min(w.progress + 1, w.target), completed: w.progress + 1 >= w.target };
                return w;
              })() : qs.weekly };
              saveQuests(updated);
              return updated;
            });
          }
          const count = an + bn;
          const games = Array.from({ length: count }, (_, i) => (cur.games && cur.games[i]) || { a: "", b: "" });
          const odds1 = src ? src.odds1 : cur.odds1;
          const odds2 = src ? src.odds2 : cur.odds2;
          return { ...prev, [matchId]: { ...next, games, expanded: true, odds1, odds2 } };
        }
      }
      return { ...prev, [matchId]: next };
    });
  }

  // Calcul pur (aucun state touché ici) : parcourt une liste de résultats et
  // renvoie les paris à régler (nouveaux ids + points à ajouter). Utilisé
  // par les deux effects ci-dessous (Valorant et CS2), qui partagent le même
  // portefeuille de points (settledMatchIds/userPoints) — un seul point
  // total, tous jeux confondus.
  function computeSettlement(resultsList, now) {
    let pointsToAdd = 0;
    const newlySettled = [];
    for (const m of resultsList) {
      if (m.status !== "finished" || m.score1 == null || m.score2 == null) continue;
      if (settledMatchIds.has(String(m.id))) continue;
      const pred = predictions[m.id];
      if (!pred || pred.seriesA === "" || pred.seriesB === "") continue;

      const predictedA = parseInt(pred.seriesA, 10) > parseInt(pred.seriesB, 10);
      const actualA = m.score1 > m.score2;
      const gotTeamRight = predictedA === actualA;
      const hasGamePredictions = gotTeamRight && (pred.games || []).some((g) => g && g.a !== "" && g.b !== "");
      const mapScoresPending = !Array.isArray(m.map_scores);
      if (hasGamePredictions && mapScoresPending) {
        const matchDayMs = m.day ? new Date(m.day + "T00:00:00Z").getTime() : null;
        const withinGracePeriod = matchDayMs && now - matchDayMs < 48 * 60 * 60 * 1000;
        if (withinGracePeriod) continue; // on retentera au prochain poll (60s)
      }

      newlySettled.push(String(m.id));
      pointsToAdd += calcMatchPoints(m, pred);
    }
    return { newlySettled, pointsToAdd };
  }

  function applySettlement(newlySettled, pointsToAdd, game) {
    if (newlySettled.length === 0) return;
    const winsCount = newlySettled.length;
    setSettledMatchIds((prev) => {
      const next = new Set(prev);
      newlySettled.forEach((id) => next.add(id));
      localStorage.setItem("split_settled_matches", JSON.stringify([...next]));
      return next;
    });
    if (pointsToAdd > 0) {
      let newTotal;
      setUserPoints((prev) => {
        newTotal = prev + pointsToAdd;
        localStorage.setItem("split_points_total", String(newTotal));
        return newTotal;
      });
      if (game) {
        setPointsPerGame((prev) => {
          const next = { ...prev, [game]: (prev[game] || 0) + pointsToAdd };
          localStorage.setItem("split_points_per_game", JSON.stringify(next));
          syncProfileToBackend(profile, newTotal, next);
          return next;
        });
      } else {
        syncProfileToBackend(profile, newTotal);
      }
      setQuestState(qs => {
        if (!qs) return qs;
        const updated = { ...qs, daily: qs.daily.map(q => {
          if (q.completed) return q;
          if (q.id === "win_bet" || q.id === "win_2_bets" || q.id === "win_3_bets") {
            const np = Math.min(q.progress + winsCount, q.target);
            return { ...q, progress: np, completed: np >= q.target };
          }
          if (q.id === "exact_score" || q.id === "exact_2") {
            return q;
          }
          return q;
        }), weekly: qs.weekly && !qs.weekly.completed ? (() => {
          const w = qs.weekly;
          if (w.id === "weekly_5_wins" || w.id === "weekly_10_wins") {
            const np = Math.min(w.progress + winsCount, w.target);
            return { ...w, progress: np, completed: np >= w.target };
          }
          return w;
        })() : qs.weekly };
        saveQuests(updated);
        return updated;
      });
    }
  }

  // Dès qu'un match pronostiqué apparaît "finished" côté résultats, on règle
  // le pari une seule fois (settledMatchIds évite de recompter les points à
  // chaque repoll de /api/valorant-results toutes les 60s).
  useEffect(() => {
    if (!resultsMatches.length) return;
    const { newlySettled, pointsToAdd } = computeSettlement(resultsMatches, Date.now());
    applySettlement(newlySettled, pointsToAdd, "valo");
  }, [resultsMatches]);

  useEffect(() => {
    if (!cs2ResultsMatches.length) return;
    const { newlySettled, pointsToAdd } = computeSettlement(cs2ResultsMatches, Date.now());
    applySettlement(newlySettled, pointsToAdd, "cs2");
  }, [cs2ResultsMatches]);

  useEffect(() => {
    if (!resultsMatches.length && !cs2ResultsMatches.length) return;
    const perGame = { valo: 0, cs2: 0, rl: 0 };
    for (const id of settledMatchIds) {
      const pred = predictions[id];
      if (!pred || pred.seriesA === "" || pred.seriesB === "") continue;
      const vm = resultsMatches.find((m) => String(m.id) === id);
      const cm = cs2ResultsMatches.find((m) => String(m.id) === id);
      const match = vm || cm;
      if (!match || match.status !== "finished" || match.score1 == null || match.score2 == null) continue;
      const pts = calcMatchPoints(match, pred);
      if (vm) perGame.valo += pts;
      else if (cm) perGame.cs2 += pts;
    }
    setPointsPerGame(perGame);
    localStorage.setItem("split_points_per_game", JSON.stringify(perGame));
    const recomputedTotal = perGame.valo + perGame.cs2 + perGame.rl;
    setUserPoints(recomputedTotal);
    localStorage.setItem("split_points_total", String(recomputedTotal));
    syncProfileToBackend(profile, recomputedTotal, perGame);
  }, [resultsMatches, cs2ResultsMatches, settledMatchIds]);

  function toggleExpand(matchId) {
    setPredictions((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] || { seriesA: "", seriesB: "", games: [] }), expanded: !(prev[matchId] && prev[matchId].expanded) },
    }));
  }

  function changeScore(matchId, gameIndex, team, value) {
    setPredictions((prev) => {
      const m = prev[matchId];
      if (!m) return prev;
      const games = m.games.map((g, i) => (i === gameIndex ? { ...g, [team]: value } : g));
      return { ...prev, [matchId]: { ...m, games } };
    });
  }

  const navItems = [
    { key: "home", label: T.navHome, Icon: Home },
    { key: "valorant", label: T.navValorant, img: NAV_VALORANT_IMG, imgSize: 34 },
    { key: "csgo", label: T.navCsgo, img: NAV_CSGO_IMG, imgSize: 34 },
    { key: "rocketleague", label: T.navRl, img: NAV_RL_IMG, imgSize: 24 },
    { key: "classement", label: T.navClassement, Icon: Trophy },
  ];

  return (
    <div className="flex items-center justify-center p-4" style={{ background: "#000", minHeight: "700px" }}>
      <div className="relative overflow-hidden flex flex-col" style={{ width: "min(390px, 100%)", height: "min(820px, 92vh)", background: "#000", borderRadius: "44px", boxShadow: "0 0 0 2px #262626, 0 20px 60px rgba(0,0,0,0.6)" }}>

        {!splashDone && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 9999, background: "#000",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            paddingBottom: "60px",
            opacity: splashFading ? 0 : 1, transition: "opacity 0.5s ease-out",
            pointerEvents: splashFading ? "none" : "auto",
          }}>
            <img src={SPLIT_LOGO} alt="Split" style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 32 }} />
            <img src={NEWS_IMAGE} alt="" style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
            <img src={NEWS_EWC_IMAGE} alt="" style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%", background: "#C4F000",
                  animation: "splashPulse 1.2s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                }} />
              ))}
            </div>
            <style>{`
              @keyframes splashPulse {
                0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
                40% { opacity: 1; transform: scale(1.2); }
              }
            `}</style>
          </div>
        )}

        <TopHeader isLight={isLight} onOpenLang={() => setShowLangMenu(true)} currentLang={currentLang} onOpenSettings={() => setShowSettings(true)} />

        <div className="flex-1 relative" style={{ minHeight: 0, overflow: "hidden" }}>
        <div ref={scrollRef} onScroll={handleContentScroll} className="overflow-y-auto no-scrollbar relative" style={{ background: isLight ? "#EDEDED" : "#000", height: "100%" }}>
          <div style={{ display: activeTab === "home" ? "block" : "none" }}>
            <HomeTab setActiveTab={setActiveTab} onOpenCalendar={() => setShowCalendar(true)} onOpenCs2Calendar={() => setShowCs2Calendar(true)} T={T} predictions={predictions} streak={streak} quests={questState} onOpenQuests={() => setShowQuestModal(true)} onOpenRewards={() => setShowRewardsModal(true)} onOpenStreakInfo={() => setShowStreakInfo(true)} onOpenNotifs={() => setShowNotifs(true)} userPoints={userPoints} splashDone={splashDone} userXp={userXp} />
          </div>
          {activeTab === "valorant" && (
            <ValorantTab
              selectedRegions={selectedRegions}
              toggleRegion={toggleRegion}
              selectedStatuses={valoStatus}
              toggleStatus={toggleValoStatus}
              predictions={predictions}
              onSeriesChange={onSeriesChange}
              toggleExpand={toggleExpand}
              changeScore={changeScore}
              T={T}
              lang={currentLang}
              upcoming={upcomingMatches}
              live={liveMatches}
              results={resultsMatches}
              teamLogoCache={teamLogoCache}
              loading={dataLoading}
              error={dataError}
              isMatchNotifOn={(id, region) => isMatchNotifOn(id, "valorant", region)}
              toggleMatchNotif={toggleMatchNotif}
              vlrEvents={vlrEvents}
              showBracketPage={showBracketPage}
              setShowBracketPage={setShowBracketPage}
              remainingPreds={remainingPreds}
              gamePoints={pointsPerGame.valo || 0}
              prefetchedBrackets={prefetchedBrackets}
            />
          )}
          {activeTab === "csgo" && (
            <Cs2Tab
              selectedRegions={selectedRegionsCS2}
              toggleRegion={toggleRegionCS2}
              selectedStatuses={cs2Status}
              toggleStatus={toggleCs2Status}
              predictions={predictions}
              onSeriesChange={onSeriesChange}
              toggleExpand={toggleExpand}
              changeScore={changeScore}
              T={T}
              lang={currentLang}
              upcoming={cs2UpcomingMatches}
              live={cs2LiveMatches}
              results={cs2ResultsMatches}
              teamLogoCache={cs2TeamLogoCache}
              loading={cs2DataLoading}
              error={cs2DataError}
              isMatchNotifOn={(id, region) => isMatchNotifOn(id, "cs2", region)}
              toggleMatchNotif={toggleMatchNotif}
              cs2Events={cs2Events}
              showCs2BracketPage={showCs2BracketPage}
              setShowCs2BracketPage={setShowCs2BracketPage}
              remainingPreds={remainingPreds}
              gamePoints={pointsPerGame.cs2 || 0}
              prefetchedBrackets={prefetchedBrackets}
            />
          )}
          {activeTab === "rocketleague" && (
            <RlTab
              selectedRegions={selectedRegionsRL}
              toggleRegion={toggleRegionRL}
              selectedStatuses={rlStatus}
              toggleStatus={toggleRlStatus}
              T={T}
              lang={currentLang}
              upcoming={rlUpcomingMatches}
              live={rlLiveMatches}
              results={rlResultsMatches}
              loading={rlDataLoading}
              error={rlDataError}
              isMatchNotifOn={(id, region) => isMatchNotifOn(id, "rl", region)}
              toggleMatchNotif={toggleMatchNotif}
              toggleExpand={toggleExpand}
              teamLogoCache={rlTeamLogoCache}
              predictions={predictions}
              onSeriesChange={onSeriesChange}
              changeScore={changeScore}
              remainingPreds={remainingPreds}
              gamePoints={pointsPerGame.rl || 0}
            />
          )}
          {activeTab === "classement" && <ClassementTab T={T} scoreCats={scoreCats} toggleScoreCat={toggleScoreCat} userPoints={userPoints} pointsPerGame={pointsPerGame} profile={profile} onOpenProfile={() => setShowProfile(true)} onEditProfile={() => setShowProfile(true)} profileView={profileView} setProfileView={setProfileView} profileStats={profileStats} onViewMatch={(id, game) => { setProfileView(false); const tab = game === "valo" ? "valorant" : "csgo"; setActiveTab(tab); if (tab === "valorant") setValoStatus(["finished"]); else setCs2Status(["finished"]); }} showFriendModal={showFriendModal} setShowFriendModal={setShowFriendModal} setShowMessages={setShowMessages} />}
        </div>
        {showMessages && <MessagesScreen onClose={() => setShowMessages(false)} T={T} profile={profile} />}
        </div>

        <ScrollToTopButton visible={showScrollTop} onClick={scrollContentToTop} />

        {showQuestModal && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, top: 0, zIndex: 50, background: "#0a0a0a" }}>
            <QuestModal quests={questState} onClose={() => setShowQuestModal(false)} onClaim={(qId, isWeekly, xpAmount) => {
              setQuestState(qs => {
                if (!qs) return qs;
                const updated = isWeekly
                  ? { ...qs, weekly: { ...qs.weekly, claimed: true } }
                  : { ...qs, daily: qs.daily.map(q => q.id === qId ? { ...q, claimed: true } : q) };
                saveQuests(updated);
                return updated;
              });
              const gained = xpAmount || 50;
              setUserXp(prev => { const next = prev + gained; saveXp(next); return next; });
              if (profile?.userId) fetch(API_BASE + "/api/social/xp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: profile.userId, amount: gained }) }).catch(() => {});
              setXpPopup(gained);
            }} T={T} />
          </div>
        )}

        {showRewardsModal && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, top: 0, zIndex: 50, background: "#0a0a0a" }}>
            <RewardsModal onClose={() => setShowRewardsModal(false)} T={T} userXp={userXp} predictions={predictions} upcomingMatches={upcomingMatches} liveMatches={liveMatches} cs2UpcomingMatches={cs2UpcomingMatches} cs2LiveMatches={cs2LiveMatches} rlUpcomingMatches={rlUpcomingMatches} rlLiveMatches={rlLiveMatches} settledMatchIds={settledMatchIds} onAddXp={(amount) => { const next = (userXp || 0) + amount; setUserXp(next); saveXp(next); }} />
          </div>
        )}

        <div className="flex items-stretch justify-around border-t" style={{ background: "#0a0a0a", borderColor: "#2a2a2a", position: "relative", zIndex: 9999 }}>
          {navItems.map((item) => {
            const active = activeTab === item.key;
            const labelColor = active ? "#fff" : "#6b6b6b";
            return (
              <button key={item.key} onClick={() => {
                setShowBracketPage(false); setShowCs2BracketPage(false);
                setShowFriendModal(false); setShowQuestModal(false); setShowRewardsModal(false);
                setProfileView(false);
                setActiveTab(item.key);
              }} className="flex flex-col items-center justify-center flex-1 gap-1 py-2">
                <div style={{ height: "34px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {item.img ? (
                    <img src={item.img} alt={item.label} style={{ width: (item.imgSize || 24) + "px", height: (item.imgSize || 24) + "px", objectFit: "contain", opacity: active ? 1 : 0.42, transition: "opacity 0.15s" }} />
                  ) : (
                    <item.Icon size={24} color={labelColor} strokeWidth={2.2} />
                  )}
                  {item.key === "home" && streak.current > 0 && (
                    <span style={{ position: "absolute", top: -4, right: -12, display: "flex", alignItems: "center", gap: 1, background: "linear-gradient(135deg, #FF6B00, #FF9500)", borderRadius: 8, padding: "1px 5px 1px 3px", fontSize: 9, fontWeight: 900, color: "#fff", lineHeight: 1, boxShadow: "0 2px 6px rgba(255,107,0,0.4)" }}>
                      <span style={{ fontSize: 8 }}>&#x1F525;</span>{streak.current}
                    </span>
                  )}
                </div>
                <span style={{ color: labelColor, fontSize: "10px", fontWeight: active ? 700 : 500 }}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {showLangMenu && <LanguageMenu current={currentLang} onSelect={setCurrentLang} onClose={() => setShowLangMenu(false)} />}
        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            notifGames={notifGames}
            setNotifGames={setNotifGames}
            favoriteTeam={favoriteTeam}
            setFavoriteTeam={setFavoriteTeam}
            teams={allTeams}
            T={T}
            profile={profile}
          />
        )}
        {showProfile && (
          <ProfileSetupModal
            onClose={() => setShowProfile(false)}
            onSave={(p) => { const saved = { ...p, userId: p.userId || profile?.userId || crypto.randomUUID() }; setProfile(saved); localStorage.setItem("split_profile", JSON.stringify(saved)); syncProfileToBackend(saved, userPoints, pointsPerGame, userXp); setShowProfile(false); }}
            profile={profile}
            valoTeams={allTeams}
            cs2Teams={cs2AllTeams}
            rlTeams={rlAllTeams}
            T={T}
          />
        )}
        {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} T={T} lang={currentLang} />}
        {showCs2Calendar && (
          <Cs2CalendarModal
            onClose={() => setShowCs2Calendar(false)}
            T={T}
            lang={currentLang}
          />
        )}
        {streakPopup && <StreakPopup streak={streakPopup} onClose={() => setStreakPopup(null)} T={T} />}
        {xpPopup && <XpPopup xp={xpPopup} onClose={() => setXpPopup(null)} T={T} />}
        {streakExpiredNotif && <StreakExpiredPopup lostStreak={streakExpiredNotif.lostStreak} onClose={() => setStreakExpiredNotif(null)} T={T} />}
        {showStreakInfo && (
          <div style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }} onClick={() => setShowStreakInfo(false)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(340px, 88%)", background: "#0a0a0a", border: "1px solid #262626", borderRadius: 24, padding: "32px 24px 24px", textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: streak.current > 0 ? "linear-gradient(135deg, rgba(255,107,0,0.2), rgba(255,149,0,0.08))" : "rgba(255,255,255,0.03)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", border: streak.current > 0 ? "1px solid rgba(255,149,0,0.2)" : "1px solid #222" }}>
                <span style={{ fontSize: 40, filter: streak.current > 0 ? "drop-shadow(0 0 12px rgba(255,107,0,0.6))" : "none" }}>{streak.current > 0 ? "🔥" : "💤"}</span>
              </div>
              <p style={{ color: streak.current > 0 ? "#FF9500" : "#666", fontSize: 36, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>{streak.current}</p>
              <p style={{ color: streak.current > 0 ? "rgba(255,149,0,0.7)" : "#555", fontSize: 13, fontWeight: 700, marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.08em" }}>{T.streakDays}</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <div style={{ flex: 1, background: "#111", borderRadius: 14, padding: "14px 12px", border: "1px solid #262626" }}>
                  <p style={{ color: "#FFD700", fontSize: 20, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>{streak.best}</p>
                  <p style={{ color: "#555", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{T.streakBest}</p>
                </div>
                <div style={{ flex: 1, background: "#111", borderRadius: 14, padding: "14px 12px", border: "1px solid #262626" }}>
                  <p style={{ color: "#A855F7", fontSize: 20, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>x{Math.max(1, streak.current)}</p>
                  <p style={{ color: "#555", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Bonus</p>
                </div>
              </div>
              <p style={{ color: "#666", fontSize: 12, lineHeight: 1.6, marginBottom: 20 }}>{T.streakExplain}</p>
              <button onClick={() => setShowStreakInfo(false)} style={{ width: "100%", background: streak.current > 0 ? "linear-gradient(135deg, #FF6B00, #FF9500)" : "#222", color: streak.current > 0 ? "#fff" : "#888", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: streak.current > 0 ? "0 4px 16px rgba(255,107,0,0.3)" : "none" }}>OK</button>
            </div>
          </div>
        )}
        {showNotifs && <NotificationsPanel notifications={notifications} onClose={() => setShowNotifs(false)} T={T} />}
        {showLimitPopup && (
          <div style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowLimitPopup(false)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(300px, 80%)", background: "#141414", border: "1px solid #262626", borderRadius: 20, padding: "28px 24px", textAlign: "center" }}>
              <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>🔒</span>
              <p style={{ color: "#fff", fontSize: 15, fontWeight: 900, marginBottom: 10 }}>{T.predLimit}</p>
              <p style={{ color: "#888", fontSize: 12, lineHeight: 1.5 }}>{T.predLimitPopup}</p>
              <button onClick={() => setShowLimitPopup(false)} style={{ marginTop: 20, background: "#262626", color: "#fff", border: "none", borderRadius: 10, padding: "10px 32px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>OK</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .dark-scroll::-webkit-scrollbar { width: 4px; }
        .dark-scroll::-webkit-scrollbar-track { background: transparent; }
        .dark-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .dark-scroll { scrollbar-width: thin; scrollbar-color: #333 transparent; }
        @keyframes pulseLive { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes bracketLivePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes streakSlide { 0% { transform: translateX(-50%) translateY(-30px); opacity: 0; } 100% { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @keyframes streakFade { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes flameGlow { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(255,107,0,0.4)); } 50% { transform: scale(1.15); filter: drop-shadow(0 0 8px rgba(255,107,0,0.7)); } }
        @keyframes scoreReveal { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
