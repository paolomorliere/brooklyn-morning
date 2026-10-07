// Sources for the morning edition. All public RSS/Atom feeds; no keys, no paid APIs.
// weight: relative importance inside a topic. lead: true = non-paywalled, OK to extract opening paragraphs.
// sub: a sub-slot label used by SLOT_RULES to guarantee variety (e.g. one politics + one finance + one markets story).
// lang: 'fr' items are kept but scored slightly lower so English leads each section.

export const TOPICS = ['ai', 'world', 'finance', 'waterpolo', 'soccer'];

export const FEEDS = [
  // 1) AI, data & analytics
  //
  // Both of these used to be the publisher's general-interest feed, and the section was only as
  // on-topic as those publishers' front pages happened to be. On 7 October 2026 MIT Technology
  // Review's main feed carried ten items of climate tech and biotech and not one about AI, and
  // `technology-lab` was security, space and hardware. The topic feeds below are AI-only at source.
  // (`technologyreview.com/topic/data/feed/` answers 200 with no items, so there is no data-topic
  // equivalent; the data side of this section comes from Power BI and Real Python, plus TOPIC_KEYWORDS.)
  { id: 'mit-tr', name: 'MIT Technology Review', topic: 'ai', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', weight: 1.0, lead: true },
  { id: 'ars-tech', name: 'Ars Technica', topic: 'ai', url: 'https://arstechnica.com/ai/feed/', weight: 0.9, lead: true },
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
  // Three keys used to be the whole water polo list, which is why 7 October 2026 ran two write-ups of
  // the same four Champions League results next to each other: one matched `cl-quali`, the other
  // matched nothing, and a story with no subject can never collide with one that has a subject. These
  // cover the competitions and the recurring CWPA notices. The real safety net is `sameStory` in
  // rank.mjs, which needs no hand-written pattern at all — this list only orders the top three.
  waterpolo: [
    ['liu', /\b(liu|long island university|sharks)\b/i],
    ['champions-league', /\b(champions league|len champions)\b/i],
    ['euro-cup', /\b(euro cup)\b/i],
    ['national-team', /\b(junior national team|national team|team usa|panam|pan am|world championship|olympic)\b/i],
    ['cwpa-schedule', /\bcollegiate water polo association\b.*\b(schedule|division)\b/i],
    ['cwpa-scores', /\b(varsity scores|week \d+\/)\b/i],
    ['poll', /\b(top 20|poll|rank(ing|ings)?)\b.*\b(water polo|varsity)\b/i],
    ['awards', /\b(cutino|award|player of the week|all-american|watch list|hall of fame)\b/i],
    ['coaching', /\b(head coach|assistant coach|seeks .*coach|named .*coach)\b/i],
    ['ncaa-game', /\b(defeat|beat|upset|win|wins|falls|loss|overtime|\d+-\d+)\b/i],
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

/**
 * The near-duplicate thresholds, published rather than buried, because they decide what Paolo does not
 * get to read.
 *
 * Two stories are the same story when they share at least `minShared` proper nouns that are rare in the
 * topic's candidate pool, and those shared names make up at least `minOverlap` of the shorter story's
 * rare vocabulary. A name counts as rare when it appears in no more than `maxShare` of the pool (never
 * fewer than two items, since a shared name is in at least two by definition).
 *
 * These three numbers were chosen by running every setting over 21 hand-labelled pairs taken from the
 * fourteen archived editions — 16 real duplicates and 5 pairs that merely share a section's vocabulary —
 * at the pool sizes the live build actually sees. At these values 15 of the 16 duplicates are caught and
 * none of the 5 look-alikes are. `scripts/replay-rules.mjs` re-runs that measurement at any time.
 *
 * The one miss is "Man City rule breaches not my concern — Mancini" against "Mancini refers to 'double'
 * Manchester City contract": in a soccer pool, "Manchester" and "City" are too common to count, which
 * leaves only "Mancini" — one name, and one name is not evidence. `SUBJECTS.soccer` has a `mancity` key
 * that separates those two anyway.
 */
export const NEAR_DUPLICATE = { maxShare: 0.15, minShared: 2, minOverlap: 0.25 };

/**
 * Categories that mean "this is an advertisement", matched against the labels the publisher puts on its
 * own item. Dropped from every topic, not just AI.
 *
 * This is the no-advertising rule, enforced where the advertising actually arrives. MIT Technology
 * Review's AI feed is 40% `sponsored` — four of ten items on 7 October 2026 — and until the parser
 * started reading `<category>` all four were ordinary candidates for the edition.
 */
export const SPONSORED_CATEGORIES = [
  /^sponsored$/,
  /^sponsor(ed)? content$/,
  /^paid (post|content|programme?|program)$/,
  /^partner content$/,
  /^advertorial$/,
  /^promoted$/,
  /^brand(ed)? (content|post)$/,
  /^in partnership with\b/,
  /^presented by\b/,
];

/**
 * A topic's own vocabulary: an item has to look like it belongs before it can fill a slot.
 *
 * Only `ai` has one, because only `ai` has the problem. Its topic is assigned per *feed*, and two of
 * its six feeds were general-interest, so "AI & Data" meant "whatever those publishers posted". Swapping
 * in the AI-only feeds fixes today; this gate is what stops a publisher reorganising its feeds from
 * quietly refilling the section with biotech again tomorrow.
 *
 * The vocabulary deliberately covers the data and analytics side as well as AI, because that is half of
 * what the section is for: Power BI, DAX, SQL, Python and Excel are the tools Paolo actually works in.
 * Matched case-insensitively against the title, the excerpt and the publisher's own categories — so an
 * item the publisher filed under "Artificial intelligence" passes on that alone.
 */
export const TOPIC_KEYWORDS = {
  ai: [
    /\b(a\.?i\.?|artificial intelligence|machine learning|deep learning|neural net)/i,
    /\b(llm|llms|gpt|chatgpt|claude|gemini|copilot|transformer|diffusion model|embedding)/i,
    /\b(openai|anthropic|deepmind|hugging face|mistral|nvidia|cuda)\b/i,
    /\b(agent|agentic|chatbot|prompt|fine-?tun|inference|token|training data|model weights)/i,
    /\b(algorithm|automation|robot|autonomous|computer vision|speech recognition)/i,
    /\b(data|dataset|database|analytics|statistic|dashboard|visuali[sz]ation|metric)/i,
    /\b(python|pandas|numpy|jupyter|notebook|\bsql\b|\bdax\b|power bi|power query|excel|spreadsheet|tableau)/i,
    /\b(data (science|engineer|warehouse|lake|pipeline|model)|business intelligence|\bETL\b|\bBI\b)/i,
  ],
};
