// Store-section mapping shared by the catalog builder (Node) and the app (browser).
// Tag rules match whole hyphen-separated tokens inside Open Food Facts `categories_tags` (without `en:`).
// Name rules are a fallback when tags are missing. First match wins, so order matters.

export const SECTIONS = ['Produce', 'Bakery', 'Dairy & Eggs', 'Meat & Seafood', 'Frozen', 'Pantry', 'Snacks', 'Beverages', 'Cheese & Deli', 'Flowers & Home', 'Other'];

const GENERIC_TAGS = /^(groceries|foods?|plant-based-foods(-and-beverages)?|meals|dishes|prepared-meals|snacks-sweet|snacks-salty)$/;

// tokens: regex tested against " tag1 tag2 " where hyphens are replaced by spaces, so \b works per word.
const TAG_RULES = [
  ['Frozen', /\bfrozen\b|\bice creams?\b|\bsorbets?\b|\bgelato\b|\bpopsicles?\b/],
  ['Meat & Seafood', /\bmeats?\b|\bpoultry\b|\bchickens?\b|\bbeef\b|\bpork\b|\bturkeys?\b|\bsausages?\b|\bbacon\b|\bseafood\b|\bfish(es)?\b|\bshrimps?\b|\bsalmon\b|\btuna\b|\bcanned fish\b|\bsardines?\b|\banchov(y|ies)\b|\bmackerel\b|\boysters?\b|\bclams?\b|\bcrabs?\b|\bscallops?\b|\bseafood\b/],
  ['Beverages', /\bbeverages?\b|\bjuices?\b|\bsodas?\b|\bcoffees?\b|\bteas?\b|\bwaters?\b|\bkombucha\b|\bwines?\b|\bbeers?\b|\bciders?\b|\bmilk substitutes?\b|\bplant milks?\b|\bsmoothies?\b|\bdrinks?\b|\blemonades?\b/],
  ['Snacks', /\bdried fruits?\b|\bchips\b|\bcrisps\b|\bcrackers?\b|\bcookies?\b|\bbiscuits?\b|\bcandies\b|\bcandy\b|\bchocolates?\b|\bconfectioneries\b|\bpopcorn\b|\bpretzels?\b|\bnuts\b|\bseeds\b|\btrail mixes?\b|\bcereal bars?\b|\bsnacks?\b|\bjerky\b|\bgranola bars?\b/],
  ['Bakery', /\bbreads?\b|\bbagels?\b|\bbuns\b|\btortillas?\b|\bpitas?\b|\bnaans?\b|\bcroissants?\b|\bpastries\b|\bviennoiseries\b|\bmuffins?\b|\bbrioches?\b|\bbaked goods\b|\bcakes\b/],
  ['Cheese & Deli', /\bcheeses?\b|\bcharcuteries?\b|\bcold cuts?\b|\bsalamis?\b|\bprosciutt[oi]\b|\bhummus\b|\bdips?\b|\bpates?\b|\bolives?\b|\btapenades?\b|\bantipasti\b/],
  ['Dairy & Eggs', /\bdairies\b|\bdairy\b|\byogurts?\b|\bbutters?\b(?! spreads)|\bcreams?\b|\beggs?\b|\bkefirs?\b|\bmilks?\b/],
  ['Flowers & Home', /\bflowers?\b|\bhousehold\b|\bcleaning\b|\bsoaps?\b|\blotions?\b|\bcosmetics?\b|\bcandles?\b|\bpaper\b|\bhygiene\b|\bbody care\b/],
  ['Pantry', /\bcereals?\b|\bgranolas?\b|\boats?\b|\bpastas?\b|\brice\b|\bgrains?\b|\bflours?\b|\bsugars?\b|\bbaking\b|\bspices?\b|\bseasonings?\b|\bsauces?\b|\bcondiments?\b|\bdressings?\b|\boils?\b|\bvinegars?\b|\bcanned\b|\blegumes?\b|\bbeans?\b|\bsoups?\b|\bbroths?\b|\bspreads?\b|\bjams?\b|\bhoneys?\b|\bsyrups?\b|\bnut butters?\b|\bnoodles?\b|\bmeals?\b|\bdishes\b|\bsalsas?\b|\bmustards?\b|\bpickles?\b|\bsweeteners?\b/],
  ['Produce', /\bfresh (fruits?|vegetables?)\b|\bsalads?\b|\bfresh herbs?\b|\bmushrooms?\b|\bpotatoes\b|\bonions?\b|\btomatoes\b|\bavocados?\b|\bberries\b|\bapples?\b|\bbananas?\b|\bcitrus\b|\bvegetables?\b|\bfruits?\b/],
];

