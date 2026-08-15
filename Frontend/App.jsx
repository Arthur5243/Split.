import React, { useState, useEffect, useRef } from "react";
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
};

// Équipes dont le logo est mal classé "sombre" par useIsDarkLogo (donc
// transformé à tort en blanc uni / halo) alors qu'il est en réalité coloré :
// on force l'affichage en couleurs d'origine, jamais d'inversion, pour ces codes.
const FORCE_NATURAL_COLOR = new Set(["FUT", "EDG", "W7M", "XE", "DRX", "AT"]);

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
    navHome: "Accueil", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Classement",
    newsLabel: "News", newsBadge: "Annonce", newsTitle: "3 MASTERS EN 2027", newsSub: "Un troisième tournoi Masters s'ajouterait au calendrier de la saison prochaine.",
    classementLabel: "Classement", seeAll: "Tout voir", classementEmptyHome: "0 pronostiqueur classé pour le moment. Sois le premier !",
    calendarLabel: "Calendrier", calendarCardTitle: "Calendrier VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendrier CS2", cs2CalendarCardSub: "Prochains matchs · tous circuits",
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
    calendarModalTitle: "Calendrier VCT 2026", calendarDone: "Terminé", calendarSoon: "Bientôt",
    calendarShowDetail: "Voir le détail par région", calendarHideDetail: "Masquer le détail",
    statusUpcoming: "Matchs à venir",
    yourBet: "Ton pari", replay: "Replay",
  },
  en: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Standings",
    newsLabel: "News", newsBadge: "Announcement", newsTitle: "3 MASTERS IN 2027", newsSub: "A third Masters tournament could be added to next season's calendar.",
    classementLabel: "Standings", seeAll: "See all", classementEmptyHome: "0 ranked predictors so far. Be the first!",
    calendarLabel: "Calendar", calendarCardTitle: "VCT 2026 Calendar", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2 Calendar", cs2CalendarCardSub: "Upcoming matches · all circuits",
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
    calendarModalTitle: "VCT 2026 Calendar", calendarDone: "Finished", calendarSoon: "Coming soon",
    calendarShowDetail: "Show detail by region", calendarHideDetail: "Hide detail",
    statusUpcoming: "Upcoming matches",
    yourBet: "Your bet", replay: "Replay",
  },
  es: {
    navHome: "Inicio", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Clasificación",
    newsLabel: "News", newsBadge: "Anuncio", newsTitle: "3 MASTERS EN 2027", newsSub: "Un tercer torneo Masters se añadiría al calendario de la próxima temporada.",
    classementLabel: "Clasificación", seeAll: "Ver todo", classementEmptyHome: "0 pronosticadores clasificados por ahora. ¡Sé el primero!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendario CS2", cs2CalendarCardSub: "Próximos partidos · todos los circuitos",
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
    calendarModalTitle: "Calendario VCT 2026", calendarDone: "Finalizado", calendarSoon: "Próximamente",
    calendarShowDetail: "Ver detalle por región", calendarHideDetail: "Ocultar detalle",
    statusUpcoming: "Próximos partidos",
    yourBet: "Tu pronóstico", replay: "Replay",
  },
  it: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Classifica",
    newsLabel: "News", newsBadge: "Annuncio", newsTitle: "3 MASTERS NEL 2027", newsSub: "Un terzo torneo Masters si aggiungerebbe al calendario della prossima stagione.",
    classementLabel: "Classifica", seeAll: "Vedi tutto", classementEmptyHome: "0 pronosticatori in classifica per ora. Sii il primo!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "Calendario CS2", cs2CalendarCardSub: "Prossimi match · tutti i circuiti",
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
    calendarModalTitle: "Calendario VCT 2026", calendarDone: "Concluso", calendarSoon: "In arrivo",
    calendarShowDetail: "Vedi dettagli per regione", calendarHideDetail: "Nascondi dettagli",
    statusUpcoming: "Prossime partite",
    yourBet: "Il tuo pronostico", replay: "Replay",
  },
  ja: {
    navHome: "ホーム", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "ランキング",
    newsLabel: "ニュース", newsBadge: "お知らせ", newsTitle: "2027年に3つ目のマスターズ", newsSub: "来シーズン、3つ目のマスターズ大会が開催される見込みです。",
    classementLabel: "ランキング", seeAll: "すべて見る", classementEmptyHome: "現在ランキング登録者は0人です。最初の1人になろう!",
    calendarLabel: "カレンダー", calendarCardTitle: "VCT 2026 カレンダー", calendarCardSub: "Kickoff・Masters・Playoffs・Champions",
    cs2CalendarCardTitle: "CS2カレンダー", cs2CalendarCardSub: "今後の試合・全大会",
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
    calendarModalTitle: "VCT 2026 カレンダー", calendarDone: "終了", calendarSoon: "開催予定",
    calendarShowDetail: "地域別の詳細を見る", calendarHideDetail: "詳細を隠す",
    statusUpcoming: "今後の試合",
    yourBet: "あなたの予想", replay: "リプレイ",
  },
  de: {
    navHome: "Start", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Rangliste",
    newsLabel: "News", newsBadge: "Ankündigung", newsTitle: "3 MASTERS IN 2027", newsSub: "Ein drittes Masters-Turnier soll im Kalender der nächsten Saison hinzukommen.",
    classementLabel: "Rangliste", seeAll: "Alle anzeigen", classementEmptyHome: "Bisher 0 platzierte Tipper. Sei der Erste!",
    calendarLabel: "Kalender", calendarCardTitle: "VCT-2026-Kalender", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2-Kalender", cs2CalendarCardSub: "Kommende Spiele · alle Circuits",
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
    calendarModalTitle: "VCT-2026-Kalender", calendarDone: "Beendet", calendarSoon: "Bevorstehend",
    calendarShowDetail: "Details nach Region anzeigen", calendarHideDetail: "Details ausblenden",
    statusUpcoming: "Bevorstehende Spiele",
    yourBet: "Dein Tipp", replay: "Replay",
  },
  cn: {
    navHome: "首页", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "排行榜",
    newsLabel: "资讯", newsBadge: "公告", newsTitle: "2027年将迎来第三场大师赛", newsSub: "下赛季日程中可能新增第三场大师赛(Masters)。",
    classementLabel: "排行榜", seeAll: "查看全部", classementEmptyHome: "目前还没有上榜用户，快来当第一人!",
    calendarLabel: "赛程日历", calendarCardTitle: "VCT 2026赛程日历", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    cs2CalendarCardTitle: "CS2赛程", cs2CalendarCardSub: "即将进行的比赛 · 全部赛事",
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
    calendarModalTitle: "VCT 2026赛程日历", calendarDone: "已结束", calendarSoon: "即将开始",
    calendarShowDetail: "查看各赛区详情", calendarHideDetail: "收起详情",
    statusUpcoming: "即将进行的比赛",
    yourBet: "你的竞猜", replay: "回放",
  },
};

