import React, { useState, useEffect, useRef } from "react";
import cs2ManualResults from "./cs2-manual-results.json";
import {
  Home,
  Trophy,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Settings,
  Mail,
  Lock,
  X,
  CalendarDays,
  Chrome,
  Target,
  ChevronUp,
  Play,
} from "lucide-react";

const SPLIT_LOGO = "/split-logo.png";
const NEWS_IMAGE = "/news-image.jpg";

// Logos de catégorie (nav du bas + onglets à venir), dans l'ordre
// Valorant / CS2 / Rocket League — fichiers fournis par l'utilisateur.
const NAV_VALORANT_IMG = "/Valo(1).png";
const NAV_CSGO_IMG = "/Cs2(2).png";
const NAV_RL_IMG = "/Rl(1).png";

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

// Catégories de jeux affichées dans le classement
const CATS = ["VALORANT", "CSGO", "RL"];

// Logos d'équipe personnalisés (fallback si l'API PandaScore n'en fournit pas) ;
// utilisés en priorité sur match.team1Logo/team2Logo quand présents ci-dessous.
const LOGOS = {
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
};

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
    newsLabel: "News", newsBadge: "Annonce", newsTitle: "3 MASTERS EN 2027", newsSub: "Un troisième tournoi Masters s'ajouterait au calendrier de la saison prochaine.",
    classementLabel: "Classement", seeAll: "Tout voir", classementEmptyHome: "0 pronostiqueur classé pour le moment. Sois le premier !",
    calendarLabel: "Calendrier", calendarCardTitle: "Calendrier VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendrier CS2", cs2CalendarCardSub: "Prochains matchs · tous circuits",
    cs2CalendarModalTitle: "Programme CS2 · Kickoff & Playoffs", cs2CalendarEmpty: "Aucun stage Kickoff/Playoffs en cours dans les matchs suivis actuellement.",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronostics BO3 · toutes les ligues",
    regionAll: "Tout", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "Chine",
    cs2Title: "CS2", cs2Subtitle: "Pronostics BO3 · circuit mondial",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    cs2CircuitToggleShow: "Voir le circuit CS2", cs2CircuitToggleHide: "Masquer le circuit",
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
    scoreInvalid: "13 pts min, 2 pts d'écart après 12",
    alreadyWonSuffix: "aurait déjà gagné si tu mets ce score",
    betLocked: "Pari verrouillé — le match a commencé",
    myPoints: "Mes points", myPointsSub: "Pronostics corrects, en attendant la connexion",
    placeholderSoon: "Bientôt disponible. On prépare les pronostics {label}, reviens vite !",
    classementTitle: "Classement", classementSubtitle: "Meilleurs pronostiqueurs de la saison", classementEmptyTitle: "0 utilisateur classé",
    classementEmptySub: "Personne n'a encore fait de pronostic. Sois le premier à grimper au classement !",
    catFilterLabel: "Catégories",
    settingsTitle: "Réglages", settingsNotifTitle: "Notifications par ligue", settingsNotifPrefix: "Valorant ",
    settingsNotifOtherTitle: "Autres notifications",
    settingsNotifEvents: "Événements à venir", settingsNotifBets: "Pronostics réussis",
    settingsNotifMatchStart: "Un match commence", settingsNotifMatchEnd: "Un match est terminé",
    settingsFavTeam: "Équipe favorite", settingsFavTeamNone: "Aucune équipe sélectionnée", settingsAccount: "Compte",
    settingsGoogle: "Continuer avec Google", settingsOr: "ou", settingsEmail: "Adresse e-mail", settingsPassword: "Mot de passe", settingsLogin: "Connexion",
    calendarModalTitle: "Calendrier VCT 2026", calendarDone: "Terminé", calendarSoon: "Bientôt", calendarLive: "En cours",
    calendarShowDetail: "Voir le détail par région", calendarHideDetail: "Masquer le détail",
    statusUpcoming: "Matchs à venir",
    yourBet: "Ton pari", replay: "Replay",
  },
  en: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Standings",
    newsLabel: "News", newsBadge: "Announcement", newsTitle: "3 MASTERS IN 2027", newsSub: "A third Masters tournament could be added to next season's calendar.",
    classementLabel: "Standings", seeAll: "See all", classementEmptyHome: "0 ranked predictors so far. Be the first!",
    calendarLabel: "Calendar", calendarCardTitle: "VCT 2026 Calendar", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2 Calendar", cs2CalendarCardSub: "Upcoming matches · all circuits",
    cs2CalendarModalTitle: "CS2 Program · Kickoff & Playoffs", cs2CalendarEmpty: "No Kickoff/Playoffs stage among the currently tracked matches.",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3 predictions · all leagues",
    regionAll: "All", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    cs2Title: "CS2", cs2Subtitle: "BO3 predictions · worldwide circuit",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    cs2CircuitToggleShow: "View the CS2 circuit", cs2CircuitToggleHide: "Hide the circuit",
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
    scoreInvalid: "13 pts min, 2 pt gap after 12",
    alreadyWonSuffix: "would have already won with this score",
    betLocked: "Bet locked — match has started",
    myPoints: "My points", myPointsSub: "Correct predictions, until login is added",
    placeholderSoon: "Coming soon. We're preparing {label} predictions, check back soon!",
    classementTitle: "Standings", classementSubtitle: "Best predictors of the season", classementEmptyTitle: "0 ranked users",
    classementEmptySub: "No one has made a prediction yet. Be the first to climb the standings!",
    catFilterLabel: "Categories",
    settingsTitle: "Settings", settingsNotifTitle: "Notifications by league", settingsNotifPrefix: "Valorant ",
    settingsNotifOtherTitle: "Other notifications",
    settingsNotifEvents: "Upcoming events", settingsNotifBets: "Successful predictions",
    settingsNotifMatchStart: "A match starts", settingsNotifMatchEnd: "A match has ended",
    settingsFavTeam: "Favorite team", settingsFavTeamNone: "No team selected", settingsAccount: "Account",
    settingsGoogle: "Continue with Google", settingsOr: "or", settingsEmail: "Email address", settingsPassword: "Password", settingsLogin: "Log in",
    calendarModalTitle: "VCT 2026 Calendar", calendarDone: "Finished", calendarSoon: "Coming soon", calendarLive: "Live now",
    calendarShowDetail: "Show detail by region", calendarHideDetail: "Hide detail",
    statusUpcoming: "Upcoming matches",
    yourBet: "Your bet", replay: "Replay",
  },
  es: {
    navHome: "Inicio", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Clasificación",
    newsLabel: "News", newsBadge: "Anuncio", newsTitle: "3 MASTERS EN 2027", newsSub: "Un tercer torneo Masters se añadiría al calendario de la próxima temporada.",
    classementLabel: "Clasificación", seeAll: "Ver todo", classementEmptyHome: "0 pronosticadores clasificados por ahora. ¡Sé el primero!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendario CS2", cs2CalendarCardSub: "Próximos partidos · todos los circuitos",
    cs2CalendarModalTitle: "Programa CS2 · Kickoff y Playoffs", cs2CalendarEmpty: "Ninguna fase Kickoff/Playoffs entre los partidos seguidos actualmente.",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronósticos BO3 · todas las ligas",
    regionAll: "Todo", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    cs2Title: "CS2", cs2Subtitle: "Pronósticos BO3 · circuito mundial",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    cs2CircuitToggleShow: "Ver el circuito CS2", cs2CircuitToggleHide: "Ocultar el circuito",
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
    scoreInvalid: "13 pts mín, 2 pts de diferencia tras 12",
    alreadyWonSuffix: "ya habría ganado con este marcador",
    placeholderSoon: "Próximamente. Estamos preparando los pronósticos de {label}, ¡vuelve pronto!",
    classementTitle: "Clasificación", classementSubtitle: "Mejores pronosticadores de la temporada", classementEmptyTitle: "0 usuarios clasificados",
    classementEmptySub: "Nadie ha hecho un pronóstico todavía. ¡Sé el primero en subir en la clasificación!",
    catFilterLabel: "Categorías",
    settingsTitle: "Ajustes", settingsNotifTitle: "Notificaciones por liga", settingsNotifPrefix: "Valorant ",
    settingsNotifOtherTitle: "Otras notificaciones",
    settingsNotifEvents: "Próximos eventos", settingsNotifBets: "Pronósticos acertados",
    settingsNotifMatchStart: "Un partido empieza", settingsNotifMatchEnd: "Un partido ha terminado",
    settingsFavTeam: "Equipo favorito", settingsFavTeamNone: "Ningún equipo seleccionado", settingsAccount: "Cuenta",
    settingsGoogle: "Continuar con Google", settingsOr: "o", settingsEmail: "Correo electrónico", settingsPassword: "Contraseña", settingsLogin: "Iniciar sesión",
    calendarModalTitle: "Calendario VCT 2026", calendarDone: "Finalizado", calendarSoon: "Próximamente", calendarLive: "En curso",
    calendarShowDetail: "Ver detalle por región", calendarHideDetail: "Ocultar detalle",
    statusUpcoming: "Próximos partidos",
    yourBet: "Tu pronóstico", replay: "Replay",
  },
  it: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Classifica",
    newsLabel: "News", newsBadge: "Annuncio", newsTitle: "3 MASTERS NEL 2027", newsSub: "Un terzo torneo Masters si aggiungerebbe al calendario della prossima stagione.",
    classementLabel: "Classifica", seeAll: "Vedi tutto", classementEmptyHome: "0 pronosticatori in classifica per ora. Sii il primo!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendario CS2", cs2CalendarCardSub: "Prossimi match · tutti i circuiti",
    cs2CalendarModalTitle: "Programma CS2 · Kickoff e Playoffs", cs2CalendarEmpty: "Nessuna fase Kickoff/Playoffs tra i match attualmente seguiti.",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronostici BO3 · tutte le leghe",
    regionAll: "Tutto", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "Cina",
    cs2Title: "CS2", cs2Subtitle: "Pronostici BO3 · circuito mondiale",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    cs2CircuitToggleShow: "Vedi il circuito CS2", cs2CircuitToggleHide: "Nascondi il circuito",
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
    scoreInvalid: "13 pt min, 2 pt di scarto dopo il 12",
    alreadyWonSuffix: "avrebbe già vinto con questo punteggio",
    placeholderSoon: "Presto disponibile. Stiamo preparando i pronostici {label}, torna a trovarci!",
    classementTitle: "Classifica", classementSubtitle: "Migliori pronosticatori della stagione", classementEmptyTitle: "0 utenti in classifica",
    classementEmptySub: "Nessuno ha ancora fatto un pronostico. Sii il primo a scalare la classifica!",
    catFilterLabel: "Categorie",
    settingsTitle: "Impostazioni", settingsNotifTitle: "Notifiche per lega", settingsNotifPrefix: "Valorant ",
    settingsNotifOtherTitle: "Altre notifiche",
    settingsNotifEvents: "Prossimi eventi", settingsNotifBets: "Pronostici vincenti",
    settingsNotifMatchStart: "Una partita inizia", settingsNotifMatchEnd: "Una partita è finita",
    settingsFavTeam: "Squadra preferita", settingsFavTeamNone: "Nessuna squadra selezionata", settingsAccount: "Account",
    settingsGoogle: "Continua con Google", settingsOr: "oppure", settingsEmail: "Indirizzo email", settingsPassword: "Password", settingsLogin: "Accedi",
    calendarModalTitle: "Calendario VCT 2026", calendarDone: "Concluso", calendarSoon: "In arrivo", calendarLive: "In corso",
    calendarShowDetail: "Vedi dettagli per regione", calendarHideDetail: "Nascondi dettagli",
    statusUpcoming: "Prossime partite",
    yourBet: "Il tuo pronostico", replay: "Replay",
  },
  ja: {
    navHome: "ホーム", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "ランキング",
    newsLabel: "ニュース", newsBadge: "お知らせ", newsTitle: "2027年に3つ目のマスターズ", newsSub: "来シーズン、3つ目のマスターズ大会が開催される見込みです。",
    classementLabel: "ランキング", seeAll: "すべて見る", classementEmptyHome: "現在ランキング登録者は0人です。最初の1人になろう!",
    calendarLabel: "カレンダー", calendarCardTitle: "VCT 2026 カレンダー", calendarCardSub: "Kickoff・Masters・Playoffs・Champions",
    cs2CalendarCardTitle: "CS2カレンダー", cs2CalendarCardSub: "今後の試合・全大会",
    cs2CalendarModalTitle: "CS2プログラム・Kickoff & Playoffs", cs2CalendarEmpty: "現在追跡中の試合にKickoff/Playoffsステージはありません。",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3予想・全リーグ",
    regionAll: "すべて", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "中国",
    cs2Title: "CS2", cs2Subtitle: "BO3予想・世界サーキット",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    cs2CircuitToggleShow: "CS2サーキットを見る", cs2CircuitToggleHide: "サーキットを隠す",
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
    scoreInvalid: "13点先取、12点以降は2点差が必要",
    alreadyWonSuffix: "はこのスコアだと既に勝利しています",
    placeholderSoon: "近日公開。{label}の予想機能を準備中です、お楽しみに!",
    classementTitle: "ランキング", classementSubtitle: "シーズン予想王ランキング", classementEmptyTitle: "ランキング登録者0人",
    classementEmptySub: "まだ誰も予想していません。最初にランキングを駆け上がろう!",
    catFilterLabel: "カテゴリー",
    settingsTitle: "設定", settingsNotifTitle: "リーグ別通知", settingsNotifPrefix: "Valorant ",
    settingsNotifOtherTitle: "その他の通知",
    settingsNotifEvents: "今後のイベント", settingsNotifBets: "的中した予想",
    settingsNotifMatchStart: "試合開始", settingsNotifMatchEnd: "試合終了",
    settingsFavTeam: "お気に入りチーム", settingsFavTeamNone: "チーム未選択", settingsAccount: "アカウント",
    settingsGoogle: "Googleで続ける", settingsOr: "または", settingsEmail: "メールアドレス", settingsPassword: "パスワード", settingsLogin: "ログイン",
    calendarModalTitle: "VCT 2026 カレンダー", calendarDone: "終了", calendarSoon: "開催予定", calendarLive: "開催中",
    calendarShowDetail: "地域別の詳細を見る", calendarHideDetail: "詳細を隠す",
    statusUpcoming: "今後の試合",
    yourBet: "あなたの予想", replay: "リプレイ",
  },
  de: {
    navHome: "Start", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "Rangliste",
    newsLabel: "News", newsBadge: "Ankündigung", newsTitle: "3 MASTERS IN 2027", newsSub: "Ein drittes Masters-Turnier soll im Kalender der nächsten Saison hinzukommen.",
    classementLabel: "Rangliste", seeAll: "Alle anzeigen", classementEmptyHome: "Bisher 0 platzierte Tipper. Sei der Erste!",
    calendarLabel: "Kalender", calendarCardTitle: "VCT-2026-Kalender", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2-Kalender", cs2CalendarCardSub: "Kommende Spiele · alle Circuits",
    cs2CalendarModalTitle: "CS2-Programm · Kickoff & Playoffs", cs2CalendarEmpty: "Keine Kickoff-/Playoffs-Phase unter den aktuell verfolgten Spielen.",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3-Tipps · alle Ligen",
    regionAll: "Alle", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    cs2Title: "CS2", cs2Subtitle: "BO3-Tipps · weltweite Circuit",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    cs2CircuitToggleShow: "CS2-Circuit anzeigen", cs2CircuitToggleHide: "Circuit ausblenden",
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
    scoreInvalid: "Mind. 13 Punkte, 2 Punkte Vorsprung nach 12",
    alreadyWonSuffix: "hätte mit diesem Ergebnis bereits gewonnen",
    placeholderSoon: "Bald verfügbar. Wir bereiten die {label}-Tipps vor, schau bald wieder vorbei!",
    classementTitle: "Rangliste", classementSubtitle: "Beste Tipper der Saison", classementEmptyTitle: "0 platzierte Nutzer",
    classementEmptySub: "Noch niemand hat getippt. Sei der Erste in der Rangliste!",
    catFilterLabel: "Kategorien",
    settingsTitle: "Einstellungen", settingsNotifTitle: "Benachrichtigungen je Liga", settingsNotifPrefix: "Valorant ",
    settingsNotifOtherTitle: "Weitere Benachrichtigungen",
    settingsNotifEvents: "Bevorstehende Events", settingsNotifBets: "Erfolgreiche Tipps",
    settingsNotifMatchStart: "Ein Match beginnt", settingsNotifMatchEnd: "Ein Match ist beendet",
    settingsFavTeam: "Lieblingsteam", settingsFavTeamNone: "Kein Team ausgewählt", settingsAccount: "Konto",
    settingsGoogle: "Weiter mit Google", settingsOr: "oder", settingsEmail: "E-Mail-Adresse", settingsPassword: "Passwort", settingsLogin: "Anmelden",
    calendarModalTitle: "VCT-2026-Kalender", calendarDone: "Beendet", calendarSoon: "Bevorstehend", calendarLive: "Läuft gerade",
    calendarShowDetail: "Details nach Region anzeigen", calendarHideDetail: "Details ausblenden",
    statusUpcoming: "Bevorstehende Spiele",
    yourBet: "Dein Tipp", replay: "Replay",
  },
  cn: {
    navHome: "首页", navValorant: "Valorant", navCsgo: "CS2", navRl: "RL", navClassement: "排行榜",
    newsLabel: "资讯", newsBadge: "公告", newsTitle: "2027年将迎来第三场大师赛", newsSub: "下赛季日程中可能新增第三场大师赛(Masters)。",
    classementLabel: "排行榜", seeAll: "查看全部", classementEmptyHome: "目前还没有上榜用户，快来当第一人!",
    calendarLabel: "赛程日历", calendarCardTitle: "VCT 2026赛程日历", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2赛程", cs2CalendarCardSub: "即将进行的比赛 · 全部赛事",
    cs2CalendarModalTitle: "CS2赛程安排 · Kickoff与Playoffs", cs2CalendarEmpty: "当前追踪的比赛中没有Kickoff/Playoffs阶段。",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3竞猜 · 全部赛区",
    regionAll: "全部", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "中国",
    cs2Title: "CS2", cs2Subtitle: "BO3竞猜 · 全球赛事体系",
    cs2RegionEurope: "Europe", cs2RegionAmericas: "Americas", cs2RegionAsia: "Asia",
    cs2CircuitToggleShow: "查看CS2赛事体系", cs2CircuitToggleHide: "隐藏赛事体系",
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
    scoreInvalid: "先得13分，12平后须净胜2分",
    alreadyWonSuffix: "按这个比分已经提前获胜了",
    placeholderSoon: "敬请期待。{label}竞猜功能筹备中，请稍后再来查看!",
    classementTitle: "排行榜", classementSubtitle: "本赛季竞猜达人榜", classementEmptyTitle: "0名上榜用户",
    classementEmptySub: "还没有人做出竞猜，快来抢占排行榜第一名!",
    catFilterLabel: "分类",
    settingsTitle: "设置", settingsNotifTitle: "各赛区通知", settingsNotifPrefix: "Valorant ",
    settingsNotifOtherTitle: "其他通知",
    settingsNotifEvents: "即将开始的活动", settingsNotifBets: "命中的竞猜",
    settingsNotifMatchStart: "比赛开始", settingsNotifMatchEnd: "比赛结束",
    settingsFavTeam: "喜爱的战队", settingsFavTeamNone: "未选择战队", settingsAccount: "账户",
    settingsGoogle: "使用Google继续", settingsOr: "或", settingsEmail: "电子邮箱", settingsPassword: "密码", settingsLogin: "登录",
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
};

