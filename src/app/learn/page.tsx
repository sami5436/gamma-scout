import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Plain English explanation of gamma exposure, call and put walls, the gamma flip, and how Gamma scores debit spreads and long options.",
};

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/[0.08] pt-6">
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="tnum text-[11px] font-semibold text-sky-400/70">{n}</span>
        <h2 className="text-[17px] font-semibold tracking-tight text-zinc-50">{title}</h2>
      </div>
      <div className="space-y-3 text-[14px] leading-[1.65] text-zinc-400">{children}</div>
    </section>
  );
}

/** A short, highlighted comparison. The whole page leans on these. */
function Picture({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-3.5 py-3">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-sky-300/80">Picture it</div>
      <p className="text-[13.5px] leading-[1.6] text-zinc-300">{children}</p>
    </div>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-zinc-100">{children}</strong>;
}

export default function Learn() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-8 sm:pt-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-zinc-500 active:text-zinc-300"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to the scanner
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">How it works</h1>
      <p className="mt-2 text-[14px] leading-[1.65] text-zinc-400">
        No jargon, no math. Just what the app is looking at and why any of it should
        change what you buy.
      </p>

      <div className="mt-8 space-y-8">
        <Section n="01" title="Who is on the other side of your trade">
          <p>
            When you buy a call, somebody sells it to you. That somebody is usually a
            market maker, and they do not want a bet on the stock. They want the fee for
            making the trade. So the moment they sell you that call, they go buy shares to
            cancel out the risk.
          </p>
          <p>
            Here is the part that matters: the number of shares they need keeps changing as
            the stock moves. So they are constantly buying and selling to stay neutral.
          </p>
          <Picture>
            Think of a waiter carrying a tray of drinks through a crowd. They are not
            trying to go anywhere interesting. They are just constantly adjusting to keep
            the tray level. Every bump makes them shift their arms. Those adjustments are
            real orders hitting the market, and there are a lot of them.
          </Picture>
        </Section>

        <Section n="02" title="Gamma is how twitchy that adjusting gets">
          <p>
            <Term>Gamma</Term> measures how fast the hedger has to react. High gamma means a
            small move in the stock forces a big adjustment. Low gamma means they can mostly
            sit still.
          </p>
          <p>
            Add up that pressure across every contract on a ticker and you get{" "}
            <Term>gamma exposure</Term>, which the app shows as a dollar figure. It is an
            estimate of how much hedging has to happen for each one percent the stock moves.
          </p>
        </Section>

        <Section n="03" title="The two moods: positive and negative">
          <p>
            The sign is the whole story, and it flips the kind of trade you want.
          </p>
          <div className="space-y-3">
            <div className="rounded-xl bg-white/[0.035] px-3.5 py-3">
              <div className="text-[13px] font-semibold text-emerald-300">Positive gamma</div>
              <p className="mt-1 text-[13.5px] leading-[1.6]">
                Hedgers sell as the stock rises and buy as it falls. They are leaning against
                every move, which flattens the chart. Price gets sticky and tends to drift
                back toward big strike prices.
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.035] px-3.5 py-3">
              <div className="text-[13px] font-semibold text-rose-300">Negative gamma</div>
              <p className="mt-1 text-[13.5px] leading-[1.6]">
                Hedgers buy as it rises and sell as it falls. They are pushing in the same
                direction the stock is already going, so moves feed on themselves and run
                further than you would expect.
              </p>
            </div>
          </div>
          <Picture>
            Positive gamma is a car with good suspension. You hit a pothole and barely feel
            it, because the shocks absorb it. Negative gamma is that same car with the shocks
            ripped out. Hit the same pothole and the whole car launches. Same road, completely
            different ride.
          </Picture>
          <p>
            This is why the app changes its recommendations based on the sign. In positive
            gamma it stops suggesting trades that need a big breakout, because the suspension
            is going to eat it. In negative gamma it does the opposite.
          </p>
        </Section>

        <Section n="04" title="Call wall and put wall">
          <p>
            Some strike prices have enormous numbers of contracts stacked on them. Those
            strikes create the heaviest hedging, so price slows down when it gets near.
          </p>
          <p>
            The <Term>call wall</Term> is the strike above the current price with the most
            pressure. It tends to act like a ceiling. The <Term>put wall</Term> is the same
            idea below, and it tends to act like a floor.
          </p>
          <Picture>
            Running uphill into wet concrete. You can get through it, but you will slow way
            down doing it, and most of the time you just stop. Betting that a stock blasts
            cleanly past its call wall in eight days is betting you sprint through concrete.
          </Picture>
          <p>
            So when the app builds a two leg spread, it tries to put the leg you sell right
            at that wall. You are collecting money at the exact place the stock is most
            likely to stall out.
          </p>
        </Section>

        <Section n="05" title="The gamma flip">
          <p>
            The <Term>gamma flip</Term> is the price level where the mood changes sign. Above
            it, the suspension is working. Below it, the shocks are gone.
          </p>
          <Picture>
            Walking on a frozen lake. Near the shore the ice is thick and nothing you do
            matters. Past a certain point it gets thin, and the same footstep that was
            harmless now cracks everything. The flip is where the ice changes.
          </Picture>
          <p>
            When you leave the view on Auto, this level is a big part of how the app decides
            whether to lean up or down.
          </p>
        </Section>

        <Section n="06" title="Buying a call versus buying a spread">
          <p>
            A <Term>long call</Term> is one contract. It costs more, it can bleed value fast,
            and its upside has no limit. You need a real move, and you need it soon.
          </p>
          <p>
            A <Term>debit spread</Term> is two contracts. You buy one and sell a further away
            one at the same time. The one you sell pays for part of the one you buy, so the
            trade costs much less. The tradeoff is that your profit stops at the strike you
            sold.
          </p>
          <Picture>
            A long call is buying a whole house hoping the neighborhood booms. A spread is
            buying the house and immediately agreeing to sell it at a set price. You put down
            far less cash, you still profit if prices rise, and you gave up the dream scenario
            where it triples. In a sticky market that dream was not happening anyway.
          </Picture>
          <p>
            The <Term>Structure</Term> filter lets you force one or the other, or leave it on
            Any and let the score decide.
          </p>
        </Section>

        <Section n="07" title="Time decay">
          <p>
            Options lose value every single day just from time passing, even if the stock does
            not move at all. The closer to expiration, the faster the bleed.
          </p>
          <Picture>
            An ice cube in your hand. It is melting whether or not anything interesting
            happens. A one week option is a small cube melting fast. Waiting a day and being
            right is often worse than being right immediately.
          </Picture>
          <p>
            A spread melts much slower than a single call, because the contract you sold is
            melting too, and that one melts in your favor.
          </p>
        </Section>

        <Section n="08" title="Expected move">
          <p>
            The <Term>expected move</Term> is roughly how far the market thinks the stock
            travels over the window, based on what options are charging. Stocks stay inside
            it about two thirds of the time.
          </p>
          <p>
            The app compares it to your <Term>breakeven</Term>, which is the price you need
            just to get your money back. If your breakeven sits far outside the expected move,
            you are paying for something the market does not think is likely.
          </p>
        </Section>

        <Section n="09" title="What the number on each card means">
          <p>
            Every trade gets a score from zero to one hundred. It is a weighted blend of seven
            checks. Tap any card to see all seven with a sentence explaining each one.
          </p>
          <ul className="space-y-2.5">
            {[
              ["Gamma fit", "Does this structure suit the current mood, and is the leg you sell parked at a wall"],
              ["Payoff", "What you win versus what you risk, adjusted for the odds of it working"],
              ["Breakeven reach", "How far the stock has to travel compared to the expected move"],
              ["Liquidity", "How tight the quotes are and how many contracts are out there, meaning can you actually get out"],
              ["Vol cost", "Are you paying a fair price for this contract or an inflated one"],
              ["Time decay", "How much of your money melts per day"],
              ["Budget fit", "Can you buy more than one without spending everything"],
            ].map(([name, desc]) => (
              <li key={name} className="rounded-xl bg-white/[0.035] px-3.5 py-2.5">
                <div className="text-[13px] font-semibold text-zinc-100">{name}</div>
                <p className="mt-0.5 text-[13px] leading-[1.55] text-zinc-400">{desc}</p>
              </li>
            ))}
          </ul>
          <p>
            A high score means the trade lines up well on all of them at once. It is not a
            prediction, and nothing here stops a stock from doing whatever it wants.
          </p>
        </Section>

        <Section n="10" title="Honest limits">
          <p>
            Nobody publishes what dealers actually hold. The standard assumption, which this
            app uses, is that they are long calls and short puts against customer flow. It is
            a well used estimate, not a fact, and it can be wrong on any given name.
          </p>
          <p>
            Quotes are fifteen minutes delayed, so confirm prices in your broker before
            sending anything. Options can go to zero, and the whole debit is at risk on every
            trade shown here. This is a research tool, not advice.
          </p>
        </Section>
      </div>

      <Link
        href="/"
        className="mt-10 flex w-full items-center justify-center rounded-xl bg-sky-400 px-5 py-3 text-[15px] font-semibold text-[#06202c]"
      >
        Run a scan
      </Link>
    </main>
  );
}
