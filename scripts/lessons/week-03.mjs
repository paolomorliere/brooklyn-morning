export default {
  week: 3,
  theme: 'The stock market, one level up',
  lessons: [
    {
      title: 'Funds and ETFs: buying the whole basket',
      explanation: [
        'Picking individual stocks means betting on a few companies. A fund pools money from many investors and buys hundreds or thousands of stocks at once, so a single bad company barely dents you. There are two common wrappers. A mutual fund is bought from the fund company at the end-of-day price. An ETF (exchange-traded fund) trades on an exchange all day like a stock.',
        'The bigger split is index versus active. An index fund simply holds everything in an index such as the S&P 500, in the same proportions, and charges very little (often under 0.1% a year). An active fund pays managers to pick winners and charges more (often 0.5% to 1% or higher). Over long periods, the large majority of active funds have failed to beat their index after fees.',
        'Fees look small but compound. One percent a year over thirty years eats roughly a quarter of what you would otherwise end up with.',
      ],
      example: [
        'Two people invest $10,000 for 30 years, both earning 7% before fees. One pays 0.05% in an index fund and ends with about $75,000. The other pays 1% in an active fund and ends with about $57,000. Same market, same years; the fee difference alone cost about $18,000.',
      ],
      exercise: { prompt: 'An S&P 500 index fund charges 0.03% a year. On $20,000 invested, what is the yearly fee in dollars?', answer: '$20,000 × 0.0003 = $6 a year.' },
    },
    {
      title: 'Dividends and what companies do with profit',
      explanation: [
        'When a company earns a profit it has three choices: keep the cash to reinvest (new stores, research, paying down debt), pay a dividend to shareholders, or buy back its own shares. Young, fast-growing companies usually reinvest everything. Mature ones with steady profits (utilities, consumer brands) tend to pay dividends.',
        'A dividend is typically paid quarterly. The yield is the yearly dividend divided by the share price; 2% to 4% is common for dividend-paying companies. A very high yield (8%+) is often a warning: the price has fallen because investors doubt the dividend will last.',
        'Buybacks reduce the number of shares, so each remaining share owns a larger slice of the company. Economically this is similar to a dividend, but it is taxed differently and does not commit the company to a regular payment.',
      ],
      example: [
        'Company A trades at $60 and pays $0.45 per share each quarter: $1.80 a year, a 3% yield. Company B trades at $400, pays nothing, and spends its profit on new factories. Neither choice is "better". A suits someone who wants income now; B suits someone betting on growth.',
      ],
      exercise: { prompt: 'A company has 1,000,000 shares and buys back 100,000. You own 1,000 shares. What percentage of the company did you own before and after?', answer: 'Before: 0.1%. After: 1,000 ÷ 900,000 ≈ 0.111%. Your slice grew without you buying anything.' },
    },
    {
      title: 'Valuation basics: the P/E ratio',
      explanation: [
        'The price-to-earnings ratio is the share price divided by the company\'s profit per share over a year. A P/E of 20 means you pay $20 for every $1 of yearly profit; equivalently, at today\'s profit it would take 20 years to earn back the price.',
        'A high P/E says investors expect profits to grow fast; a low P/E says they expect slow growth or trouble. Neither is automatically good or bad. Comparing P/E across very different industries is misleading (a software company and a steel mill live in different worlds), but comparing a company to its own history or to close peers is useful.',
        'Two variations: trailing P/E uses the last twelve months of profit; forward P/E uses analysts\' forecast for the next twelve. The S&P 500 as a whole has historically averaged a P/E in the mid-teens to about 20; well above that has often, though not always, preceded weaker returns.',
      ],
      example: [
        'Two grocery chains: one trades at a P/E of 14, the other at 28. Same industry, so the gap is meaningful. Either the second is growing much faster and deserves it, or investors are overexcited. The ratio does not tell you which; it tells you where to look.',
      ],
      exercise: { prompt: 'A stock trades at $150. The company earned $5 per share last year and is expected to earn $7.50 next year. What are the trailing and forward P/E?', answer: 'Trailing: 150 ÷ 5 = 30. Forward: 150 ÷ 7.5 = 20.' },
    },
    {
      title: 'Bonds: the other half of the market',
      explanation: [
        'A bond is a loan. You lend money to a government or company; they pay you interest (the coupon) on a schedule and return the principal at maturity. Unlike a shareholder, a bondholder gets nothing extra if the borrower does brilliantly, but is paid before shareholders if things go badly.',
        'Bonds trade too, and there is one rule to remember: when interest rates rise, existing bond prices fall. If new bonds pay 5% and yours pays 3%, nobody will buy yours at full price. The longer the time to maturity, the bigger the swing.',
        'US government bonds (Treasuries) are considered about the safest asset in the world; the 10-year Treasury yield is watched constantly because mortgage rates and company borrowing costs follow it. Corporate bonds pay more to compensate for the risk of default; "junk" or high-yield bonds pay the most.',
      ],
      example: [
        'You buy a $1,000 bond paying 3% (that is, $30 a year) for ten years. A year later, new ten-year bonds pay 5%. To sell yours, you would have to drop the price to roughly $850 so the buyer\'s effective return matches 5%. If you simply hold to maturity, you still get your $30 a year and $1,000 back; the loss only exists if you sell.',
      ],
      exercise: { prompt: 'Rates fall from 4% to 3%. What happens to the price of a bond you already own that pays 4%?', answer: 'It rises. Your 4% coupon is now above what new bonds offer, so buyers will pay more than face value for it.' },
    },
    {
      title: 'Diversification and asset allocation',
      explanation: [
        'Diversification means not depending on any single outcome. Across companies: owning hundreds instead of a few. Across countries: US, Europe, emerging markets. Across asset types: stocks, bonds, cash. The point is not to maximize return but to make sure one bad event cannot wreck you.',
        'Asset allocation is the big decision: what share in stocks versus bonds versus cash. It matters more than which specific fund you pick. More stocks means higher expected long-run return and bigger swings; more bonds smooths the ride but grows slower. A common rule of thumb ties the stock share to your time horizon: money needed soon leans toward bonds and cash, money for decades away leans toward stocks.',
        'Rebalancing means occasionally selling what has grown and buying what has lagged to return to your target mix. It forces a "sell high, buy low" discipline without needing to predict anything.',
      ],
      example: [
        'You set a 70/30 stock/bond target. After a strong year stocks are 78% of your money. Rebalancing means selling some stocks and buying bonds to get back to 70/30. After a crash, stocks might be 60%; you do the reverse. Both moves feel uncomfortable at the time, which is exactly why a fixed rule helps.',
      ],
      exercise: { prompt: 'Someone holds ten stocks that are all US banks. Are they diversified?', answer: 'Not really. Ten holdings is better than one, but they all face the same risks (interest rates, a credit crisis, bank regulation). Real diversification needs different industries, countries, and asset types.' },
    },
    {
      title: 'Reading financial news without panicking',
      explanation: [
        'Financial headlines are built to grab attention: "stocks plunge", "market rout", "$500 billion wiped out". Translate them. A 2% daily drop is ordinary; it happens several times a year. "Wiped out" means prices fell; the companies still exist and the money returns when prices recover. "Worst day since X" only tells you the recent past was calm.',
        'Look for the reference point. "Down 15% this year" and "up 40% over two years" can describe the same stock. Check whether a number is a level or a change, a day or a year, nominal or after inflation.',
        'Be wary of explanations. Every day journalists must say why the market moved, so they attach the day\'s biggest news to the day\'s price move. Often the honest answer is "more sellers than buyers, for many small reasons". Predictions from strategists have a poor track record; their job is to have a view, not to be right.',
      ],
      example: [
        '"Dow plunges 600 points" sounds dramatic. If the Dow was at 40,000, that is 1.5%. The same headline in 1990, when the Dow was near 2,500, would have meant a 24% crash. Points are meaningless without the level; always convert to percent.',
      ],
      exercise: { prompt: 'A headline reads "Tech giant loses $100 billion in value in one day". The company was worth $2.5 trillion. How big a move is that, and did anyone "lose" $100 billion in cash?', answer: 'About 4%, a normal bad day for a large stock. No cash left anyone\'s account; the market price of shares fell. Holders only realize a loss if they sell at the lower price.' },
    },
    {
      title: 'Common traps: timing, tips, and fees',
      explanation: [
        'Market timing (getting out before falls and back in before rises) sounds sensible and almost nobody does it well, including professionals. Missing just the ten best days over a couple of decades has historically cut returns roughly in half, and those days tend to sit right next to the worst days. A regular, automatic investment (the same amount every month) removes the decision entirely.',
        'Hot tips, meme stocks, and anything promising fast, sure returns share a feature: by the time you hear about them, the easy money is gone and you are likely the buyer someone else is selling to. Individual stock picking is closer to entertainment than investing for most people; if you do it, keep it to a small slice.',
        'Fees and taxes are the drag you control. Prefer low-cost index funds, avoid frequent trading, and use tax-advantaged accounts where available (in the US, a 401(k) or IRA). None of this is advice for your situation; it is the consensus of what the evidence shows, and the starting point for your own research or a conversation with a professional.',
      ],
      example: [
        'Someone invests $300 on the first of every month regardless of headlines. In a month when prices are high, $300 buys fewer shares; when prices crash, the same $300 buys more. Over years this "dollar-cost averaging" produces a lower average price than most people manage by trying to pick moments, and it costs no attention at all.',
      ],
      exercise: { prompt: 'A colleague says a stock "can only go up" because a big product launches next month. What is the flaw in the reasoning?', answer: 'If the launch is public knowledge, it is already priced in. The stock will move on whether the launch beats or misses expectations, not on the launch happening.' },
    },
  ],
};