const TIMELINE_I18N = {
  fr: [
    { key: "kickoff", title: "Kickoff", status: "done", range: "Janvier – Février 2026", detail: [
      { region: "AMERICAS", text: "15 janv. – 16 févr." }, { region: "EMEA", text: "20 janv. – 15 févr." },
      { region: "PACIFIC", text: "22 janv. – 15 févr." }, { region: "CN", text: "21 janv. – 9 févr." } ] },
    { key: "masters1", title: "Masters Santiago", status: "done", range: "28 févr. – 15 mars 2026 · Chili" },
    { key: "masters2", title: "Masters London", status: "done", range: "6 – 21 juin 2026 · Royaume-Uni" },
    { key: "playoffs", title: "PLAYOFFS", status: "soon", range: "Fin août 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20 – 31 août" }, { region: "AMERICAS", text: "27 août – 5 sept." },
      { region: "PACIFIC", text: "27 août – 6 sept." }, { region: "CN", text: "Fin du Stage 2 le 23 août" } ] },
    { key: "champions", title: "Champions", status: "soon", range: "24 sept. – 18 oct. 2026 · Shanghai, Chine" },
  ],
  en: [
    { key: "kickoff", title: "Kickoff", status: "done", range: "January – February 2026", detail: [
      { region: "AMERICAS", text: "Jan 15 – Feb 16" }, { region: "EMEA", text: "Jan 20 – Feb 15" },
      { region: "PACIFIC", text: "Jan 22 – Feb 15" }, { region: "CN", text: "Jan 21 – Feb 9" } ] },
    { key: "masters1", title: "Masters Santiago", status: "done", range: "Feb 28 – Mar 15, 2026 · Chile" },
    { key: "masters2", title: "Masters London", status: "done", range: "Jun 6–21, 2026 · United Kingdom" },
    { key: "playoffs", title: "PLAYOFFS", status: "soon", range: "Late August 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "Aug 20–31" }, { region: "AMERICAS", text: "Aug 27 – Sep 5" },
      { region: "PACIFIC", text: "Aug 27 – Sep 6" }, { region: "CN", text: "Stage 2 ends Aug 23" } ] },
    { key: "champions", title: "Champions", status: "soon", range: "Sep 24 – Oct 18, 2026 · Shanghai, China" },
  ],
  es: [
    { key: "kickoff", title: "Kickoff", status: "done", range: "Enero – Febrero 2026", detail: [
      { region: "AMERICAS", text: "15 ene. – 16 feb." }, { region: "EMEA", text: "20 ene. – 15 feb." },
      { region: "PACIFIC", text: "22 ene. – 15 feb." }, { region: "CN", text: "21 ene. – 9 feb." } ] },
    { key: "masters1", title: "Masters Santiago", status: "done", range: "28 feb. – 15 mar. 2026 · Chile" },
    { key: "masters2", title: "Masters London", status: "done", range: "6–21 jun. 2026 · Reino Unido" },
    { key: "playoffs", title: "PLAYOFFS", status: "soon", range: "Finales de agosto 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20–31 ago." }, { region: "AMERICAS", text: "27 ago. – 5 sept." },
      { region: "PACIFIC", text: "27 ago. – 6 sept." }, { region: "CN", text: "Fin del Stage 2 el 23 de agosto" } ] },
    { key: "champions", title: "Champions", status: "soon", range: "24 sept. – 18 oct. 2026 · Shanghái, China" },
  ],
  it: [
    { key: "kickoff", title: "Kickoff", status: "done", range: "Gennaio – Febbraio 2026", detail: [
      { region: "AMERICAS", text: "15 gen – 16 feb" }, { region: "EMEA", text: "20 gen – 15 feb" },
      { region: "PACIFIC", text: "22 gen – 15 feb" }, { region: "CN", text: "21 gen – 9 feb" } ] },
    { key: "masters1", title: "Masters Santiago", status: "done", range: "28 feb – 15 mar 2026 · Cile" },
    { key: "masters2", title: "Masters London", status: "done", range: "6–21 giu 2026 · Regno Unito" },
    { key: "playoffs", title: "PLAYOFFS", status: "soon", range: "Fine agosto 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20–31 ago" }, { region: "AMERICAS", text: "27 ago – 5 set" },
      { region: "PACIFIC", text: "27 ago – 6 set" }, { region: "CN", text: "Fine dello Stage 2 il 23 agosto" } ] },
    { key: "champions", title: "Champions", status: "soon", range: "24 set – 18 ott 2026 · Shanghai, Cina" },
  ],
  de: [
    { key: "kickoff", title: "Kickoff", status: "done", range: "Januar – Februar 2026", detail: [
      { region: "AMERICAS", text: "15. Jan. – 16. Feb." }, { region: "EMEA", text: "20. Jan. – 15. Feb." },
      { region: "PACIFIC", text: "22. Jan. – 15. Feb." }, { region: "CN", text: "21. Jan. – 9. Feb." } ] },
    { key: "masters1", title: "Masters Santiago", status: "done", range: "28. Feb. – 15. März 2026 · Chile" },
    { key: "masters2", title: "Masters London", status: "done", range: "6.–21. Juni 2026 · Vereinigtes Königreich" },
    { key: "playoffs", title: "PLAYOFFS", status: "soon", range: "Ende August 2026 · Stage 2", big: true, detail: [
      { region: "EMEA", text: "20.–31. Aug." }, { region: "AMERICAS", text: "27. Aug. – 5. Sept." },
      { region: "PACIFIC", text: "27. Aug. – 6. Sept." }, { region: "CN", text: "Stage 2 endet am 23. August" } ] },
    { key: "champions", title: "Champions", status: "soon", range: "24. Sept. – 18. Okt. 2026 · Shanghai, China" },
  ],
  ja: [
    { key: "kickoff", title: "Kickoff", status: "done", range: "2026年1月~2月", detail: [
      { region: "AMERICAS", text: "1月15日~2月16日" }, { region: "EMEA", text: "1月20日~2月15日" },
      { region: "PACIFIC", text: "1月22日~2月15日" }, { region: "CN", text: "1月21日~2月9日" } ] },
    { key: "masters1", title: "Masters Santiago", status: "done", range: "2026年2月28日~3月15日・チリ" },
    { key: "masters2", title: "Masters London", status: "done", range: "2026年6月6日~21日・イギリス" },
    { key: "playoffs", title: "PLAYOFFS", status: "soon", range: "2026年8月下旬・Stage 2", big: true, detail: [
      { region: "EMEA", text: "8月20日~31日" }, { region: "AMERICAS", text: "8月27日~9月5日" },
      { region: "PACIFIC", text: "8月27日~9月6日" }, { region: "CN", text: "Stage 2は8月23日終了" } ] },
    { key: "champions", title: "Champions", status: "soon", range: "2026年9月24日~10月18日・中国・上海" },
  ],
  cn: [
    { key: "kickoff", title: "Kickoff", status: "done", range: "2026年1月–2月", detail: [
      { region: "AMERICAS", text: "1月15日–2月16日" }, { region: "EMEA", text: "1月20日–2月15日" },
      { region: "PACIFIC", text: "1月22日–2月15日" }, { region: "CN", text: "1月21日–2月9日" } ] },
    { key: "masters1", title: "Masters Santiago", status: "done", range: "2026年2月28日–3月15日·智利" },
    { key: "masters2", title: "Masters London", status: "done", range: "2026年6月6日–21日·英国" },
    { key: "playoffs", title: "PLAYOFFS", status: "soon", range: "2026年8月下旬·Stage 2", big: true, detail: [
      { region: "EMEA", text: "8月20日–31日" }, { region: "AMERICAS", text: "8月27日–9月5日" },
      { region: "PACIFIC", text: "8月27日–9月6日" }, { region: "CN", text: "Stage 2将于8月23日结束" } ] },
    { key: "champions", title: "Champions", status: "soon", range: "2026年9月24日–10月18日·中国上海" },
  ],
};

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
  { key: "EUROPE", accent: "#3B82F6" },
  { key: "AMERICAS", accent: "#FF5A1F" },
  { key: "ASIA", accent: "#F5C518" },
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
    map_scores: m.map_scores || null,
  };
}

