import { Link } from "react-router-dom";

const STEPS = [
  [
    "Every resolved incident goes in",
    "The error log, the Slack thread, the Jira ticket, the commits and the fix that worked. MemOps builds a knowledge graph from them, so incidents that share a service, an error or a fix end up linked.",
  ],
  [
    "An alert fires, you paste it in",
    "In about ten seconds MemOps suggests a fix and shows the past incidents it is based on, each with a match score, so you can check the history before you trust the answer.",
  ],
  [
    "The fix works, you say so",
    "MemOps re-learns from that incident and strengthens its links to the ones around it. The next person who hits the same problem gets a better answer.",
  ],
];

const FEATURES = [
  ["/", "Ask", "Paste an alert and get a suggested fix plus the closest past incidents. Click \"This fix worked\" when it did."],
  ["/incidents", "Incidents", "Every incident with its whole story: the error log, the Slack thread as it happened, the Jira ticket, the commits and the fix."],
  ["/incidents/new", "Add incident", "Log a resolved incident. It joins the graph and shows up in answers from then on."],
  ["/map", "Memory map", "Each service is an island and each incident a dot. Lines show what incidents share. Drag dots around, zoom in, or replay how the memory grew."],
];

const AUDIENCE = [
  "On-call engineers and SREs who keep getting paged for problems the team has already solved once.",
  "Teams where people move on and take what they know with them.",
  "New joiners who need the history of a service without reading two years of tickets.",
];

function Section({ title, children }) {
  return (
    <section className="mt-14">
      <h2 className="text-[1.5rem] font-bold leading-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function About() {
  return (
    <div className="mx-auto max-w-page px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:px-10">
      <div className="max-w-[46rem]">
        <h1 className="text-[2.25rem] font-semibold tracking-tight leading-[1.1] sm:text-[2.75rem]">What MemOps is</h1>
        <p className="mt-4 text-[1.2rem] leading-relaxed">
          MemOps remembers how your team fixed production incidents, so whoever gets paged next
          starts from what worked last time instead of from nothing.
        </p>

        <Section title="The problem">
          <p className="mt-3 max-w-prose leading-relaxed text-muted">
            It's 3am and the payments API is down. This has happened before, and someone fixed it.
            But the fix lives in an old Slack thread, a closed Jira ticket, or the head of an
            engineer who left last spring. So the person on call works it out again from scratch,
            with customers waiting.
          </p>
        </Section>

        <Section title="Who it's for">
          <ul className="mt-4 max-w-prose space-y-2.5">
            {AUDIENCE.map((a) => (
              <li key={a} className="flex gap-3 leading-relaxed">
                <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {a}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="How it works">
          <ol className="mt-5 space-y-6">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-3">
                <span className="pt-0.5 font-mono text-sm font-semibold text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="mt-1 block max-w-prose leading-relaxed text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Section title="What you can do here">
        <ul className="mt-5 grid gap-px border border-rule bg-rule sm:grid-cols-2">
          {FEATURES.map(([to, name, body]) => (
            <li key={to} className="bg-sheet">
              <Link to={to} className="group block h-full px-5 py-5 hover:bg-raise">
                <span className="font-bold text-ink group-hover:text-accent">
                  {name} <span aria-hidden>→</span>
                </span>
                <span className="mt-1.5 block text-[15px] leading-relaxed text-muted">{body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <div className="max-w-[46rem]">
        <Section title="About this demo">
          <p className="mt-3 max-w-prose leading-relaxed text-muted">
            The 17 incidents here are sample data, spread across 10 services from March 2024 to
            August 2025. Try the payments-api ones first: the same connection pool problem came back
            three times in ten months, and each fix built on the one before it.
          </p>
        </Section>

        <Section title="Under the hood">
          <p className="mt-3 max-w-prose leading-relaxed text-muted">
            A FastAPI backend uses Cognee for the knowledge graph and vector search, Groq's
            gpt-oss-20b for the language model, and all-MiniLM-L6-v2 for embeddings. The frontend is
            React with Vite and Tailwind, and the memory map is drawn with D3.{" "}
            <a
              href="https://github.com/YaseenBashaT/Hangover-MemOps"
              className="text-accent underline-offset-4 hover:underline"
            >
              Source on GitHub
            </a>
          </p>
        </Section>

        <div className="mt-14">
          <Link
            to="/"
            className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-[15px] font-bold text-accent-on hover:bg-accent-strong"
          >
            Try it with an alert
          </Link>
        </div>
      </div>
    </div>
  );
}
