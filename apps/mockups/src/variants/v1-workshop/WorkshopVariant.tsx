import "./workshop.css";
import {
	hero,
	problem,
	thesis,
	loop,
	become,
	pluginAnatomy,
	builtins,
	cta,
	navLinks,
	images,
} from "../../shared/content";

// V1 — Workshop Manual
// Warm-dark editorial. Bricolage display + Instrument Serif italic + JetBrains Mono receipts.
// Treats Sero like a precise field manual for an agent workshop.

export function WorkshopVariant(): JSX.Element {
	return (
		<div className="ws">
			<WSNav />
			<WSHero />
			<WSProblem />
			<WSThesis />
			<WSLoop />
			<WSBecome />
			<WSPluginAnatomy />
			<WSBuiltins />
			<WSAlpha />
			<WSCta />
			<WSFooter />
		</div>
	);
}

function WSNav() {
	return (
		<nav className="ws-nav">
			<div className="ws-nav__brand">
				<span className="ws-nav__mark" aria-hidden="true">◐</span>
				<span className="ws-nav__name">Sero</span>
				<span className="ws-nav__alpha">alpha · macOS</span>
			</div>
			<ul className="ws-nav__links">
				{navLinks.map((l) => (
					<li key={l}>
						<a href="#">{l}</a>
					</li>
				))}
			</ul>
			<a className="ws-nav__cta" href="#">
				Join the alpha →
			</a>
		</nav>
	);
}

function WSHero() {
	return (
		<header className="ws-hero">
			<div className="ws-hero__left">
				<div className="ws-eyebrow">{hero.eyebrow}</div>
				<h1 className="ws-display">
					Build the agent <em>only you need.</em>
				</h1>
				<p className="ws-lede">{hero.sub}</p>
				<p className="ws-support">{hero.support}</p>
				<div className="ws-cta-row">
					<a className="ws-btn ws-btn--primary" href="#">
						{hero.primary}
					</a>
					<a className="ws-btn ws-btn--ghost" href="#">
						{hero.secondary} <span aria-hidden="true">↓</span>
					</a>
				</div>
				<div className="ws-meta">
					<span>v0.x source-only</span>
					<span aria-hidden="true">·</span>
					<span>Apple Silicon</span>
					<span aria-hidden="true">·</span>
					<span>Local-first</span>
				</div>
			</div>
			<div className="ws-hero__right">
				<HeroTheatre />
			</div>
		</header>
	);
}

function HeroTheatre() {
	return (
		<figure className="ws-theatre">
			<div className="ws-theatre__chrome">
				<span /> <span /> <span />
				<span className="ws-theatre__title">~/sero/work — release-checklist</span>
			</div>
			<img src={images.explorerView} alt="" className="ws-theatre__img" />
			<div className="ws-theatre__overlay">
				<div className="ws-prompt">
					<span className="ws-prompt__cursor">▍</span>
					<span>Build me a release-checklist plugin for this repo.</span>
				</div>
				<div className="ws-trail">
					<span className="ws-trail__node">scaffold</span>
					<span className="ws-trail__arrow">→</span>
					<span className="ws-trail__node">plugin manifest</span>
					<span className="ws-trail__arrow">→</span>
					<span className="ws-trail__node">sidebar app</span>
					<span className="ws-trail__arrow">→</span>
					<span className="ws-trail__node ws-trail__node--live">tool: checklist.gate</span>
				</div>
			</div>
			<figcaption className="ws-theatre__cap">
				<span className="ws-callout">A</span> Prompt requests a capability.&nbsp;
				<span className="ws-callout">B</span> Sero scaffolds the plugin in the workspace.&nbsp;
				<span className="ws-callout">C</span> The agent calls the new tool from the next session.
			</figcaption>
		</figure>
	);
}

function WSProblem() {
	return (
		<section className="ws-section ws-problem">
			<div className="ws-section__rule" />
			<div className="ws-problem__grid">
				<div className="ws-section__num">§ 01</div>
				<h2 className="ws-h2">{problem.headline}</h2>
				<p className="ws-prose">{problem.body}</p>
				<p className="ws-prose ws-prose--accent">{problem.resolution}</p>
			</div>
		</section>
	);
}

function WSThesis() {
	return (
		<section className="ws-section ws-thesis">
			<div className="ws-section__rule" />
			<div className="ws-section__head">
				<div className="ws-section__num">§ 02 · product thesis</div>
				<h2 className="ws-h2">
					Your Sero can become <em>different from mine.</em>
				</h2>
			</div>
			<div className="ws-thesis__cols">
				{thesis.pillars.map((p, i) => (
					<article key={p.title} className="ws-pillar">
						<div className="ws-pillar__index">{String(i + 1).padStart(2, "0")}</div>
						<h3 className="ws-pillar__title">{p.title}</h3>
						<p className="ws-pillar__body">{p.body}</p>
					</article>
				))}
			</div>
		</section>
	);
}

