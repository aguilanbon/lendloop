import { AuthCta } from "@/components/AuthCta";
import { Logo } from "@/components/Logo";
import { PublicToolList } from "@/components/PublicToolList";

const STEPS = [
  { title: "List", body: "Add the drill, ladder or tent that sits in your shed most of the year." },
  { title: "Request", body: "Neighbours ask to borrow it for specific dates. You approve or decline." },
  { title: "Return", body: "Get a heads-up when it's due back. Reminders go out if it's late." },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <AuthCta compact />
      </header>

      <main>
        <section className="py-14 sm:py-20">
          <h1 className="max-w-2xl font-display text-4xl leading-tight tracking-tight sm:text-5xl">
            Borrow what you need.
            <br />
            <span className="text-accent">Lend what you don&apos;t.</span>
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            LendLoop is a tool-lending board for your neighbourhood. Fewer things bought for one job,
            more things shared down the street.
          </p>
          <div className="mt-8">
            <AuthCta />
          </div>
        </section>

        <section aria-labelledby="available" className="pb-16">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="available" className="text-lg font-semibold">
              Available now
            </h2>
            <p className="text-xs text-muted">Sign in to see details and request a tool.</p>
          </div>
          <PublicToolList />
        </section>

        <section className="grid gap-6 border-t border-line py-12 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title}>
              <p className="font-mono text-xs text-muted">0{i + 1}</p>
              <h3 className="mt-1 font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
