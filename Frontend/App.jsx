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
} from "lucide-react";

const SPLIT_LOGO = "/split-logo.png";
const NEWS_IMAGE = "/news-image.jpg";

// Logos de catégorie (nav du bas + onglets à venir), dans l'ordre
// Valorant / CS2 / Rocket League — fichiers fournis par l'utilisateur.
const NAV_VALORANT_IMG = "/valorant. png";
const NAV_CSGO_IMG = "/csgo.png";
const NAV_RL_IMG = "/nav-rl.png";

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
  CN: "valorant_cn",
};

// Catégories de jeux affichées dans le classement
const CATS = ["VALORANT", "CSGO", "RL"];

// Logos d'équipe personnalisés (fallback si l'API PandaScore n'en fournit pas) ;
// vide par défaut, les logos viennent normalement de match.team1Logo/team2Logo.
const LOGOS = {};

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
    valorantTitle: "VALORANT", valorantSubtitle: "Pronostics BO3 · toutes les ligues",
    regionAll: "Tout", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "Chine",
    today: "Aujourd'hui", tomorrow: "Demain",
    teamsTbc: "Équipes à confirmer",
    seriesHint: "Saisis un score de série valide ci-dessus (ex. 2-0, 2-1).",
    scoreInvalid: "13 pts min, 2 pts d'écart après 12",
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
  },
  en: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Standings",
    newsLabel: "News", newsBadge: "Announcement", newsTitle: "3 MASTERS IN 2027", newsSub: "A third Masters tournament could be added to next season's calendar.",
    classementLabel: "Standings", seeAll: "See all", classementEmptyHome: "0 ranked predictors so far. Be the first!",
    calendarLabel: "Calendar", calendarCardTitle: "VCT 2026 Calendar", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3 predictions · all leagues",
    regionAll: "All", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    today: "Today", tomorrow: "Tomorrow",
    teamsTbc: "Teams TBC",
    seriesHint: "Enter a valid series score above (e.g. 2-0, 2-1).",
    scoreInvalid: "13 pts min, 2 pt gap after 12",
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
  },
  es: {
    navHome: "Inicio", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Clasificación",
    newsLabel: "News", newsBadge: "Anuncio", newsTitle: "3 MASTERS EN 2027", newsSub: "Un tercer torneo Masters se añadiría al calendario de la próxima temporada.",
    classementLabel: "Clasificación", seeAll: "Ver todo", classementEmptyHome: "0 pronosticadores clasificados por ahora. ¡Sé el primero!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronósticos BO3 · todas las ligas",
    regionAll: "Todo", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    today: "Hoy", tomorrow: "Mañana",
    teamsTbc: "Equipos por confirmar",
    seriesHint: "Introduce un marcador de serie válido arriba (ej. 2-0, 2-1).",
    scoreInvalid: "13 pts mín, 2 pts de diferencia tras 12",
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
  },
  it: {
    navHome: "Home", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Classifica",
    newsLabel: "News", newsBadge: "Annuncio", newsTitle: "3 MASTERS NEL 2027", newsSub: "Un terzo torneo Masters si aggiungerebbe al calendario della prossima stagione.",
    classementLabel: "Classifica", seeAll: "Vedi tutto", classementEmptyHome: "0 pronosticatori in classifica per ora. Sii il primo!",
    calendarLabel: "Calendario", calendarCardTitle: "Calendario VCT 2026", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    valorantTitle: "VALORANT", valorantSubtitle: "Pronostici BO3 · tutte le leghe",
    regionAll: "Tutto", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "Cina",
    today: "Oggi", tomorrow: "Domani",
    teamsTbc: "Squadre da confermare",
    seriesHint: "Inserisci un punteggio di serie valido sopra (es. 2-0, 2-1).",
    scoreInvalid: "13 pt min, 2 pt di scarto dopo il 12",
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
  },
  ja: {
    navHome: "ホーム", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "ランキング",
    newsLabel: "ニュース", newsBadge: "お知らせ", newsTitle: "2027年に3つ目のマスターズ", newsSub: "来シーズン、3つ目のマスターズ大会が開催される見込みです。",
    classementLabel: "ランキング", seeAll: "すべて見る", classementEmptyHome: "現在ランキング登録者は0人です。最初の1人になろう!",
    calendarLabel: "カレンダー", calendarCardTitle: "VCT 2026 カレンダー", calendarCardSub: "Kickoff・Masters・Playoffs・Champions",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3予想・全リーグ",
    regionAll: "すべて", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "中国",
    today: "今日", tomorrow: "明日",
    teamsTbc: "対戦カード未定",
    seriesHint: "上のボックスに有効なシリーズスコアを入力してください(例: 2-0、2-1)。",
    scoreInvalid: "13点先取、12点以降は2点差が必要",
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
  },
  de: {
    navHome: "Start", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "Rangliste",
    newsLabel: "News", newsBadge: "Ankündigung", newsTitle: "3 MASTERS IN 2027", newsSub: "Ein drittes Masters-Turnier soll im Kalender der nächsten Saison hinzukommen.",
    classementLabel: "Rangliste", seeAll: "Alle anzeigen", classementEmptyHome: "Bisher 0 platzierte Tipper. Sei der Erste!",
    calendarLabel: "Kalender", calendarCardTitle: "VCT-2026-Kalender", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3-Tipps · alle Ligen",
    regionAll: "Alle", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "China",
    today: "Heute", tomorrow: "Morgen",
    teamsTbc: "Teams noch offen",
    seriesHint: "Gib oben einen gültigen Serien-Score ein (z. B. 2-0, 2-1).",
    scoreInvalid: "Mind. 13 Punkte, 2 Punkte Vorsprung nach 12",
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
  },
  cn: {
    navHome: "首页", navValorant: "Valorant", navCsgo: "CS:GO", navRl: "RL", navClassement: "排行榜",
    newsLabel: "资讯", newsBadge: "公告", newsTitle: "2027年将迎来第三场大师赛", newsSub: "下赛季日程中可能新增第三场大师赛(Masters)。",
    classementLabel: "排行榜", seeAll: "查看全部", classementEmptyHome: "目前还没有上榜用户，快来当第一人!",
    calendarLabel: "赛程日历", calendarCardTitle: "VCT 2026赛程日历", calendarCardSub: "Kickoff · Masters · Playoffs · Champions",
    valorantTitle: "VALORANT", valorantSubtitle: "BO3竞猜 · 全部赛区",
    regionAll: "全部", regionEmea: "Emea", regionPacific: "Pacific", regionAmericas: "Americas", regionChine: "中国",
    today: "今天", tomorrow: "明天",
    teamsTbc: "对阵尚未确定",
    seriesHint: "请在上方输入有效的系列赛比分(如2-0、2-1)。",
    scoreInvalid: "先得13分，12平后须净胜2分",
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

function teamCode(opp) {
  if (!opp) return "TBD";
  if (opp.acronym) return opp.acronym;
  if (opp.name) return opp.name.slice(0, 4).toUpperCase();
  return "TBD";
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

function isTbd(m) {
  return m.team1 === "TBD" || m.team2 === "TBD";
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

function tierWeight(tierLabel) {
  const t = (tierLabel || "").toLowerCase();
  for (const { match, weight } of TIER_WEIGHTS) {
    if (t.includes(match)) return weight;
  }
  return DEFAULT_TIER_WEIGHT;
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
function recentWinrate(teamName, finishedMatches, limit) {
  const sorted = [...finishedMatches].sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)));
  let wins = 0;
  let played = 0;
  let weightSum = 0;
  for (const m of sorted) {
    if (played >= limit) break;
    const r = teamResult(m, teamName);
    if (r == null) continue;
    played++;
    weightSum += tierWeight(m.tier);
    if (r === "W") wins++;
  }
  return { wins, played, weightSum };
}

// Winrate BRUT de teamA spécifiquement contre teamB, sur leurs N dernières
// confrontations directes, + le poids moyen de tournoi sur ces confrontations
// (même logique que recentWinrate).
function headToHeadWinrate(teamAName, teamBName, finishedMatches, limit) {
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
    weightSum += tierWeight(m.tier);
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
function computeMatchOdds(match, finishedMatches) {
  const gen1 = recentWinrate(match.team1Name, finishedMatches, ODDS_GENERAL_LIMIT);
  const gen2 = recentWinrate(match.team2Name, finishedMatches, ODDS_GENERAL_LIMIT);
  let wr1 = qualityAdjustedWinrate(gen1.wins, gen1.played, gen1.weightSum);
  let wr2 = qualityAdjustedWinrate(gen2.wins, gen2.played, gen2.weightSum);

  const h2h = headToHeadWinrate(match.team1Name, match.team2Name, finishedMatches, ODDS_H2H_LIMIT);
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
function attachComputedOdds(matches, finishedMatches) {
  return matches.map((m) => {
    if (isTbd(m)) return { ...m, odds1: 0, odds2: 0, cote1: null, cote2: null };
    const { odds1, odds2, cote1, cote2 } = computeMatchOdds(m, finishedMatches);
    return { ...m, odds1, odds2, cote1, cote2 };
  });
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
  const isDarkLogo = useIsDarkLogo(src);
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

function SeriesScoreInput({ value, onChange, accent }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-2]/g, "").slice(-1))}
      inputMode="numeric"
      className="score-input text-center font-black rounded-xl"
      style={{ width: "48px", height: "46px", background: "#1c1c1c", color: accent, fontSize: "20px", border: "1px solid #2a2a2a" }}
    />
  );
}