function WSLoop() {
	return (
		<section className="ws-section ws-loop">
			<div className="ws-section__rule" />
			<div className="ws-section__head">
				<div className="ws-section__num">§ 03 · self-extension loop</div>
				<h2 className="ws-h2">{loop.headline}</h2>
				<p className="ws-tagline">{loop.tagline}</p>
			</div>
			<ol className="ws-loop__steps">
				{loop.steps.map((s) => (
					<li key={s.n} className="ws-step">
						<div className="ws-step__num">{s.n}</div>
						<div className="ws-step__label">{s.label}</div>
						<p className="ws-step__body">{s.body}</p>
						<div className="ws-step__receipt">
							<span aria-hidden="true">↳</span> {s.receipt}
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}

function WSBecome() {
	return (
		<section className="ws-section ws-become">
			<div className="ws-section__rule" />
			<div className="ws-section__head">
				<div className="ws-section__num">§ 04 · what can it become?</div>
				<h2 className="ws-h2">Build the agent you actually wanted.</h2>
				<p className="ws-tagline">
					Each Sero starts the same. Then it diverges into the workspace your work needs.
				</p>
			</div>
			<div className="ws-become__grid">
				{become.map((b, i) => (
					<article key={b.id} className={`ws-become__card ws-become__card--${i % 2}`}>
						<div className="ws-become__head">
							<span className="ws-become__index">0{i + 1}</span>
							<h3 className="ws-become__title">{b.title}</h3>
							<p className="ws-become__tag">{b.tagline}</p>
						</div>
						<figure className="ws-become__shot">
							<img src={b.image} alt="" />
						</figure>
						<dl className="ws-become__defaults">
							<dt>Starts with</dt>
							{b.defaults.map((d) => (
								<dd key={d}>· {d}</dd>
							))}
						</dl>
						<div className="ws-become__mine">
							<span className="ws-become__mineLabel">Make it mine</span>
							<p>{b.mineExample}</p>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

function WSPluginAnatomy() {
	return (
		<section className="ws-section ws-anatomy">
			<div className="ws-section__rule" />
			<div className="ws-anatomy__grid">
				<div>
					<div className="ws-section__num">§ 05 · plugin anatomy</div>
					<h2 className="ws-h2">
						Plugins are not add-ons. <em>They are how Sero learns new work.</em>
					</h2>
					<p className="ws-prose">
						A Sero plugin can ship a UI panel, agent tools, commands, dashboard widgets,
						background runtime behavior, provider metadata, prompts, and skills. Tools
						persist across sessions; UI keeps state with the workspace.
					</p>
				</div>
				<pre className="ws-anatomy__tree" aria-label="Plugin file structure">
{`plugins/weekly-planner/
├─ package.json           # sero.app manifest
├─ src/
│  ├─ tool.ts             # planner.add_task, planner.list
│  ├─ command.ts          # /plan
│  ├─ runtime.ts          # weekly digest job
│  ├─ App.tsx             # sidebar UI
│  ├─ Widget.tsx          # dashboard widget
│  └─ state.ts            # file-backed shared state
├─ prompts/               # reusable behaviors
└─ skills/                # specialist routines`}
				</pre>
				<ul className="ws-anatomy__list">
					{pluginAnatomy.map((s) => (
						<li key={s.slot}>
							<span className="ws-anatomy__slot">{s.slot}</span>
							<span className="ws-anatomy__label">{s.label}</span>
							<span className="ws-anatomy__note">{s.note}</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

function WSBuiltins() {
	return (
		<section className="ws-section ws-builtins">
			<div className="ws-section__rule" />
			<div className="ws-section__head">
				<div className="ws-section__num">§ 06 · built-in starting points</div>
				<h2 className="ws-h2">Useful from the start. Yours over time.</h2>
			</div>
			<div className="ws-builtins__grid">
				{builtins.map((b) => (
					<article key={b.name} className="ws-builtin">
						<figure>
							<img src={b.img} alt="" />
						</figure>
						<h3>{b.name}</h3>
						<p>{b.desc}</p>
					</article>
				))}
			</div>
		</section>
	);
}

function WSAlpha() {
	return (
		<section className="ws-section ws-alpha">
			<div className="ws-section__rule" />
			<div className="ws-alpha__grid">
				<div className="ws-section__num">§ 07 · honest alpha</div>
				<h2 className="ws-h2">Early, useful, and built in public.</h2>
				<p className="ws-prose">
					Sero is a source-only OSS alpha for macOS on Apple Silicon. The core idea is
					already visible: a local agent workspace that can grow around the way you work.
					Some plugin and runtime contracts will evolve as the ecosystem hardens.
				</p>
				<ul className="ws-alpha__bullets">
					<li>Real folders and workspaces, profile-scoped state.</li>
					<li>Container-backed workspaces when available, host-mode fallback otherwise.</li>
					<li>Plugins from npm, git, local paths, or local dev checkouts.</li>
				</ul>
			</div>
		</section>
	);
}

function WSCta() {
	return (
		<section className="ws-section ws-cta">
			<div className="ws-section__rule" />
			<h2 className="ws-display ws-cta__h">
				Make Sero <em>yours.</em>
			</h2>
			<p className="ws-prose ws-cta__sub">{cta.sub}</p>
			<div className="ws-cta-row">
				<a className="ws-btn ws-btn--primary" href="#">
					{cta.primary}
				</a>
				<a className="ws-btn ws-btn--ghost" href="#">
					{cta.secondary}
				</a>
				<a className="ws-btn ws-btn--ghost" href="#">
					{cta.tertiary}
				</a>
			</div>
		</section>
	);
}

function WSFooter() {
	return (
		<footer className="ws-footer">
			<div>
				<span className="ws-nav__mark" aria-hidden="true">◐</span> Sero · workshop OS · alpha
			</div>
			<div>© Sero · local-first by default · extensible by design</div>
		</footer>
	);
}