const NAME_RULES = [
  ['Frozen', /\bfrozen\b|ice cream|sorbet|gelato|\bpizza\b|dumpling|gyoza|gnocchi|orange chicken|\bmochi\b|waffles?\b|\bburritos?\b|\bentr[ée]e\b|\bfries\b|pot ?stickers?/i],
  ['Meat & Seafood', /chicken(?! broth| stock)|\bbeef\b(?! broth)|\bpork\b|turkey|sausage|bacon|salmon|shrimp|\btuna\b|steak|\blamb\b|meatball|\bfish\b|\bhot dogs?\b|sardines?|anchov|mackerel|oysters?|clams?|\bcrab\b|scallops?|\bcod\b|tilapia|halibut|mahi|lobster|calamari|octopus|\btrout\b|\bham\b|\bribs?\b|brisket|pepperoni|chorizo/i],
  ['Beverages', /\bjuice\b|sparkling|(?<!in )(?<!packed in )\bwater\b(?! chestnut| cracker)|\bsoda\b|\bcoffee\b|\bteas?\b|kombucha|\bwine\b|\bbeer\b|\bcider\b|oat milk|almond milk|lemonade|cold brew|\bmilk\b(?! chocolate)/i],
  ['Cheese & Deli', /\bcheese\b(?!cake)|cheddar|\bbrie\b|gouda|mozzarella|parmesan|\bfeta\b|salami|prosciutto|hummus|\bdip\b|olives|burrata|manchego|gruy|tapenade|\bpâté\b|\bpate\b/i],
  ['Dairy & Eggs', /yogurt|\bbutter\b(?! cups| cookies)|\bcream\b(?! cheese| of)|\beggs?\b|kefir|\bsour cream\b/i],
  ['Bakery', /\bbread\b|bagel|\bbuns?\b|\brolls?\b|tortilla|\bpita\b|\bnaan\b|croissant|muffin|brioche|baguette|sourdough|challah|\bcake\b|\bpie\b|\bscones?\b/i],
  ['Snacks', /\bchips?\b|cracker|cookie|biscuit|candy|chocolate|popcorn|pretzel|\bnuts?\b|almonds|cashews|pistachios|trail mix|\bbars?\b|jerky|\bdried\b|gummies|crisps|\bpuffs\b|peanut butter cups|\bcrunch\b|\bsnack/i],
  ['Flowers & Home', /\bflowers?\b|bouquet|\bsoap\b|lotion|shampoo|candle|body wash|tissue|sunscreen|\bsponges?\b/i],
  ['Pantry', /cereal|granola|\boats\b|pasta|\brice\b|quinoa|flour|sugar|baking|spice|seasoning|sauce|salsa|condiment|dressing|\boil\b|vinegar|canned|beans|\bsoup\b|broth|stock|spread|\bjam\b|honey|syrup|peanut butter|almond butter|noodle|marinara|pesto|mustard|ketchup|mayo|tahini|curry|simmer|\bmix\b|\bcoconut\b|lentils|chickpeas|\bhummus\b/i],
  ['Produce', /\bsalad\b|squash|zucchini|cucumber|\bcorn\b(?! chips| tortilla)|\bgreens\b|\bpears?\b|\bpeach|\bplums?\b|\bcherr|\bmelon|\bmango(?! salsa)|pineapple|\bcelery|asparagus|\bbeets?\b|\bgarlic\b(?! powder| salt)|ginger root|\bshallots?\b|\bsprouts\b|\bcabbage|\bleeks?\b|\bfennel\b|\bradish|\bturnip|\bparsnip|arugula|\bromaine|\bbasil\b(?! pesto)|cilantro|\bmint\b(?! tea| chocolate)|\bherbs?\b|mushroom|potato(?! chips)|\bonions?\b|tomato(?! sauce| paste)|avocado|berries|\bapples?\b|\bbananas?\b|lettuce|broccoli|cauliflower(?! gnocchi| pizza)|\bpeppers?\b(?!mint)|\bgrapes\b|\blemons?\b|\blimes?\b|\bspinach\b|\bkale\b|\bcarrots?\b|\bfigs?\b|\bcuties\b|\bmandarins?\b/i],
];

function tagText(tags) {
  return ' ' + (tags ?? []).map((x) => x.replace(/^[a-z]{2}:/, '')).filter((x) => !GENERIC_TAGS.test(x)).join(' ').replace(/-/g, ' ') + ' ';
}

/** @param {string[]|null|undefined} tags @param {string} name @returns {string} */
export function sectionFor(tags, name) {
  const t = tagText(tags);
  if (t.trim()) for (const [section, re] of TAG_RULES) if (re.test(t)) return section;
  for (const [section, re] of NAME_RULES) if (re.test(name)) return section;
  return 'Other';
}

/** Short descriptive tags for discovery matching: last few specific category segments. */
export function tagsFor(tags) {
  return [...new Set((tags ?? []).map((x) => x.replace(/^[a-z]{2}:/, '')).filter((x) => x.length > 2 && !GENERIC_TAGS.test(x)))].slice(-4);
}