function GameScoreInput({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
      inputMode="numeric"
      className="score-input text-center font-black rounded-lg"
      style={{ width: "44px", height: "38px", background: "#1c1c1c", color: "#fff", fontSize: "15px", border: "1px solid #2a2a2a" }}
    />
  );
}

function MatchCard({ match, accent, pred, onSeriesChange, onToggleExpand, onScoreChange, T, lang }) {
  const tbd = isTbd(match);
  const finished = match.status === "finished";
  const running = match.status === "running";
  const seriesA = (pred && pred.seriesA) || "";
  const seriesB = (pred && pred.seriesB) || "";
  const expanded = pred && pred.expanded;
  const games = (pred && pred.games) || [];

  // Chaîne Twitch selon la région du match (repli sur valorant_emea si inconnue)
  const twitchChannel = REGION_TWITCH[match.region] || "valorant_emea";

  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "#141414", border: "1px solid #333" }}>
      <div className="flex items-center justify-between px-4 pt-3">
        <div>
          <span style={{ color: accent, fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {match.league} • {match.phase}
          </span>
          <div style={{ color: "#888", fontSize: "12px", fontWeight: 600, marginTop: "2px" }}>{match.day ? dayLabel(match.day, lang, T) : ""}</div>
        </div>
        {running ? (
          <button
            onClick={() => window.open("https://www.twitch.tv/" + twitchChannel, "_blank", "noopener,noreferrer")}
            className="flex items-center gap-1.5"
            style={{ color: "#ff3b3b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", fontStyle: "italic" }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#ff3b3b", display: "inline-block", animation: "pulseLive 1.2s ease-in-out infinite" }} />
            LIVE
          </button>
        ) : finished ? (
          <span style={{ color: "#666", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>{T.calendarDone}</span>
        ) : (
          <span style={{ color: "#8a8a8a", fontSize: "11px" }}>{match.time}</span>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <TeamLogo code={match.team1} apiLogo={match.team1Logo} accent={accent} tbd={tbd} />
            <span style={{ color: "#777", fontSize: "10px", fontWeight: 600 }}>{match.odds1 != null ? match.odds1 : 0}%</span>
          </div>
          <span style={{ color: "#ccc", fontSize: "12px", fontWeight: 700 }}>{match.team1}</span>
        </div>
        {finished ? (
          <span style={{ color: "#fff", fontSize: "16px", fontWeight: 900 }}>
            {match.score1 != null ? match.score1 : "–"} - {match.score2 != null ? match.score2 : "–"}
          </span>
        ) : (
          <span style={{ color: "#555", fontSize: "11px", fontWeight: 700 }}>VS</span>
        )}
        <div className="flex items-center gap-2 flex-row-reverse">
          <div className="flex flex-col items-center gap-0.5">
            <TeamLogo code={match.team2} apiLogo={match.team2Logo} accent={accent} tbd={tbd} />
            <span style={{ color: "#777", fontSize: "10px", fontWeight: 600 }}>{match.odds2 != null ? match.odds2 : 0}%</span>
          </div>
          <span style={{ color: "#ccc", fontSize: "12px", fontWeight: 700 }}>{match.team2}</span>
        </div>
      </div>

      {finished ? null : tbd ? (
        <div className="px-4 pb-3 text-center" style={{ color: "#666", fontSize: "11px" }}>{T.teamsTbc}</div>
      ) : (
        <div className="px-4 pb-3 flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#888", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>{match.team1}</span>
            <SeriesScoreInput value={seriesA} onChange={(v) => onSeriesChange(match.id, "seriesA", v)} accent={accent} />
          </div>
          <span style={{ color: "#444", fontWeight: 900, fontSize: "18px" }}>–</span>
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#888", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>{match.team2}</span>
            <SeriesScoreInput value={seriesB} onChange={(v) => onSeriesChange(match.id, "seriesB", v)} accent={accent} />
          </div>
        </div>
      )}

      {finished ? (
        <>
          <button onClick={() => onToggleExpand(match.id)} className="w-full flex items-center justify-center py-1.5" style={{ background: "#1a1a1a" }}>
            <ChevronDown size={16} color={accent} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }} />
          </button>

          {expanded && (
            <div className="px-4 py-3" style={{ background: "#0d0d0d" }}>
              <div className="flex flex-col gap-2">
                {/* On affiche toujours quelque chose : le vrai score par map si vlr.gg
                    l'a fourni (match.map_scores), sinon un repli 0-0 par map (une
                    seule ligne "0-0" si on n'a même pas le nombre de maps). */}
                {(match.map_scores && match.map_scores.length > 0
                  ? match.map_scores
                  : [{ map: null, score1: 0, score2: 0 }]
                ).map((g, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                        Map {i + 1}
                      </span>
                      {g.map && (
                        <span style={{ color: "#8a8a8a", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                          {g.map}
                        </span>
                      )}
                    </div>
                    <span style={{ color: "#fff", fontSize: "13px", fontWeight: 800 }}>
                      {g.score1 != null ? g.score1 : 0} - {g.score2 != null ? g.score2 : 0}
                    </span>
                  </div>
                ))}
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
                    const valid = isValidScore(g.a, g.b);
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ color: "#8a8a8a", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Map {i + 1}</span>
                          {!valid && (
                            <span className="flex items-center gap-1" style={{ color: "#e05252", fontSize: "10px" }}>
                              <AlertCircle size={12} />
                              {T.scoreInvalid}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-3">
                          <GameScoreInput value={g.a} onChange={(v) => onScoreChange(match.id, i, "a", v)} />
                          <span style={{ color: "#444", fontWeight: 700 }}>—</span>
                          <GameScoreInput value={g.b} onChange={(v) => onScoreChange(match.id, i, "b", v)} />
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
    </div>
  );
}

function ValorantTab({ selectedRegions, toggleRegion, selectedStatuses, toggleStatus, predictions, onSeriesChange, toggleExpand, changeScore, T, lang, upcoming, live, results, loading }) {
  const single = selectedRegions.length === 1 ? REGIONS.find((r) => r.key === selectedRegions[0]) : null;
  const glowAccent = single ? single.accent : "#ffffff";
  const allSelected = selectedRegions.length === REGIONS.length;
  const showFinished = selectedStatuses[0] === "finished";

  const accentFor = (region) => (REGIONS.find((r) => r.key === region) || {}).accent || "#fff";

  const source = showFinished ? results : [...live, ...upcoming];

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
              <MatchCard match={m} accent={m._accent} pred={predictions[m.id]} onSeriesChange={onSeriesChange} onToggleExpand={toggleExpand} onScoreChange={changeScore} T={T} lang={lang} />
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

function ClassementTab({ T, selectedCats, toggleCat }) {
  const allSelected = selectedCats.length === CATS.length;
  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="font-black text-white" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{T.classementTitle}</h1>
      <p style={{ color: "#888", fontSize: "12px" }} className="mb-4">{T.classementSubtitle}</p>

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
  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#111", maxHeight: "88%" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-black text-white" style={{ fontSize: "18px" }}>{T.calendarModalTitle}</h2>
          <button onClick={onClose}><X size={20} color="#999" /></button>
        </div>
        <div className="overflow-y-auto no-scrollbar px-5 pb-5" style={{ flex: 1 }}>
          {timeline.map((item, idx) => (
            <div key={item.key} className="flex gap-3 pb-5">
              <div className="flex flex-col items-center">
                <div className="rounded-full" style={{ width: 10, height: 10, background: item.status === "done" ? "#444" : "#CCF71D", marginTop: 4 }} />
                {idx < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: "#262626", marginTop: 4 }} />}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-white" style={{ fontSize: item.big ? "22px" : "14px" }}>{item.title}</span>
                  <span style={{ fontSize: "9px", fontWeight: 700, color: item.status === "done" ? "#666" : "#CCF71D", border: "1px solid " + (item.status === "done" ? "#333" : "#CCF71D55"), borderRadius: "9999px", padding: "2px 8px", textTransform: "uppercase" }}>
                    {item.status === "done" ? T.calendarDone : T.calendarSoon}
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
          ))}
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
  const [selectedRegions, setSelectedRegions] = useState(["EMEA"]);
  const [preAllRegions, setPreAllRegions] = useState(["EMEA"]);
  const [selectedStatuses, setSelectedStatuses] = useState(["upcoming"]);
  const [selectedCats, setSelectedCats] = useState(["VALORANT"]);
  const [preAllCats, setPreAllCats] = useState(["VALORANT"]);
  const [predictions, setPredictions] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
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

  const T = STR[currentLang] || STR.fr;
  const isLight = activeTab === "csgo" || activeTab === "rocketleague";

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
        setResultsMatches(paT);
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

  const allTeams = React.useMemo(() => {
    const set = [];
    [...upcomingMatches, ...liveMatches, ...resultsMatches].forEach((m) => {
      [m.team1, m.team2].forEach((t) => {
        if (t && t !== "TBD" && set.indexOf(t) === -1) set.push(t);
      });
    });
    return set.sort();
  }, [upcomingMatches, liveMatches, resultsMatches]);

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
          return { ...prev, [matchId]: { ...next, games, expanded: true } };
        }
      }
      return { ...prev, [matchId]: next };
    });
  }

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
    { key: "valorant", label: T.navValorant, img: NAV_VALORANT_IMG },
    { key: "csgo", label: T.navCsgo, img: NAV_CSGO_IMG },
    { key: "rocketleague", label: T.navRl, img: NAV_RL_IMG },
    { key: "classement", label: T.navClassement, Icon: Trophy },
  ];

  return (
    <div className="flex items-center justify-center p-4" style={{ background: "#000", minHeight: "700px" }}>
      <div className="relative overflow-hidden flex flex-col" style={{ width: "min(390px, 100%)", height: "min(820px, 92vh)", background: "#000", borderRadius: "44px", boxShadow: "0 0 0 2px #262626, 0 20px 60px rgba(0,0,0,0.6)" }}>
        <TopHeader isLight={isLight} onOpenLang={() => setShowLangMenu(true)} currentLang={currentLang} onOpenSettings={() => setShowSettings(true)} />

        <div ref={scrollRef} onScroll={handleContentScroll} className="flex-1 overflow-y-auto no-scrollbar relative" style={{ background: isLight ? "#EDEDED" : "#000" }}>
          {activeTab === "home" && <HomeTab setActiveTab={setActiveTab} onOpenCalendar={() => setShowCalendar(true)} T={T} />}
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
              loading={dataLoading}
            />
          )}
          {activeTab === "csgo" && <PlaceholderTab label="CS:GO" img={NAV_CSGO_IMG} T={T} />}
          {activeTab === "rocketleague" && <PlaceholderTab label="Rocket League" img={NAV_RL_IMG} T={T} />}
          {activeTab === "classement" && <ClassementTab T={T} selectedCats={selectedCats} toggleCat={toggleCat} />}
        </div>

        <ScrollToTopButton visible={showScrollTop} onClick={scrollContentToTop} />

        <div className="flex items-stretch justify-around border-t" style={{ background: "#0a0a0a", borderColor: "#1f1f1f" }}>
          {navItems.map((item) => {
            const active = activeTab === item.key;
            const labelColor = active ? "#fff" : "#6b6b6b";
            return (
              <button key={item.key} onClick={() => setActiveTab(item.key)} className="flex flex-col items-center justify-center flex-1 gap-1 py-2">
                {item.img ? (
                  <img src={item.img} alt={item.label} style={{ width: "20px", height: "20px", objectFit: "contain", opacity: active ? 1 : 0.42, transition: "opacity 0.15s" }} />
                ) : (
                  <item.Icon size={20} color={labelColor} strokeWidth={2.2} />
                )}
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
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes pulseLive { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}