// --- Équivalent CS2 de transformMatch ---------------------------------
// Différence clé avec Valorant : pas de `region` unique par MATCH (les
// stages CS2 mélangent les régions), mais une région par ÉQUIPE
// (team1Region/team2Region), déjà calculée côté backend (cf cs2-routes.js
// `attachTeamRegions`, à partir du pays de chaque équipe) et renvoyée sur
// les champs team1_region/team2_region du match brut PandaScore.
function transformMatchCS2(m) {
  const opponents = m.opponents || [];
  const t1 = opponents[0] && opponents[0].opponent;
  const t2 = opponents[1] && opponents[1].opponent;
  const beginRaw = m.begin_at || m.scheduled_at || m.original_scheduled_at;
  const d = beginRaw ? new Date(beginRaw) : null;
  const results = m.results || [];
  const score1 = t1 ? (results.find((r) => r.team_id === t1.id) || {}).score : undefined;
  const score2 = t2 ? (results.find((r) => r.team_id === t2.id) || {}).score : undefined;

  return {
    id: "cs2-" + m.id,
    day: d ? isoDate(d) : null,
    time: d ? pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : "",
    league: (m.league && m.league.name) || "CS2",
    phase: (m.serie && m.serie.full_name) || (m.tournament && m.tournament.name) || "",
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
    map_scores: m.map_scores || null,
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

function normTeamName(name) {
  return (name || "").trim().toLowerCase();
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
// à partir de l'historique des matchs terminés déjà récupérés côté app.
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

  // Normalisation pour que les deux probabilités se répondent (somme = 100%).
  const total = wr1 + wr2;
  let p1 = total > 0 ? wr1 / total : 0.5;

  // Décalage déterministe par paire d'équipes : plus fort quand on a peu de
  // données réelles (échantillon faible des deux côtés), plus léger sinon.
  // Ça casse les 50/50 et 46/54 identiques d'un match sans historique à
  // l'autre, sans jamais changer de valeur au rechargement.
  const knownSample = gen1.played + gen2.played;
  const jitterDelta = knownSample < 4 ? 0.07 : knownSample < 10 ? 0.03 : 0.015;
  p1 += pairJitter(match.team1Name, match.team2Name, jitterDelta);

  // Garde-fou : jamais 0% ni 100% pile, pour garder un peu d'incertitude.
  p1 = Math.min(0.95, Math.max(0.05, p1));

  // odds2 dérivé de odds1 (pas arrondi séparément) pour garantir une somme à 100%.
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

// Applique le calcul ci-dessus à une liste de matchs (upcoming/live), en s'appuyant
// sur l'historique des matchs terminés pour établir la forme de chaque équipe.
function attachComputedOdds(matches, finishedMatches, tierWeightFn = tierWeight) {
  return matches.map((m) => {
    if (isTbd(m)) return { ...m, odds1: 0, odds2: 0, cote1: null, cote2: null };
    const { odds1, odds2, cote1, cote2 } = computeMatchOdds(m, finishedMatches, tierWeightFn);
    return { ...m, odds1, odds2, cote1, cote2 };
  });
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

// Détecte si un logo est majoritairement noir/foncé (donc invisible sur fond
// sombre) en échantillonnant ses pixels via un canvas. Si oui -> on le force
// en blanc (contraste). Sinon -> on garde ses couleurs d'origine intactes.
function useIsDarkLogo(src) {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    if (!src) {
      setIsDark(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 40) continue; // pixel quasi transparent, ignoré
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          count++;
        }
        if (!cancelled) setIsDark(count > 0 && sum / count < 60);
      } catch (e) {
        // Canvas "tainted" (CORS) ou autre erreur -> on ne force rien, logo intact.
        if (!cancelled) setIsDark(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setIsDark(false);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return isDark;
}

function TeamLogo({ code, apiLogo, accent, tbd }) {
  const src = LOGOS[code] || apiLogo || null;
  const detectedDark = useIsDarkLogo(src);
  const isDarkLogo = FORCE_NATURAL_COLOR.has(code) ? false : detectedDark;
  return (
    <div
      className="rounded-2xl flex items-center justify-center font-black shrink-0"
      style={{ width: "44px", height: "44px", background: "#1c1c1c", border: "1px solid " + (tbd ? "#444" : accent + "80"), color: tbd ? "#555" : "#fff", fontSize: "10.5px", overflow: "hidden" }}
    >
      {src ? (
        <img
          src={src}
          alt={code}
          style={{ width: "70%", height: "70%", objectFit: "contain", filter: isDarkLogo ? "brightness(0) invert(1)" : "none" }}
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
          <div style={{ color: "#888", fontSize: "12px", fontWeight: 600, marginTop: "2px" }}>{match.day ? dayLabel(match.day, lang, T) : ""}</div>
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
            {!hideOdds && <span style={{ color: "#777", fontSize: "10px", fontWeight: 600 }}>{match.odds1 != null ? match.odds1 : 0}%</span>}
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
            {!hideOdds && <span style={{ color: "#777", fontSize: "10px", fontWeight: 600 }}>{match.odds2 != null ? match.odds2 : 0}%</span>}
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

function HomeTab({ setActiveTab, onOpenCalendar, T }) {
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
      <button onClick={() => setActiveTab("csgo")} className="w-full flex items-center justify-between rounded-2xl px-4 py-4 mt-3" style={{ background: "#141414", border: "1px solid #262626" }}>
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
       