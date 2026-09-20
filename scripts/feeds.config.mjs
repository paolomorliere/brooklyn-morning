// Sources for the morning edition. All public RSS/Atom feeds; no keys, no paid APIs.
// weight: relative importance inside a topic. lead: true = non-paywalled, OK to extract opening paragraphs at build time.
// lang: 'fr' items are kept but scored slightly lower so English leads each section.

export const TOPICS = ['ai', 'world', 'finance', 'waterpolo', 'soccer'];

export const FEEDS = [
  // 1) AI, data & analytics
  { id: 'mit-tr', name: 'MIT Technology Review', topic: 'ai', url: 'https://www.technologyreview.com/feed/', weight: 1.0, lead: true },
  { id: 'ars-tech', name: 'Ars Technica', topic: 'ai', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', weight: 0.9, lead: true },
  { id: 'verge-ai', name: 'The Verge', topic: 'ai', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', weight: 0.8, lead: true },
  { id: 'willison', name: 'Simon Willison', topic: 'ai', url: 'https://simonwillison.net/atom/entries/', weight: 0.6, lead: true },
  { id: 'powerbi', name: 'Power BI Blog', topic: 'ai', url: 'https://powerbi.microsoft.com/en-us/blog/feed/', weight: 0.8, lead: true },
  { id: 'realpython', name: 'Real Python', topic: 'ai', url: 'https://realpython.com/atom.xml', weight: 0.4, lead: true },

  // 2) World, US & France
  { id: 'npr-news', name: 'NPR', topic: 'world', url: 'https://feeds.npr.org/1001/rss.xml', weight: 1.0, lead: true },
  { id: 'bbc-world', name: 'BBC News', topic: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', weight: 0.9, lead: true },
  { id: 'bbc-us', name: 'BBC News', topic: 'world', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', weight: 0.8, lead: true },
  { id: 'france24', name: 'France 24', topic: 'world', url: 'https://www.france24.com/en/france/rss', weight: 0.9, lead: true },
  { id: 'lemonde-en', name: 'Le Monde in English', topic: 'world', url: 'https://www.lemonde.fr/en/rss/une.xml', weight: 0.8, lead: false },
  { id: 'lemonde-fr', name: 'Le Monde', topic: 'world', url: 'https://www.lemonde.fr/rss/une.xml', weight: 0.6, lead: false, lang: 'fr' },

  // 3) Politics & finance, plain-language sources
  { id: 'npr-politics', name: 'NPR Politics', topic: 'finance', url: 'https://feeds.npr.org/1014/rss.xml', weight: 0.9, lead: true },
  { id: 'npr-business', name: 'NPR Business', topic: 'finance', url: 'https://feeds.npr.org/1006/rss.xml', weight: 1.0, lead: true },
  { id: 'bbc-business', name: 'BBC Business', topic: 'finance', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', weight: 0.9, lead: true },
  { id: 'cnbc-top', name: 'CNBC', topic: 'finance', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', weight: 0.6, lead: false },

  // 4) Water polo — thin; keep everything that works
  { id: 'total-wp', name: 'Total Waterpolo', topic: 'waterpolo', url: 'https://total-waterpolo.com/feed/', weight: 1.0, lead: true },
  { id: 'usawp', name: 'USA Water Polo', topic: 'waterpolo', url: 'https://usawaterpolo.org/rss', weight: 0.9, lead: true },
  { id: 'len', name: 'LEN', topic: 'waterpolo', url: 'https://len.eu/feed/', weight: 0.9, lead: true },

  // 5) Soccer — Ligue 1 & Les Bleus, then Europe, then Premier League; clubs OM, Real Madrid, Man United
  { id: 'lequipe-foot', name: "L'Équipe", topic: 'soccer', url: 'https://dwh.lequipe.fr/api/edito/rss?path=/Football/', weight: 1.0, lead: false, lang: 'fr' },
  { id: 'rmc-foot', name: 'RMC Sport', topic: 'soccer', url: 'https://rmcsport.bfmtv.com/rss/football/', weight: 0.8, lead: false, lang: 'fr' },
  { id: 'guardian-l1', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/ligue1football/rss', weight: 1.0, lead: true },
  { id: 'guardian-rm', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/realmadrid/rss', weight: 0.9, lead: true },
  { id: 'guardian-mu', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/manchester-united/rss', weight: 0.8, lead: true },
  { id: 'guardian-foot', name: 'The Guardian', topic: 'soccer', url: 'https://www.theguardian.com/football/rss', weight: 0.7, lead: true },
  { id: 'bbc-foot', name: 'BBC Sport', topic: 'soccer', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', weight: 0.7, lead: true },
  { id: 'espn-soccer', name: 'ESPN', topic: 'soccer', url: 'https://www.espn.com/espn/rss/soccer/news', weight: 0.6, lead: true },
];

/** Keyword boosts (multiplicative). Matched case-insensitively against title + excerpt. */
export const BOOSTS = {
  soccer: [
    [/\b(ligue 1|ligue1|les bleus|équipe de france|equipe de france|france national|deschamps)\b/i, 1.6],
    [/\b(marseille|olympique de marseille|\bOM\b|vélodrome|velodrome|de zerbi)\b/i, 1.7],
    [/\b(real madrid|bernab[ée]u|madrid)\b/i, 1.5],
    [/\b(manchester united|man utd|man united|old trafford)\b/i, 1.4],
    [/\b(champions league|europa league|conference league|uefa)\b/i, 1.3],
    [/\b(premier league)\b/i, 1.1],
    [/\b(psg|paris saint-germain|lyon|monaco|lille|nice|lens)\b/i, 1.15],
  ],
  ai: [
    [/\b(analytics|analyst|data|dashboard|power bi|excel|spreadsheet|sql|forecast)\b/i, 1.3],
    [/\b(openai|anthropic|claude|gpt|gemini|llm|model|agent)\b/i, 1.15],
  ],
  finance: [
    [/\b(fed|federal reserve|interest rate|inflation|stock market|s&p|wall street|jobs report|tariff|budget|debt|tax)\b/i, 1.3],
    [/\b(explain|explained|what is|how does|why|basics|guide)\b/i, 1.2],
  ],
  world: [
    [/\b(france|french|paris|macron|élysée)\b/i, 1.25],
    [/\b(new york|brooklyn|nyc)\b/i, 1.15],
  ],
  waterpolo: [
    [/\b(ncaa|college|collegiate|lion|liu|brooklyn)\b/i, 1.3],
    [/\b(coach|coaching|tactic|training)\b/i, 1.2],
    [/\b(world cup|world championship|olympic|champions league|euro)\b/i, 1.1],
  ],
};

/** Match-report patterns: Paolo gets scores elsewhere, so these are down-weighted (not removed). */
export const MATCH_REPORT = [
  /\b\d+\s*[-–]\s*\d+\b/, // 2-1
  /\bplayer ratings\b/i,
  /\bas it happened\b/i,
  /\blive\b.*\b(updates|blog|text)\b/i,
  /\bmatch report\b/i,
  /\bhighlights?\b/i,
  /\bpredicted line-?ups?\b/i,
  /\bteam news\b/i,
];

/** Per-topic freshness: max age in hours to include at all; items older than 48 h are labeled Background. */
export const MAX_AGE_HOURS = { ai: 48, world: 36, finance: 36, waterpolo: 7 * 24, soccer: 36 };

/** How many stories to keep per topic in the file (the app shows 1–6 based on the reading-length setting). */
export const PER_TOPIC = 6;
