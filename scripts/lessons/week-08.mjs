export default {
  week: 8,
  theme: 'Everyday economics',
  lessons: [
    {
      title: 'Inflation: what it is and how it is measured',
      explanation: [
        'Inflation is the general rise in prices over time, which is the same as money losing buying power. At 3% a year, $100 buys what $97 bought last year. The US measures it mainly with the Consumer Price Index (CPI): statisticians track the prices of a fixed basket of goods and services (rent, food, fuel, cars, haircuts) each month and report the change from a year earlier.',
        '"Core" inflation strips out food and energy, not because they do not matter but because they swing with weather and oil markets; core shows the underlying trend. Central banks aim for about 2%: enough to avoid deflation, low enough that people can plan.',
        'Inflation hurts savers holding cash and people on fixed incomes; it helps borrowers with fixed-rate debt, whose repayments shrink in real terms. It also distorts comparisons across time: a salary of $50,000 in 2000 had about the buying power of $90,000 today.',
      ],
      example: [
        'A coffee cost $2.00 in 2015 and $3.00 in 2025: a 50% rise over ten years, roughly 4% a year compounded. If your pay rose 30% over the same period, you can buy less coffee than before even though you earn more. What matters is your "real" (inflation-adjusted) income, not the number on the paycheck.',
      ],
      exercise: { prompt: 'Inflation is 4% and your savings account pays 1.5%. What is happening to the buying power of your savings?', answer: 'It falls about 2.5% a year in real terms. The balance grows, but it buys less.' },
    },
    {
      title: 'Interest rates: the price of time',
      explanation: [
        'An interest rate is the price of borrowing money for a period, or the reward for lending it. The Federal Reserve sets one very short-term rate for banks; everything else (savings rates, mortgages, car loans, credit cards) follows it at a distance, with longer and riskier loans priced higher.',
        'When the Fed raises rates, borrowing costs more, so people and companies spend and invest less, which cools the economy and, eventually, inflation. When it cuts, the reverse. The effect takes months to a year or more to arrive, which is why central banks are always described as acting on forecasts.',
        'Compound interest is the mechanism that makes rates matter so much over time. Money grows on the interest already earned. A rough rule: divide 72 by the rate to get the doubling time. At 7%, money doubles about every 10 years; at 2%, every 36.',
      ],
      example: [
        'A $300,000 mortgage over 30 years costs about $1,265 a month at 3% and about $2,010 at 7%. Same house, same loan; the rate change adds roughly $750 a month, which is why housing markets freeze when rates jump.',
      ],
      exercise: { prompt: 'Using the rule of 72, how long does money take to double at 6%? At 9%?', answer: 'About 12 years at 6%, about 8 years at 9%.' },
    },
    {
      title: 'GDP, growth, and recessions',
      explanation: [
        'Gross Domestic Product is the value of everything a country produces in a year: goods, services, government spending, and net exports. Growth of 2 to 3% a year is normal for a rich economy; 0% is stagnation; two consecutive quarters of decline is the popular shorthand for recession, though the official US call is made by economists looking at jobs, income, and output together.',
        'GDP per person, adjusted for prices, is the usual measure of how rich a country is. It misses much: unpaid work, environmental damage, inequality, and whether people are actually better off. It remains the standard because it is measurable and comparable.',
        'Recessions matter to ordinary people through jobs. Companies cut hiring first, then staff; unemployment rises months after output falls and stays high after growth resumes. That lag is why a recovery can feel like a recession for a long time.',
      ],
      example: [
        'In 2020 US GDP fell about 3.5% for the year, the worst since 1946, yet the recession officially lasted only two months because the rebound was so fast. In 2008–09 the fall was smaller but the recession lasted 18 months and unemployment kept rising for months after it ended.',
      ],
      exercise: { prompt: 'A country\'s GDP grows 2% but its population grows 3%. Is the average person better off?', answer: 'No. GDP per person fell about 1%. Total growth can hide a shrinking share for each individual.' },
    },
    {
      title: 'Taxes in the US: the basics you actually meet',
      explanation: [
        'Income tax in the US is progressive and uses brackets: the first slice of income is taxed at 10%, the next slice at 12%, and so on up to 37%. Moving into a higher bracket taxes only the income above the threshold, not everything. Your "marginal rate" is the rate on your last dollar; your "effective rate" (total tax ÷ income) is always lower.',
        'Payroll taxes (Social Security 6.2% and Medicare 1.45%, matched by your employer) come off every paycheck up to certain limits. Most states add their own income tax; New York State and New York City both do, which is why a Brooklyn paycheck has three income-tax lines. Sales tax is charged at purchase (8.875% in NYC) and is not included in shelf prices, unlike France\'s TVA.',
        'Deductions reduce the income that is taxed; credits reduce the tax itself, dollar for dollar. Contributions to a 401(k) or traditional IRA are deducted now and taxed on withdrawal; Roth versions are the reverse. The filing deadline is 15 April.',
      ],
      example: [
        'A single filer with $60,000 taxable income does not pay 22% on all of it. Roughly: 10% on the first ~$11,600, 12% up to ~$47,000, and 22% only on the portion above that. The bill comes to about $8,500, an effective rate near 14%, even though the marginal rate is 22%. (Bracket thresholds change yearly; the structure does not.)',
      ],
      exercise: { prompt: 'A colleague turns down a raise because it would "push them into a higher bracket and they\'d take home less". Is that right?', answer: 'No. Only the income above the bracket threshold is taxed at the higher rate, so a raise always increases take-home pay (a few benefit cliffs aside). The misunderstanding confuses marginal and effective rates.' },
    },
    {
      title: 'Supply, demand, and why prices are what they are',
      explanation: [
        'Prices settle where the amount people want to buy equals the amount sellers want to sell. When demand rises (a heatwave and air conditioners) or supply falls (a frost and coffee), prices go up until enough buyers drop out or sellers step in. When the reverse happens, prices fall.',
        'How much a price moves depends on how easily people can adjust. Petrol demand barely changes when prices rise (people still need to drive), so small supply shocks cause big price swings. Demand for a particular restaurant drops fast if it raises prices, because there are alternatives next door.',
        'Prices also carry information. A rising price says "make more of this" to producers and "use less" to consumers, without anyone coordinating. Price controls (rent caps, price ceilings) block that signal; they help those already inside but usually create shortages for everyone else.',
      ],
      example: [
        'Egg prices in the US roughly doubled in 2022–23 when avian flu killed tens of millions of laying hens. Supply fell, demand stayed (people kept eating eggs), so prices jumped. As flocks were rebuilt over the following year, supply recovered and prices fell back. No conspiracy was needed to explain either move.',
      ],
      exercise: { prompt: 'Why does a strict rent cap tend to reduce the number of apartments available over time?', answer: 'Below-market rents give landlords less reason to maintain or build rental units and more reason to convert or sell them, while demand rises because the price is low. Fewer units, longer queues.' },
    },
    {
      title: 'Money, banks, and what a bank actually does',
      explanation: [
        'A bank takes deposits and lends most of them out, keeping only a fraction on hand, because on any normal day only a few depositors want their money. The gap between what it pays depositors and charges borrowers is its profit. This works as long as depositors trust that their money is there; a rumor that it is not causes a run, and even a healthy bank cannot pay everyone at once.',
        'Two protections exist. Deposit insurance (FDIC in the US, up to $250,000 per depositor per bank) removes the reason for ordinary savers to run. The central bank acts as lender of last resort, providing cash to solvent banks facing a panic.',
        'Most money is not cash but bank deposits: numbers in accounts, created when banks make loans. That is why the Fed can influence the money supply through interest rates and bank rules, and why a financial crisis (banks refusing to lend) can shrink the economy without any physical cash disappearing.',
      ],
      example: [
        'In March 2023 Silicon Valley Bank failed in about 48 hours after depositors, many with balances far above the insured limit, withdrew $42 billion in one day. The bank had bought long-term bonds that lost value when rates rose (Week 3, Day 4). Regulators guaranteed all deposits to stop the panic spreading to other banks.',
      ],
      exercise: { prompt: 'Why does deposit insurance make banks safer even if it is never paid out?', answer: 'It removes the incentive to run. If savers know they will be repaid, they do not rush to withdraw at the first rumor, so the self-fulfilling panic never starts.' },
    },
    {
      title: 'Trade, tariffs, and exchange rates',
      explanation: [
        'Countries trade because each is relatively better at producing some things; both gain by specializing and swapping, even if one is better at everything. Trade lowers prices and widens choice for consumers but can hit specific industries and towns hard when competition arrives. Those concentrated losses drive the politics.',
        'A tariff is a tax on imports. It is paid by the importer and mostly passed to domestic buyers as higher prices; it protects domestic producers of that good at the expense of everyone who buys it, and invites retaliation. Tariffs are also used as bargaining chips, which is why their announcement and removal move markets.',
        'An exchange rate is the price of one currency in another. A strong dollar makes foreign trips and imports cheaper for Americans and US exports pricier abroad. Rates move with interest-rate differences (money flows toward higher yields), trade balances, and confidence. If you earn dollars and send money to France, a strong dollar is good news.',
      ],
      example: [
        'The euro at $1.05 versus $1.20: a €1,000 flight and hotel costs an American $1,050 in the first case and $1,200 in the second, a 14% difference from the exchange rate alone. Conversely, a French visitor to New York feels the second case as much cheaper.',
      ],
      exercise: { prompt: 'A 25% tariff is placed on imported washing machines. Name one group that gains and two that lose.', answer: 'Gains: domestic washing-machine makers (and their workers). Loses: consumers paying higher prices for all washing machines (domestic makers raise prices too), and exporters hit by retaliatory tariffs.' },
    },
  ],
};