// Corrections par nom complet exact : utilisées quand PandaScore ne renvoie
// aucun acronyme ET que le fallback "4 premières lettres" ne donne pas un
// code correct/prévisible (ex. "FUT Esports" -> "FUT " avec un espace en
// trop, qui ne matcherait même pas une entrée dans TEAM_CODE_OVERRIDES).
const NAME_CODE_OVERRIDES = {
  "FUT Esports": "FUT",
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
  if (score1 == null || score2 == null) return true; // pas de score de série à comparer
  let wins1 = 0;
  let wins2 = 0;
  for (const mp of mapScores) {
    if (mp.score1 > mp.score2) wins1++;
    else if (mp.score2 > mp.score1) wins2++;
  }
  return wins1 === score1 && wins2 === score2;
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

function isTbd(m) {
  return m.team1 === "TBD" || m.team2 === "TBD";
}

// Vrai si le tournoi de ce match est une phase Playoffs (peu importe la
// casse) -> sert à afficher un petit tag gris "Playoffs" à côté de la ligue.
function isPlayoffs(m) {
  return /playoff/i.test(m.tournamentName || "") || /playoff/i.test(m.phase || "");
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
  return getMatchPointsBreakdown(match, pred).total;
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

// Cas spécifique Bo3 (seul format de l'app, score de série max 2-1) : si la
// série pronostiquée compte 3 maps, la même équipe ne peut PAS avoir gagné
// les 2 premières. Si elle l'avait fait, la série se serait terminée 2-0 et
// la 3e map n'aurait jamais été jouée. On ne peut détecter ça qu'une fois les
// 2 premières maps entièrement saisies (et seulement s'il y a bien une 3e map
// à pronostiquer). Renvoie le nom de l'équipe "déjà gagnante" à ce stade, ou
// null si rien à signaler.
function computeGameOverrunWinner(games, team1Name, team2Name) {
  if (!Array.isArray(games) || games.length !== 3) return null; // rien à valider hors 2-1
  const g0 = games[0];
  const g1 = games[1];
  if (!g0 || !g1) return null;
  if (g0.a === "" || g0.b === "" || g1.a === "" || g1.b === "") return null;
  if (!isGameScoreComplete(g0.a) || !isGameScoreComplete(g0.b) || !isGameScoreComplete(g1.a) || !isGameScoreComplete(g1.b)) {
    return null; // saisie encore en cours sur l'une des 2 maps
  }
  const a0 = parseInt(g0.a, 10);
  const b0 = parseInt(g0.b, 10);
  const a1 = parseInt(g1.a, 10);
  const b1 = parseInt(g1.b, 10);
  const winner0 = a0 > b0 ? 1 : a0 < b0 ? 2 : null;
  const winner1 = a1 > b1 ? 1 : a1 < b1 ? 2 : null;
  if (winner0 === null || winner1 === null || winner0 !== winner1) return null;
  return winner0 === 1 ? team1Name : team2Name;
}

function TeamLogo({ code, apiLogo, accent, tbd }) {
  const src = LOGOS[code] || apiLogo || null;
  return (
    <div
      className="rounded-2xl flex items-center justify-center font-black shrink-0"
      style={{ width: "44px", height: "44px", background: "#1c1c1c", border: "1px solid " + (tbd ? "#444" : accent + "80"), color: tbd ? "#555" : "#fff", fontSize: "10.5px", overflow: "hidden" }}
    >
      {src ? (
        <img
          src={src}
          alt={code}
          style={{ width: "70%", height: "70%", objectFit: "contain" }}
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
const SeriesScoreInput = React.forwardRef(function SeriesScoreInput({ value, onChange, accent, disabled, onAdvance, otherValue }, ref) {
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => {
        if (disabled) return;
        const v = e.target.value.replace(/[^0-2]/g, "").slice(-1);
        onChange(v);
        if (v === "") return;
        if (isSeriesScoreComplete(otherValue)) {
          e.target.blur();
        } else if (onAdvance) {
          onAdvance();
        }
      }}
      disabled={disabled}
      inputMode="numeric"
      className="score-input text-center font-black rounded-xl"
      style={{ width: "48px", height: "46px", background: "#1c1c1c", color: accent, fontSize: "20px", border: "1px solid #2a2a2a", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "text" }}
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

function MatchCard({ match, accent, pred, onSeriesChange, onToggleExpand, onScoreChange, T, lang, teamLogoCache, streamUrl, replayUrl: replayUrlProp, useRegionStreamFallback = true, hideOdds = false, team1RegionColor, team2RegionColor, team1RegionCode, team2RegionCode }) {
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
  // Dès que le match a démarré (live) ou est terminé, le pari est figé :
  // impossible de changer le score série pronostiqué ni les scores par map.
  const betLocked = running || finished;

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

  // Équipe qui aurait déjà gagné la série avant la 3e map, si la série
  // pronostiquée est en 2-1 (3 maps) et que les maps 1 et 2 ont le même
  // vainqueur. Affiché comme erreur sur la Map 2, dès qu'elle est saisie.
  const overrunWinner = computeGameOverrunWinner(games, match.team1Name, match.team2Name);

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

  // Lien replay : priorité à l'override explicite (`replayUrlProp`, ex. flux
  // officiel PandaScore côté CS2), sinon repli région (Valorant uniquement).
  const effectiveReplayUrl = replayUrlProp || (useRegionStreamFallback ? REGION_YOUTUBE[match.region] || REGION_YOUTUBE.EMEA : null);

  // Détail des points gagnés sur ce match précis, uniquement si un pari a été
  // fait et le match est terminé (même règle que le règlement global des
  // points) : null = pas de pari fait (rien à afficher).
  let pointsBreakdown = null;
  if (finished && pred && pred.seriesA !== "" && pred.seriesB !== "" && match.score1 != null && match.score2 != null) {
    pointsBreakdown = getMatchPointsBreakdown(match, pred);
  }

  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "#141414", border: "1px solid #333" }}>
      <div className="flex items-center justify-between px-4 pt-3">
        <div>
          <span style={{ color: accent, fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {match.league} • {match.phase}
            {isPlayoffs(match) && !/playoff/i.test(match.phase || "") && (
              <span style={{ color: "#888", fontWeight: 700 }}> • Playoffs</span>
            )}
          </span>
          <div style={{ color: "#888", fontSize: "12px", fontWeight: 600, marginTop: "2px" }}>
            {match.day ? dayLabel(match.day, lang, T) : ""}
            {match.time ? " · " + match.time : ""}
          </div>
        </div>
        {running ? (
          streamUrl ? (
            <button
              onClick={() => window.open(streamUrl, "_blank", "noopener,noreferrer")}
              className="flex items-center gap-1.5"
              style={{ color: "#ff3b3b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", fontStyle: "italic" }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#ff3b3b", display: "inline-block", animation: "pulseLive 1.2s ease-in-out infinite" }} />
              LIVE
            </button>
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
                    <button
                      onClick={() => {
                        setShowStreamPicker(false);
                        window.open(twitchLiveUrl, "_blank", "noopener,noreferrer");
                      }}
                      className="w-full text-left"
                      style={{ display: "block", padding: "10px 14px", color: "#fff", fontSize: "12px", fontWeight: 700, background: "transparent", borderBottom: "1px solid #2a2a2a" }}
                    >
                      Twitch
                    </button>
                    <button
                      onClick={() => {
                        setShowStreamPicker(false);
                        window.open(youtubeLiveUrl, "_blank", "noopener,noreferrer");
                      }}
                      className="w-full text-left"
                      style={{ display: "block", padding: "10px 14px", color: "#fff", fontSize: "12px", fontWeight: 700, background: "transparent" }}
                    >
                      YouTube
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-1.5" style={{ color: "#ff3b3b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", fontStyle: "italic" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#ff3b3b", display: "inline-block", animation: "pulseLive 1.2s ease-in-out infinite" }} />
              LIVE
            </span>
          )
        ) : finished ? (
          <span style={{ color: "#666", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>{T.calendarDone}</span>
        ) : (
          <span style={{ color: "#8a8a8a", fontSize: "11px" }}>{match.time}</span>
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
            <span style={{ color: "#ccc", fontSize: "12px", fontWeight: 700 }}>{match.team1}</span>
          </span>
        </div>
        {finished ? (
          <div className="flex flex-col items-center">
            <span style={{ color: "#fff", fontSize: "16px", fontWeight: 900 }}>
              {match.score1 != null ? match.score1 : "–"} - {match.score2 != null ? match.score2 : "–"}
            </span>
            {pred && pred.seriesA !== "" && pred.seriesB !== "" && (
              <span style={{ color: "#777", fontSize: "9.5px", fontWeight: 700, marginTop: "1px" }}>
                {T.yourBet} : {pred.seriesA}-{pred.seriesB}
              </span>
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
            <span style={{ color: "#ccc", fontSize: "12px", fontWeight: 700 }}>{match.team2}</span>
          </span>
        </div>
      </div>

      {finished ? null : tbd ? (
        <div className="px-4 pb-3 text-center" style={{ color: "#666", fontSize: "11px" }}>{T.teamsTbc}</div>
      ) : (
        <div className="px-4 pb-3 flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#888", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>{match.team1}</span>
            <SeriesScoreInput ref={seriesARef} value={seriesA} onChange={(v) => onSeriesChange(match.id, "seriesA", v)} accent={accent} disabled={betLocked} onAdvance={() => seriesBRef.current && seriesBRef.current.focus()} otherValue={seriesB} />
          </div>
          <span style={{ color: "#444", fontWeight: 900, fontSize: "18px" }}>–</span>
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#888", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>{match.team2}</span>
            <SeriesScoreInput ref={seriesBRef} value={seriesB} onChange={(v) => onSeriesChange(match.id, "seriesB", v)} accent={accent} disabled={betLocked} onAdvance={() => seriesARef.current && seriesARef.current.focus()} otherValue={seriesA} />
          </div>
        </div>
      )}
      {running && !tbd && (
        <div className="px-4 pb-2 flex items-center justify-center gap-1.5">
          <Lock size={11} color="#666" />
          <span style={{ color: "#666", fontSize: "10px", fontWeight: 600 }}>{T.betLocked || "Pari verrouillé"}</span>
        </div>
      )}

      {finished ? (
        <>
          <div style={{ position: "relative" }}>
            <button onClick={() => onToggleExpand(match.id)} className="w-full flex items-center justify-center" style={{ background: "#1a1a1a", padding: "14px 0" }}>
              <ChevronDown size={16} color={accent} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }} />
            </button>
            {pointsBreakdown && (
              <span
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "12px",
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
              <div className="flex flex-col gap-2">
                {/* On affiche toujours quelque chose : le vrai score par map si vlr.gg
                    l'a fourni (match.map_scores), sinon un repli 0-0 par map (une
                    seule ligne "0-0" si on n'a même pas le nombre de maps). */}
                {(() => {
                  const mapsList = match.map_scores && match.map_scores.length > 0
                    ? match.map_scores
                    : [{ map: null, score1: 0, score2: 0 }];
                  return mapsList.map((g, i) => {
                    const gamePred = (pred && pred.games && pred.games[i]) || null;
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                            Map {i + 1}
                          </span>
                          {g.map && (
                            <span style={{ color: "#8a8a8a", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                              {formatMapLabel(g, i, mapsList.length)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
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

              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid #1f1f1f" }}>
                {effectiveReplayUrl ? (
                  <button
                    onClick={() => window.open(effectiveReplayUrl, "_blank", "noopener,noreferrer")}
                    className="flex items-center gap-1.5"
                    style={{ color: accent, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}
                  >
                    <Play size={12} />
                    {T.replay}
                  </button>
                ) : (
                  <span />
                )}
                {pointsBreakdown && pointsBreakdown.total > 0 ? (
                  <span style={{ color: "#999", fontSize: "10.5px", fontWeight: 700, textAlign: "right" }}>
                    Score : {pointsBreakdown.score} pts
                    {pointsBreakdown.bonus > 0 && <> + Bonus : {pointsBreakdown.bonus} pts</>}
                    {" = "}
                    <span style={{ color: "#CCF71D", fontWeight: 900 }}>{pointsBreakdown.total} pts</span>
                  </span>
                ) : (
                  <span style={{ color: "#666", fontSize: "12px", fontWeight: 900 }}>
                    {pointsBreakdown != null ? "0 pts" : ""}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <button onClick={() => onToggleExpand(match.id)} disabled={tbd} className="w-full flex items-center justify-center py-1.5" style={{ background: "#1a1a1a", opacity: tbd ? 0.4 : 1 }}>
            <ChevronDown size={16} color={accent} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }} />
          </button>

          {expanded && !tbd && (
            <div className="px-4 py-3" style={{ background: "#0d0d0d" }}>
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
                    // Erreur spécifique "série déjà gagnée" : seulement sur
                    // la Map 2 (i === 1), et seulement une fois qu'elle est
                    // entièrement saisie/quittée (même logique que showError
                    // ci-dessus, jamais pendant que l'utilisateur tape).
                    const showOverrunError = i === 1 && bothFilled && bothTouched && !!overrunWinner;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ color: "#8a8a8a", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Map {i + 1}</span>
                          {showOverrunError ? (
                            <span className="flex items-center gap-1" style={{ color: "#e05252", fontSize: "10px", textAlign: "right" }}>
                              <AlertCircle size={12} />
                              {overrunWinner} {T.alreadyWonSuffix}
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
  );
}

function NewsCarousel({ T }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const dragStartX = useRef(null);
  const slideCount = 3;

  useEffect(() => {
    const id = setInterval(() => {
      setActiveSlide((p) => (p + 1) % slideCount);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  function goTo(i) {
    setActiveSlide(((i % slideCount) + slideCount) % slideCount);
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
      style={{ height: "150px", background: "#141414", touchAction: "pan-y" }}
      onPointerDown={onDown}
      onPointerUp={onUp}
    >
      {activeSlide === 0 && (
        <>
          <img
            src={NEWS_IMAGE}
            alt=""
            draggable="false"
            loading="eager"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            className="absolute inset-0"
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.35s ease" }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to right, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.62) 55%, rgba(0,0,0,0.97) 72%, #000000 100%)" }}
          />
          <span
            className="absolute rounded-full"
            style={{ top: "10px", left: "10px", background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: "9px", fontWeight: 700, padding: "3px 9px", letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            {T.newsBadge}
          </span>
          <div className="absolute" style={{ right: "16px", top: "50%", transform: "translateY(-50%)", width: "48%", textAlign: "right" }}>
            <p style={{ color: "#fff", fontSize: "17px", fontWeight: 900, lineHeight: 1.1 }}>{T.newsTitle}</p>
            <p style={{ color: "#dcdcdc", fontSize: "10.5px", marginTop: "4px", lineHeight: 1.3 }}>{T.newsSub}</p>
          </div>
        </>
      )}

      <div className="absolute flex items-center gap-1.5" style={{ bottom: "10px", left: "50%", transform: "translateX(-50%)" }}>
        {[0, 1, 2].map((i) => (
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

function HomeTab({ setActiveTab, onOpenCalendar, onOpenCs2Calendar, T }) {
  return (
    <div className="px-4 pt-5 pb-6">
      <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }} className="mb-3">{T.newsLabel}</p>
      <NewsCarousel T={T} />

      <div className="flex items-center justify-between mb-3">
        <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{T.classementLabel}</p>
        <button onClick={() => setActiveTab("classement")} style={{ color: "#CCF71D", fontSize: "11px", fontWeight: 700 }}>{T.seeAll}</button>
      </div>
      <div className="rounded-2xl mb-6 overflow-hidden" style={{ background: "#141414", border: "1px solid #262626" }}>
        {[1, 2, 3].map((rank) => (
          <div key={rank} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: rank < 3 ? "1px solid #1f1f1f" : "none" }}>
            <div className="flex items-center gap-3">
              <div className="rounded-full flex items-center justify-center" style={{ width: 24, height: 24, background: "#222", color: "#666", fontSize: "11px", fontWeight: 900 }}>{rank}</div>
              <span style={{ color: "#555", fontSize: "13px", fontWeight: 600 }}>—</span>
            </div>
            <span style={{ color: "#555", fontSize: "12px", fontWeight: 700 }}>0 pts</span>
          </div>
        ))}
        <p className="text-center px-4 py-3" style={{ color: "#666", fontSize: "11px" }}>{T.classementEmptyHome}</p>
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

function ValorantTab({ selectedRegions, toggleRegion, selectedStatuses, toggleStatus, predictions, onSeriesChange, toggleExpand, changeScore, T, lang, upcoming, live, results, loading, teamLogoCache }) {
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
  const now = Date.now();
  const hasRealMapScore = (m) => Array.isArray(m.map_scores) && m.map_scores.length > 0;
  const stillWithinGrace = (m) => {
    const dayMs = m.day ? new Date(m.day + "T00:00:00Z").getTime() : null;
    return dayMs != null && now - dayMs < 48 * 60 * 60 * 1000;
  };
  const resultsReady = results.filter((m) => hasRealMapScore(m) || !stillWithinGrace(m));
  const resultsPending = results.filter((m) => !hasRealMapScore(m) && stillWithinGrace(m));

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
        <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.valorantTitle}</h1>
        <p style={{ color: "#888", fontSize: "12px" }}>{T.valorantSubtitle}</p>
      </div>

      <div className="flex gap-2 px-4 pt-1">
        {["upcoming", "finished"].map((s) => {
          const active = selectedStatuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className="rounded-full"
              style={{ padding: "7px 14px", fontSize: "11px", fontWeight: 700, background: active ? "#fff" : "#161616", color: active ? "#000" : "#888", border: active ? "none" : "1px solid #2a2a2a" }}
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
              style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: active ? r.accent : "#161616", color: active ? "#000" : "#888", border: active ? "none" : "1px solid #2a2a2a" }}
            >
              {regionLabel(r.key, T)}
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
              <MatchCard match={m} accent={m._accent} pred={predictions[m.id]} onSeriesChange={onSeriesChange} onToggleExpand={toggleExpand} onScoreChange={changeScore} T={T} lang={lang} teamLogoCache={teamLogoCache} />
            </React.Fragment>
          );
        })}
        {combined.length === 0 && (
          <p className="text-center pt-10" style={{ color: "#555", fontSize: "12px" }}>
            {loading ? "…" : "—"}
          </p>
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

function Cs2Tab({ selectedRegions, toggleRegion, selectedStatuses, toggleStatus, predictions, onSeriesChange, toggleExpand, changeScore, T, lang, upcoming, live, results, loading, teamLogoCache }) {
  const allSelected = selectedRegions.length === REGIONS_CS2.length;
  const showFinished = selectedStatuses[0] === "finished";

  // Même logique de "grâce" que côté Valorant : un match "finished" côté
  // PandaScore mais dont le score par map n'est pas encore résolu
  // (retentative en cours côté backend, cf RETRY_DELAYS_MS dans
  // cs2-history-store.js) reste affiché dans "à venir" plutôt que "Terminé",
  // pour ne jamais montrer un faux 0-0.
  const now = Date.now();
  const hasRealMapScore = (m) => Array.isArray(m.map_scores) && m.map_scores.length > 0;
  const stillWithinGrace = (m) => {
    const dayMs = m.day ? new Date(m.day + "T00:00:00Z").getTime() : null;
    return dayMs != null && now - dayMs < 48 * 60 * 60 * 1000;
  };
  const resultsReady = results.filter((m) => hasRealMapScore(m) || !stillWithinGrace(m));
  const resultsPending = results.filter((m) => !hasRealMapScore(m) && stillWithinGrace(m));

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
        <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.cs2Title}</h1>
        <p style={{ color: "#888", fontSize: "12px" }}>{T.cs2Subtitle}</p>
      </div>

      <div className="flex gap-2 px-4 pt-1">
        {["upcoming", "finished"].map((s) => {
          const active = selectedStatuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className="rounded-full"
              style={{ padding: "7px 14px", fontSize: "11px", fontWeight: 700, background: active ? "#fff" : "#161616", color: active ? "#000" : "#888", border: active ? "none" : "1px solid #2a2a2a" }}
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
              style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: active ? r.accent : "#161616", color: active ? "#000" : "#888", border: active ? "none" : "1px solid #2a2a2a" }}
            >
              {regionLabelCS2(r.key, T)}
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
              />
            </React.Fragment>
          );
        })}
        {combined.length === 0 && (
          <p className="text-center pt-10" style={{ color: "#555", fontSize: "12px" }}>
            {loading ? "…" : "—"}
          </p>
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

function ClassementTab({ T, selectedCats, toggleCat, userPoints }) {
  const allSelected = selectedCats.length === CATS.length;
  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.classementTitle}</h1>
      <p style={{ color: "#888", fontSize: "12px" }} className="mb-4">{T.classementSubtitle}</p>

      <div className="rounded-2xl px-4 py-3 mb-4 flex items-center justify-between" style={{ background: "#141414", border: "1px solid #262626" }}>
        <div>
          <p style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{T.myPoints}</p>
          <p style={{ color: "#777", fontSize: "10.5px" }}>{T.myPointsSub}</p>
        </div>
        <span style={{ color: "#CCF71D", fontSize: "20px", fontWeight: 900 }}>{userPoints} pts</span>
      </div>

      <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }} className="mb-2">{T.catFilterLabel}</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4">
        <button
          onClick={() => toggleCat("ALL")}
          className="shrink-0 rounded-full transition-all"
          style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: allSelected ? "#fff" : "#161616", color: allSelected ? "#000" : "#888", border: allSelected ? "none" : "1px solid #2a2a2a" }}
        >
          {T.regionAll}
        </button>
        {CATS.map((c) => {
          const active = selectedCats.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggleCat(c)}
              className="shrink-0 rounded-full transition-all"
              style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: active ? "#fff" : "#161616", color: active ? "#000" : "#888", border: active ? "none" : "1px solid #2a2a2a" }}
            >
              {catLabel(c, T)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center text-center mt-6" style={{ minHeight: "360px" }}>
        <div className="rounded-full flex items-center justify-center mb-4" style={{ width: 64, height: 64, background: "#141414", border: "1px solid #262626" }}>
          <Trophy size={26} color="#444" />
        </div>
        <p className="font-black text-white" style={{ fontSize: "16px" }}>{T.classementEmptyTitle}</p>
        <p style={{ color: "#777", fontSize: "12.5px", maxWidth: "240px" }} className="mt-2">{T.classementEmptySub}</p>
      </div>
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

function SettingsModal({ onClose, notifyRegions, setNotifyRegions, favoriteTeam, setFavoriteTeam, otherNotifs, setOtherNotifs, teams, T }) {
  const allTeams = teams || [];

  const otherItems = [
    { key: "events", label: T.settingsNotifEvents },
    { key: "bets", label: T.settingsNotifBets },
    { key: "matchStart", label: T.settingsNotifMatchStart },
    { key: "matchEnd", label: T.settingsNotifMatchEnd },
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#111", maxHeight: "88%" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.settingsTitle}</h2>
          <button onClick={onClose}><X size={20} color="#999" /></button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-6" style={{ flex: 1 }}>
          <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }} className="mb-2 mt-1">{T.settingsNotifTitle}</p>
          <div className="flex flex-col gap-2 mb-5">
            {REGIONS.map((r) => (
              <button key={r.key} onClick={() => setNotifyRegions((p) => ({ ...p, [r.key]: !p[r.key] }))} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "#181818" }}>
                <span className="flex items-center gap-2">
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: r.accent, display: "inline-block" }} />
                  <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>{T.settingsNotifPrefix}{regionLabel(r.key, T)}</span>
                </span>
                <span className="rounded-full" style={{ width: 38, height: 22, background: notifyRegions[r.key] ? r.accent : "#2a2a2a", position: "relative" }}>
                  <span className="rounded-full" style={{ width: 18, height: 18, background: "#fff", position: "absolute", top: 2, left: notifyRegions[r.key] ? 18 : 2, transition: "left 0.2s" }} />
                </span>
              </button>
            ))}
          </div>

          <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }} className="mb-2">{T.settingsNotifOtherTitle}</p>
          <div className="flex flex-col gap-2 mb-5">
            {otherItems.map((it) => (
              <button key={it.key} onClick={() => setOtherNotifs((p) => ({ ...p, [it.key]: !p[it.key] }))} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "#181818" }}>
                <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>{it.label}</span>
                <span className="rounded-full" style={{ width: 38, height: 22, background: otherNotifs[it.key] ? "#CCF71D" : "#2a2a2a", position: "relative" }}>
                  <span className="rounded-full" style={{ width: 18, height: 18, background: "#fff", position: "absolute", top: 2, left: otherNotifs[it.key] ? 18 : 2, transition: "left 0.2s" }} />
                </span>
              </button>
            ))}
          </div>

          <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }} className="mb-2">{T.settingsFavTeam}</p>
          <select value={favoriteTeam} onChange={(e) => setFavoriteTeam(e.target.value)} className="w-full rounded-xl mb-5" style={{ background: "#181818", color: "#fff", fontSize: "13px", padding: "10px 12px", border: "1px solid #2a2a2a" }}>
            <option value="">{T.settingsFavTeamNone}</option>
            {allTeams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <p style={{ color: "#666", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }} className="mb-2">{T.settingsAccount}</p>
          <button className="w-full flex items-center justify-center gap-2 rounded-xl mb-3" style={{ background: "#fff", color: "#111", padding: "11px", fontSize: "13px", fontWeight: 700 }}>
            <Chrome size={16} />{T.settingsGoogle}
          </button>
          <div className="flex items-center gap-2 mb-3">
            <div style={{ flex: 1, height: 1, background: "#262626" }} />
            <span style={{ color: "#555", fontSize: "11px" }}>{T.settingsOr}</span>
            <div style={{ flex: 1, height: 1, background: "#262626" }} />
          </div>
          <div className="flex items-center gap-2 rounded-xl mb-2 px-3" style={{ background: "#181818", border: "1px solid #2a2a2a" }}>
            <Mail size={14} color="#666" />
            <input placeholder={T.settingsEmail} className="flex-1" style={{ background: "transparent", color: "#fff", fontSize: "13px", padding: "10px 0", outline: "none", border: "none" }} />
          </div>
          <div className="flex items-center gap-2 rounded-xl mb-3 px-3" style={{ background: "#181818", border: "1px solid #2a2a2a" }}>
            <Lock size={14} color="#666" />
            <input type="password" placeholder={T.settingsPassword} className="flex-1" style={{ background: "transparent", color: "#fff", fontSize: "13px", padding: "10px 0", outline: "none", border: "none" }} />
          </div>
          <button className="w-full rounded-xl" style={{ background: "#CCF71D", color: "#000", padding: "11px", fontSize: "13px", fontWeight: 700 }}>{T.settingsLogin}</button>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#111", maxHeight: "88%" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.calendarModalTitle}</h2>
          <button onClick={onClose}><X size={20} color="#999" /></button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-5" style={{ flex: 1 }}>
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
                  <span className="font-black text-white" style={{ fontSize: item.big ? "22px" : "14px" }}>{item.title}</span>
                  <span style={{ fontSize: "9px", fontWeight: 700, color: statusColor, border: "1px solid " + statusColor + "55", borderRadius: "9999px", padding: "2px 8px", textTransform: "uppercase" }}>
                    {statusLabel}
                  </span>
                </div>
                {item.big && (
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

// Programme CS2 (Kickoff/Playoffs) : contrairement au calendrier VCT, pas de
// dates saisies à la main — CS2 n'a pas UN circuit mondial unique avec un
// calendrier partagé (chaque tournoi a ses propres stages). On dérive donc
// directement le statut de chaque stage à partir des vrais matchs CS2 déjà
// chargés (upcoming/live/results) : regroupés par ligue+stage, "Terminé" si
// tous les matchs connus de ce groupe sont finis, "En cours" si l'un
// tourne, sinon "Bientôt".
function Cs2CalendarModal({ onClose, T, upcoming, live, results }) {
  const all = [...upcoming, ...live, ...results];
  const groups = new Map();
  for (const m of all) {
    if (!/kickoff|playoffs?/i.test(m.tournamentName || "")) continue;
    const key = (m.league || "CS2") + " — " + m.tournamentName;
    const g = groups.get(key) || { league: m.league || "CS2", stage: m.tournamentName, matches: [] };
    g.matches.push(m);
    groups.set(key, g);
  }
  const items = [...groups.values()].map((g) => {
    const allFinished = g.matches.every((m) => m.status === "finished");
    const anyLive = g.matches.some((m) => m.status === "running");
    const status = allFinished ? "done" : anyLive ? "live" : "soon";
    return { ...g, status, count: g.matches.length };
  });

  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#fff", maxHeight: "80%" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-black" style={{ fontSize: "17px", color: "#111" }}>{T.cs2CalendarModalTitle}</h2>
          <button onClick={onClose}><X size={20} color="#666" /></button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-5" style={{ flex: 1 }}>
          {items.length === 0 && (
            <p style={{ color: "#999", fontSize: "12px", paddingTop: "8px" }}>{T.cs2CalendarEmpty}</p>
          )}
          {items.map((it, i) => {
            const statusColor = it.status === "done" ? "#999" : it.status === "live" ? "#ff3b3b" : "#3B82F6";
            const statusLabel = it.status === "done" ? T.calendarDone : it.status === "live" ? T.calendarLive : T.calendarSoon;
            return (
              <div key={i} className="flex items-center justify-between rounded-2xl px-4 py-3 mb-2" style={{ background: "#f5f5f5" }}>
                <div>
                  <div style={{ color: "#111", fontSize: "13px", fontWeight: 800 }}>{it.stage}</div>
                  <div style={{ color: "#777", fontSize: "11px" }}>{it.league}</div>
                </div>
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    color: statusColor,
                    border: "1px solid " + statusColor + "55",
                    borderRadius: "9999px",
                    padding: "2px 8px",
                    textTransform: "uppercase",
                  }}
                >
                  {statusLabel}
                </span>
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
        bottom: "84px",
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
  const [selectedStatuses, setSelectedStatuses] = useState(["upcoming"]);
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

  useEffect(() => {
    localStorage.setItem("split_predictions", JSON.stringify(predictions));
  }, [predictions]);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showCs2Calendar, setShowCs2Calendar] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [currentLang, setCurrentLang] = useState("fr");
  const [notifyRegions, setNotifyRegions] = useState({ EMEA: true, PACIFIC: true, AMERICAS: true, CN: true });
  const [otherNotifs, setOtherNotifs] = useState({ events: true, bets: true, matchStart: true, matchEnd: false });
  const [favoriteTeam, setFavoriteTeam] = useState("");

  const scrollRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const hideTimerRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  function handleContentScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const goingUp = top < lastScrollTopRef.current - 2;
    const goingDown = top > lastScrollTopRef.current + 2;
    const farEnough = top > 400;
    lastScrollTopRef.current = top;

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (goingUp && farEnough) {
      setShowScrollTop(true);
      hideTimerRef.current = setTimeout(() => setShowScrollTop(false), 2000);
    } else if (goingDown || !farEnough) {
      setShowScrollTop(false);
    }
  }

  function scrollContentToTop() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    setShowScrollTop(false);
  }

  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [resultsMatches, setResultsMatches] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Même chose côté CS2, dans des états séparés : les deux jeux sont
  // récupérés/rafraîchis indépendamment (cf effect dédié plus bas), jamais
  // mélangés dans les mêmes tableaux.
  const [cs2UpcomingMatches, setCs2UpcomingMatches] = useState([]);
  const [cs2LiveMatches, setCs2LiveMatches] = useState([]);
  const [cs2ResultsMatches, setCs2ResultsMatches] = useState([]);
  const [cs2DataLoading, setCs2DataLoading] = useState(true);

  const T = STR[currentLang] || STR.fr;
  const isLight = activeTab === "rocketleague";

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
          // Historique complet accumulé côté backend (mini base de données qui
          // grossit à chaque nouveau résultat). Pas encore déployé -> on ne
          // bloque jamais dessus, on retombe simplement sur les résultats
          // récents (paT) ci-dessous. Jamais de donnée inventée dans les deux cas.
          fetchJson("/api/match-history").catch(() => null),
        ]);
        if (cancelled) return;
        const upT = Array.isArray(up) ? up.map(transformMatch).filter((m) => m.region) : [];
        const liT = Array.isArray(li) ? li.map(transformMatch).filter((m) => m.region) : [];
        const paT = Array.isArray(pa) ? pa.map(transformMatch).filter((m) => m.region) : [];
        const historyT = Array.isArray(history) ? history.map(transformMatch).filter((m) => m.region) : [];
        // On prend la source qui a le plus de matchs exploitables : dès que le
        // backend expose l'historique accumulé (/api/match-history), il devient
        // naturellement plus riche que la fenêtre récente et prend le relais.
        const finishedMatches = historyT.length > paT.length ? historyT : paT;
        setUpcomingMatches(attachComputedOdds(upT, finishedMatches));
        setLiveMatches(attachComputedOdds(liT, finishedMatches));
        // Avant : les matchs terminés (onglet "Match terminé") ne passaient
        // jamais par attachComputedOdds -> match.odds1/odds2 restaient
        // `undefined`, et le repli d'affichage (`match.odds1 != null ? ... : 0`)
        // faisait donc afficher 0% / 0% sur TOUS les matchs déjà joués.
        // On calcule les cotes de la même façon que pour upcoming/live, à
        // partir de l'historique qui EXCLUT le match lui-même (sinon son
        // propre résultat biaiserait sa propre cote).
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
        // API indisponible : on garde ce qu'on a déjà, pas de données statiques de secours.
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
        const upT = Array.isArray(up) ? up.map(transformMatchCS2) : [];
        const liT = Array.isArray(li) ? li.map(transformMatchCS2) : [];
        const paT = Array.isArray(pa) ? pa.map(transformMatchCS2) : [];
        const historyT = Array.isArray(history) ? history.map(transformMatchCS2) : [];
        // Même règle que Valorant : on prend la source la plus riche.
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
          if (!m.beginAt) return true; // pas de date connue -> on ne le cache pas à tort
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
        // API indisponible : on garde ce qu'on a déjà, pas de données statiques de secours.
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

  const allTeams = React.useMemo(() => {
    const set = [];
    [...upcomingMatches, ...liveMatches, ...resultsMatches].forEach((m) => {
      [m.team1, m.team2].forEach((t) => {
        if (t && t !== "TBD" && set.indexOf(t) === -1) set.push(t);
      });
    });
    return set.sort();
  }, [upcomingMatches, liveMatches, resultsMatches]);

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

  function toggleStatus(key) {
    // Sélection exclusive : un seul des deux boutons actif à la fois.
    setSelectedStatuses([key]);
  }

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

  function onSeriesChange(matchId, team, digit) {
    setPredictions((prev) => {
      const cur = prev[matchId] || { seriesA: "", seriesB: "", games: [], expanded: false };
      const next = { ...cur, [team]: digit };
      const a = next.seriesA;
      const b = next.seriesB;
      if (a !== "" && b !== "") {
        const an = parseInt(a, 10);
        const bn = parseInt(b, 10);
        const validPairs = [[2, 0], [2, 1], [1, 2], [0, 2]];
        const ok = validPairs.some(([x, y]) => x === an && y === bn);
        if (ok) {
          const count = an + bn;
          const games = Array.from({ length: count }, (_, i) => (cur.games && cur.games[i]) || { a: "", b: "" });
          // On fige les cotes affichées AU MOMENT du pari (avant que le match
          // ne commence, seul instant où ce champ est éditable) : les points
          // gagnés plus tard se basent toujours sur cette cote-là, jamais sur
          // une cote recalculée après-coup une fois le résultat connu.
          const src = [...upcomingMatches, ...liveMatches, ...cs2UpcomingMatches, ...cs2LiveMatches].find((m) => String(m.id) === String(matchId));
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

  function applySettlement(newlySettled, pointsToAdd) {
    if (newlySettled.length === 0) return;
    setSettledMatchIds((prev) => {
      const next = new Set(prev);
      newlySettled.forEach((id) => next.add(id));
      localStorage.setItem("split_settled_matches", JSON.stringify([...next]));
      return next;
    });
    if (pointsToAdd > 0) {
      setUserPoints((prev) => {
        const next = prev + pointsToAdd;
        localStorage.setItem("split_points_total", String(next));
        return next;
      });
    }
  }

  // Dès qu'un match pronostiqué apparaît "finished" côté résultats, on règle
  // le pari une seule fois (settledMatchIds évite de recompter les points à
  // chaque repoll de /api/valorant-results toutes les 60s).
  useEffect(() => {
    if (!resultsMatches.length) return;
    const { newlySettled, pointsToAdd } = computeSettlement(resultsMatches, Date.now());
    applySettlement(newlySettled, pointsToAdd);
  }, [resultsMatches]);

  // Même règlement, même portefeuille de points, pour les pronostics CS2
  // (cf /api/cs2-results, repollé toutes les 60s comme côté Valorant).
  useEffect(() => {
    if (!cs2ResultsMatches.length) return;
    const { newlySettled, pointsToAdd } = computeSettlement(cs2ResultsMatches, Date.now());
    applySettlement(newlySettled, pointsToAdd);
  }, [cs2ResultsMatches]);

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
        <TopHeader isLight={isLight} onOpenLang={() => setShowLangMenu(true)} currentLang={currentLang} onOpenSettings={() => setShowSettings(true)} />

        <div ref={scrollRef} onScroll={handleContentScroll} className="flex-1 overflow-y-auto no-scrollbar relative" style={{ background: isLight ? "#EDEDED" : "#000" }}>
          {activeTab === "home" && <HomeTab setActiveTab={setActiveTab} onOpenCalendar={() => setShowCalendar(true)} onOpenCs2Calendar={() => setShowCs2Calendar(true)} T={T} />}
          {activeTab === "valorant" && (
            <ValorantTab
              selectedRegions={selectedRegions}
              toggleRegion={toggleRegion}
              selectedStatuses={selectedStatuses}
              toggleStatus={toggleStatus}
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
            />
          )}
          {activeTab === "csgo" && (
            <Cs2Tab
              selectedRegions={selectedRegionsCS2}
              toggleRegion={toggleRegionCS2}
              selectedStatuses={selectedStatuses}
              toggleStatus={toggleStatus}
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
            />
          )}
          {activeTab === "rocketleague" && <PlaceholderTab label="Rocket League" img={NAV_RL_IMG} T={T} />}
          {activeTab === "classement" && <ClassementTab T={T} selectedCats={selectedCats} toggleCat={toggleCat} userPoints={userPoints} />}
        </div>

        <ScrollToTopButton visible={showScrollTop} onClick={scrollContentToTop} />

        <div className="flex items-stretch justify-around border-t" style={{ background: "#0a0a0a", borderColor: "#1f1f1f" }}>
          {navItems.map((item) => {
            const active = activeTab === item.key;
            const labelColor = active ? "#fff" : "#6b6b6b";
            return (
              <button key={item.key} onClick={() => setActiveTab(item.key)} className="flex flex-col items-center justify-center flex-1 gap-1 py-2">
                <div style={{ height: "34px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {item.img ? (
                    <img src={item.img} alt={item.label} style={{ width: (item.imgSize || 24) + "px", height: (item.imgSize || 24) + "px", objectFit: "contain", opacity: active ? 1 : 0.42, transition: "opacity 0.15s" }} />
                  ) : (
                    <item.Icon size={24} color={labelColor} strokeWidth={2.2} />
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
            notifyRegions={notifyRegions}
            setNotifyRegions={setNotifyRegions}
            favoriteTeam={favoriteTeam}
            setFavoriteTeam={setFavoriteTeam}
            otherNotifs={otherNotifs}
            setOtherNotifs={setOtherNotifs}
            teams={allTeams}
            T={T}
          />
        )}
        {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} T={T} lang={currentLang} />}
        {showCs2Calendar && (
          <Cs2CalendarModal
            onClose={() => setShowCs2Calendar(false)}
            T={T}
            upcoming={cs2UpcomingMatches}
            live={cs2LiveMatches}
            results={cs2ResultsMatches}
          />
        )}
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes pulseLive { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}
