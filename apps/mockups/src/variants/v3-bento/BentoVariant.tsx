import "./bento.css";
import {
	hero,
	problem,
	loop,
	become,
	pluginAnatomy,
	cta,
	navLinks,
	images,
} from "../../shared/content";

// V3 — Bento Forge
// Cool dark with teal/copper undertones. Big asymmetric bento that uses real
// product screenshots as the proof, exactly per the plan's bento rewrite.

export function BentoVariant(): JSX.Element {
	return (
		<div className="bf">
			<BfNav />
			<BfHero />
			<BfBento />
			<BfLoop />
			<BfBecome />
			<BfStrip />
			<BfCta />
			<BfFooter />
		</div>
	);
}

function BfNav() {
	return (
		<nav className="bf-nav">
			<div className="bf-nav__left">
				<span className="bf-nav__mark" aria-hidden="true">▣</span>
				<span className="bf-nav__name">Sero</span>
				<span className="bf-nav__alpha">macOS · alpha</span>
			</div>
			<ul className="bf-nav__links">
				{navLinks.map((l) => (
					<li key={l}>
						<a href="#">{l}</a>
					</li>
				))}
			</ul>
			<div className="bf-nav__right">
				<a className="bf-nav__cta" href="#">
					Join the alpha
				</a>
			</div>
		</nav>
	);
}

function BfHero() {
	return (
		<header className="bf-hero">
			<p className="bf-eyebrow">{hero.eyebrow}</p>
			<h1 className="bf-display">
				Build the agent <em>only you need.</em>
			</h1>
			<p className="bf-lede">{hero.sub}</p>
			<div className="bf-cta-row">
				<a className="bf-btn bf-btn--primary" href="#">
					{hero.primary}
				</a>
				<a className="bf-btn bf-btn--ghost" href="#">
					{hero.secondary} →
				</a>
			</div>
			<div className="bf-meta">
				<span>{problem.headline}</span>
				<span aria-hidden="true">·</span>
				<span className="bf-meta__lift">Sero turns it into durable workspace capabilities.</span>
			</div>
		</header>
	);
}

function BfBento() {
	return (
		<section className="bf-section">
			<div className="bf-section__head">
				<p className="bf-kicker">— what Sero is</p>
				<h2 className="bf-h2">
					Plugins are how Sero <em>learns new work.</em>
				</h2>
				<p className="bf-prose">
					Each tile is a real surface in the product. Together they show what stays
					with you between sessions.
				</p>
			</div>

			<div className="bf-bento">
				<article className="bf-tile bf-tile--hero">
					<div className="bf-tile__copy">
						<span className="bf-tile__tag">make new abilities</span>
						<h3>Ask for a capability. Keep it forever.</h3>
						<p>
							Tell Sero what you want it to do. It scaffolds a plugin: shared state,
							tools, UI, runtime. The next session uses it as native behavior.
						</p>
					</div>
					<div className="bf-tile__theatre">
						<div className="bf-window__chrome"><span /><span /><span /></div>
						<img src={images.localPluginPreview} alt="" />
						<div className="bf-tile__chip">
							<span className="bf-tile__chipDot" />
							scaffold → manifest → sidebar app → tool
						</div>
					</div>
				</article>

				<article className="bf-tile bf-tile--memory">
					<div className="bf-tile__copy">
						<span className="bf-tile__tag">memory & identity</span>
						<h3>It remembers what matters.</h3>
						<p>Identity, profile, long-term facts, daily logs, scratchpad — all local files.</p>
					</div>
					<figure>
						<img src={images.memory} alt="" />
					</figure>
				</article>

				<article className="bf-tile bf-tile--agents">
					<div className="bf-tile__copy">
						<span className="bf-tile__tag">specialist agents</span>
						<h3>Named agents for recurring roles.</h3>
						<p>Reviewer, researcher, release manager, support triage — yours to define.</p>
					</div>
					<figure>
						<img src={images.adminAgents} alt="" />
					</figure>
				</article>

				<article className="bf-tile bf-tile--workspace">
					<div className="bf-tile__copy">
						<span className="bf-tile__tag">workspace-bound state</span>
						<h3>Sessions, plugin state, and context stay attached.</h3>
						<p>No floating chat history. Real folders, profile-scoped, persistent.</p>
					</div>
					<figure>
						<img src={images.explorerEditor} alt="" />
					</figure>
				</article>

				<article className="bf-tile bf-tile--anatomy">
					<div className="bf-tile__copy">
						<span className="bf-tile__tag">UI + tools + runtime</span>
						<h3>One plugin can ship all of it.</h3>
					</div>
					<ul className="bf-anatomy">
						{pluginAnatomy.map((s) => (
							<li key={s.slot}>
								<span className="bf-anatomy__bullet" aria-hidden="true" />
								<span>{s.label}</span>
								<span className="bf-anatomy__note">{s.note}</span>
							</li>
						))}
					</ul>
				</article>

				<article className="bf-tile bf-tile--local">
					<div className="bf-tile__copy">
						<span className="bf-tile__tag">local plugin development</span>
						<h3>Run a checkout directly in Sero.</h3>
					</div>
					<figure>
						<img src={images.pluginManagement} alt="" />
					</figure>
				</article>
			</div>
		</section>
	);
}

