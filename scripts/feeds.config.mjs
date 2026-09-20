// Sources for the morning edition. All public RSS/Atom feeds; no keys, no paid APIs.
// weight: relative importance inside a topic. lead: true = non-paywalled, OK to extract opening paragraphs.
// sub: a sub-slot label used by SLOT_RULES to guarantee variety (e.g. one politics + one finance + one markets story).
// lang: 'fr' items are kept but scored slightly lower so English leads each section.

export const TOPICS = ['ai', 'world', 'finance', 'waterpolo', 'soccer'];

export const FEEDS = [
  // 1) AI, data & analytics
  { id: 'mit-tr', name: 'MIT Technology Review', topic: 'ai', url: 'https://www.technologyreview.com/feed/', weight: 1.0, lead: true },
  { id: 'ars-tech', name: 'Ars Technica', topic: 'ai', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', weight: 0.9, lead: true },
  { id: 'verge-ai', name: 'The Verge', topic: 'ai', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', weight: 0.8, lead: true },
  { id: 'willison', name: 'Simon Willison', topic: 'ai', url: 'https://simonwillison.net/atom/entries/', weight: 0.6, lead: true },
  { id: 'powerbi', name: 'Power BI Blog', topic: 'ai', url: 'https://powerbi.microsoft.com/en-us/blog/feed/', weight: 0.8, lead: true, sub: 'data' },
  { id: 'realpython', name: 'Real Python', topic: 'ai', url: 'https://realpython.com/atom.xml', weight: 0.4, lead: true, sub: 'data' },

  // 2) World, US & France  (sub: 'france' guarantees one France story a day)
  { id: 'npr-news', name: 'NPR', topic: 'world', url: 'https://feeds.npr.org/1001/rss.xml', weight: 1.0, lead: true },
  { id: 'bbc-world', name: 'BBC News', topic: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', weight: 0.9, lead: true },
  { id: 'bbc-us', name: 'BBC News', topic: 'world', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', weight: 0.8, lead: true, sub: 'us' },
  { id: 'france24', name: 'France 24', topic: 'world', url: 'https://www.france24.com/en/france/rss', weight: 0.9, lead: true, sub: 'france' },
  { id: 'lemonde-en', name: 'Le Monde in English', topic: 'world', url: 'https://www.lemonde.fr/en/rss/une.xml', weight: 0.8, lead: false, sub: 'france' },
  { id: 'lemonde-fr', name: 'Le Monde', topic: 'world', url: 'https://www.lemonde.fr/rss/une.xml', weight: 0.6, lead: false, lang: 'fr', sub: 'france' },

  // 3) Politics & finance: one politics + one finance + one stock-market story every day
  { id: 'npr-politics', name: 'NPR Politics', topic: 'finance', url: 'https://feeds.npr.org/1014/rss.xml', weight: 1.0, lead: true, sub: 'politics' },
  { id: 'bbc-politics-us', name: 'BBC News', topic: 'finance', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', weight: 0.6, lead: true, sub: 'politics' },
  { id: 'npr-business', name: 'NPR Business', topic: 'finance', url: 'https://feeds.npr.org/1006/rss.xml', weight: 1.0, lead: true, sub: 'finance' },
  { id: 'npr-economy', name: 'NPR Economy', topic: 'finance', url: 'https://feeds.npr.org/1017/rss.xml', weight: 0.9, lead: true, sub: 'finance' },
  { id: 'bbc-business', name: 'BBC Business', topic: 'finance', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', weight: 0.9, lead: true, sub: 'finance' },
  { id: 'cnbc-finance', name: 'CNBC', topic: 'finance', url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html', weight: 0.6, lead: false, sub: 'finance' },
  { id: 'cnbc-markets', name: 'CNBC Markets', topic: 'finance', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', weight: 0.9, lead: false, sub: 'markets' },
  { id: 'mw-top', name: 'MarketWatch', topic: 'finance', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', weight: 0.8, lead: false, sub: 'markets' },
  { id: 'guardian-markets', name: 'The Guardian', topic: 'finance', url: 'https://www.theguardian.com/business/stock-markets/rss', weight: 0.8, lead: true, sub: 'markets' },

  // 4) Water polo — NCAA first (East Coast preferred, then West), then everything else
  { id: 'liu-m', requireKeyword: /water ?polo|\bpolo\b/i, name: 'LIU Athletics', topic: 'waterpolo', url: 'https://liuathletics.com/rss.aspx?path=mwpolo', weight: 1.5, lead: true, sub: 'ncaa-east' },
  { id: 'liu-w', requireKeyword: /water ?polo|\bpolo\b/i, name: 'LIU Athletics', topic: 'waterpolo', url: 'https://liuathletics.com/rss.aspx?path=wwpolo', weight: 1.3, lead: true, sub: 'ncaa-east' },
  { id: 'cwpa', name: 'CWPA', topic: 'waterpolo', url: 'https://collegiatewaterpolo.org/feed/', weight: 0.9, lead: true, sub: 'ncaa-east' },
  { id: 'harvard-wp', requireKeyword: /water ?polo|\bpolo\b/i, name: 'Harvard Athletics', topic: 'waterpolo', url: 'https://gocrimson.com/rss.aspx?path=mwpolo', weight: 0.7, lead: true, sub: 'ncaa-east' },
  { id: 'navy-wp', requireKeyword: /water ?polo|\bpolo\b/i, name: 'Navy Athletics', topic: 'waterpolo', url: 'https://navysports.com/rss.aspx?path=mwpolo', weight: 0.7, lead: true, sub: 'ncaa-east' },
  { id: 'fordham-wp', requireKeyword: /water ?polo|\bpolo\b/i, name: 'Fordham Athletics', topic: 'waterpolo', url: 'https://fordhamsports.com/rss.aspx?path=mwpolo', weight: 0.7, lead: true, sub: 'ncaa-east' },
  { id: 'ucsd-wp', requireKeyword: /water ?polo|\bpolo\b/i, name: 'UC San Diego Athletics', topic: 'waterpolo', url: 'https://ucsdtritons.com/rss.aspx?path=mwpolo', weight: 0.6, lead: true, sub: 'ncaa-west' },
  { id: 'usawp', name: 'USA Water Polo', topic: 'waterpolo', url: 'https://usawaterpolo.org/rss', weight: 0.9, lead: true },
  { id: 'total-wp', name: 'Total Waterpolo', topic: 'waterpolo', url: 'https://total-waterpolo.com/feed/', weight: 0.9, lead: true },
  { id: 'len', name: 'LEN', topic: 'waterpolo', url: 'https://len.eu/feed/', weight: 0.8, lead: true },
  { id: 'wp-planet', name: 'Water Polo Planet', topic: 'waterpolo', url: 'https://www.waterpoloplanet.com/feed/', weight: 0.6, lead: true },

  // 5) Soccer — Ligue 1 & Les Bleus, then Europe, then Premier League; clubs OM, Real Madrid, Man United
  { id: 'lequipe-foot', name: "L'Équipe", topic: 'soccer', url: 'https://dwh.lequipe.fr/api/edito/rss?path=/Football/', weight: 1.0, lead: false, lang: 'fr' },
  { id: 'rmc-foot', name: 'RMC Sport', topic: 'soccer', url: 'https://rmcsport.bfmtv.com/rss/football/', weight: 0.8, lead: false, lang: 'fr' },
  { id: 'guardian-l1', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/ligue1football/rss', weight: 1.0, lead: true },
  { id: 'guardian-rm', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/realmadrid/rss', weight: 0.9, lead: true },
  { id: 'guardian-mu', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/manchester-united/rss', weight: 0.8, lead: true },
  { id: 'guardian-foot', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/rss', weight: 0.8, lead: true },
  { id: 'bbc-foot', name: 'BBC Sport', topic: 'soccer', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', weight: 0.8, lead: true },
  { id: 'espn-soccer', name: 'ESPN', topic: 'soccer', url: 'https://www.espn.com/espn/rss/soccer/news', weight: 0.7, lead: true },
];

/**
 * Slot rules: for each topic, the first N picks must satisfy these predicates in order (when any candidate qualifies).
 * Remaining slots are filled by score. `subject` diversity below ensures the three are about different things.
 */
export const SLOT_RULES = {
  finance: [
    { sub: 'politics' },
    { sub: 'finance' },
    { sub: 'markets', match: /\b(stocks?|shares|market|markets|s&p|nasdaq|dow|wall street|index|rally|sell-?off|bonds?|yields?|fed|earnings|investors?|ipo|etf|treasur)/i },
  ],
  world: [{ sub: 'france' }],
  waterpolo: [{ sub: ['ncaa-east', 'ncaa-west'] }],
};

/** Keyword boosts (multiplicative). Kept moderate so importance, not fandom, decides the order. */
export const BOOSTS = {
  soccer: [
    [/\b(ligue 1|ligue1|les bleus|équipe de france|equipe de france|deschamps)\b/i, 1.35],
    [/\b(marseille|olympique de marseille|\bOM\b|vélodrome|velodrome|de zerbi)\b/i, 1.3],
    [/\b(real madrid|bernab[ée]u)\b/i, 1.25],
    [/\b(manchester united|man utd|man united|old trafford)\b/i, 1.2],
    [/\b(champions league|europa league|uefa)\b/i, 1.2],
    [/\b(premier league)\b/i, 1.05],
  ],
  ai: [
    [/\b(analytics|analyst|data|dashboard|power bi|excel|spreadsheet|forecast)\b/i, 1.2],
    [/\b(openai|anthropic|claude|gpt|gemini|llm|agent)\b/i, 1.1],
  ],
  finance: [
    [/\b(fed|federal reserve|interest rate|inflation|stock market|s&p|wall street|jobs report|tariff|budget|debt|tax)\b/i, 1.25],
    [/\b(explain|explained|what is|how does|why|basics|guide)\b/i, 1.2],
  ],
  world: [
    [/\b(france|french|paris|macron|élysée)\b/i, 1.2],
    [/\b(new york|brooklyn|nyc)\b/i, 1.1],
  ],
  waterpolo: [
    [/\b(ncaa|college|collegiate|liu|sharks|brooklyn|cwpa|mpsf)\b/i, 1.3],
    [/\b(coach|coaching|tactic|training|hired|announce)\b/i, 1.15],
  ],
};

/**
 * Subject keys: two stories sharing a subject key are "about the same thing" and only the best one is shown
 * among the first three. Order matters (first match wins).
 */
export const SUBJECTS = {
  soccer: [
    ['om', /\b(marseille|olympique de marseille|\bOM\b|vélodrome|velodrome|de zerbi)\b/i],
    ['psg', /\b(psg|paris saint-germain|paris sg)\b/i],
    ['realmadrid', /\b(real madrid|bernab[ée]u)\b/i],
    ['manutd', /\b(manchester united|man utd|man united|old trafford)\b/i],
    ['lesbleus', /\b(les bleus|équipe de france|equipe de france|deschamps|zidane)\b/i],
    ['barcelona', /\bbarcelona|barça\b/i],
    ['arsenal', /\barsenal\b/i],
    ['liverpool', /\bliverpool\b/i],
    ['mancity', /\b(manchester city|man city)\b/i],
    ['chelsea', /\bchelsea\b/i],
    ['tottenham', /\b(tottenham|spurs)\b/i],
    ['bayern', /\bbayern\b/i],
    ['lyon', /\b(lyon|\bOL\b)\b/i],
    ['monaco', /\bmonaco\b/i],
    ['lille', /\blille|losc\b/i],
    ['wsl', /\b(wsl|women's super league)\b/i],
  ],
  finance: [
    ['fed', /\b(fed|federal reserve|interest rates?|powell|warsh)\b/i],
    ['whitehouse-press', /\b(cnn|politico|ms now|press|reporters?|journalists?)\b.*\b(white house|ban)\b/i],
    ['tariffs', /\btariffs?\b/i],
    ['jobs', /\b(jobs report|unemployment|payrolls|labor market)\b/i],
    ['inflation', /\b(inflation|cpi|prices)\b/i],
    ['oil', /\b(oil|opec|crude|gas prices)\b/i],
    ['ai-stocks', /\b(nvidia|ai stocks|chip)\b/i],
    ['berkshire', /\b(buffett|berkshire)\b/i],
  ],
  world: [
    ['lebanon', /\b(lebanon|hezbollah|beirut)\b/i],
    ['gaza', /\b(gaza|israel|hamas|west bank)\b/i],
    ['ukraine', /\b(ukraine|russia|kyiv|moscow|putin|zelensky)\b/i],
    ['iran', /\b(iran|tehran|houthi|yemen)\b/i],
    ['china', /\b(china|beijing|taiwan|xi jinping)\b/i],
    ['trump', /\btrump\b/i],
    ['macron', /\b(macron|élysée|elysee)\b/i],
    ['zemmour', /\bzemmour\b/i],
  ],
  waterpolo: [
    ['liu', /\b(liu|sharks)\b/i],
    ['cl-quali', /\b(champions league)\b.*\b(qualif|group stage|berth)\b/i],
    ['usawp-junior', /\b(junior national team|roster)\b/i],
  ],
  ai: [
    ['doom', /\b(extinction|kill us all|doom)\b/i],
    ['openai', /\b(openai|chatgpt|altman)\b/i],
    ['google', /\b(google|gemini|deepmind)\b/i],
    ['anthropic', /\b(anthropic|claude)\b/i],
    ['meta', /\b(meta|llama|muse)\b/i],
    ['regulation', /\b(regulat|antitrust|task force|law|bill)\b/i],
    ['python', /\bpython\b/i],
    ['powerbi', /\b(power bi|fabric|dax)\b/i],
  ],
};

/** Match-report patterns: Paolo gets scores elsewhere, so these are down-weighted (not removed). */
export const MATCH_REPORT = [
  /\b\d+\s*[-–]\s*\d+\b/,
  /\bplayer ratings\b/i,
  /\bas it happened\b/i,
  /\blive\b.*\b(updates|blog|text)\b/i,
  /\bmatch report\b/i,
  /\bhighlights?\b/i,
  /\bpredicted line-?ups?\b/i,
  /\bteam news\b/i,
  /\ben direct\b|quelle cha[iî]ne|à quelle heure|\bhow to watch\b|\bwhere to watch\b|\btv channel\b|\blive stream/i,
  /\bcompo(s)? probable/i,
];
/** Water polo is thin and mostly results, so its match-report penalty is milder. */
export const MATCH_REPORT_PENALTY = { default: 0.35, waterpolo: 0.75 };

/** Recency half-life in hours per topic (score halves after this long). Water polo is slow news, so it decays slowly. */
export const HALF_LIFE_HOURS = { ai: 18, world: 14, finance: 14, waterpolo: 72, soccer: 14 };

/** Per-topic freshness: max age in hours to include at all; items older than 48 h are labeled Background. */
export const MAX_AGE_HOURS = { ai: 48, world: 36, finance: 36, waterpolo: 7 * 24, soccer: 36 };

/** How many stories to keep per topic in the file (the app shows 1–6 based on the reading-length setting). */
export const PER_TOPIC = 6;