function BfLoop() {
	return (
		<section className="bf-section">
			<div className="bf-section__head">
				<p className="bf-kicker">— self-extension loop</p>
				<h2 className="bf-h2">
					When Sero is missing a capability, <em>ask it to make one.</em>
				</h2>
				<p className="bf-prose">{loop.tagline}</p>
			</div>

			<ol className="bf-loop">
				{loop.steps.map((s) => (
					<li key={s.n}>
						<div className="bf-loop__num">{s.n}</div>
						<div className="bf-loop__label">{s.label}</div>
						<p className="bf-loop__body">{s.body}</p>
						<code className="bf-loop__receipt">{s.receipt}</code>
					</li>
				))}
			</ol>
		</section>
	);
}

function BfBecome() {
	return (
		<section className="bf-section">
			<div className="bf-section__head">
				<p className="bf-kicker">— what can it become?</p>
				<h2 className="bf-h2">
					Build the agent you <em>actually wanted.</em>
				</h2>
			</div>
			<div className="bf-become">
				{become.map((b, i) => (
					<article key={b.id} className={`bf-become__card bf-become__card--${i}`}>
						<figure>
							<img src={b.image} alt="" />
						</figure>
						<div className="bf-become__copy">
							<span className="bf-become__idx">0{i + 1}</span>
							<h3>{b.title}</h3>
							<p>{b.tagline}</p>
							<div className="bf-become__quote">{b.mineExample}</div>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

function BfStrip() {
	const items = [
		"Memory",
		"Scheduler",
		"Web research",
		"Git",
		"MCP",
		"Subagents",
		"Themes",
		"Profiles",
		"Local plugin dev",
		"Provider plugins",
		"Skills",
		"Prompts",
	];
	return (
		<section className="bf-strip" aria-label="Built-in starting points">
			<div className="bf-strip__inner">
				{[0, 1].map((row) => (
					<div key={row} className="bf-strip__row">
						{[...items, ...items].map((item, i) => (
							<span key={`${row}-${i}`} className="bf-strip__item">
								<span className="bf-strip__dot" aria-hidden="true" />
								{item}
							</span>
						))}
					</div>
				))}
			</div>
		</section>
	);
}

function BfCta() {
	return (
		<section className="bf-section bf-cta">
			<div className="bf-cta__card">
				<h2 className="bf-display bf-cta__h">
					Make Sero <em>yours.</em>
				</h2>
				<p className="bf-prose bf-cta__sub">{cta.sub}</p>
				<div className="bf-cta-row">
					<a className="bf-btn bf-btn--primary" href="#">
						{cta.primary}
					</a>
					<a className="bf-btn bf-btn--ghost" href="#">
						{cta.secondary}
					</a>
					<a className="bf-btn bf-btn--ghost" href="#">
						{cta.tertiary}
					</a>
				</div>
			</div>
		</section>
	);
}

function BfFooter() {
	return (
		<footer className="bf-footer">
			<div>Sero · local-first · macOS</div>
			<div>Plugins are how Sero learns new work.</div>
		</footer>
	);
}
