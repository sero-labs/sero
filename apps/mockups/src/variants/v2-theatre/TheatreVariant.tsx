import { useState } from "react";
import "./theatre.css";
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

// V2 — Capability Theatre
// Cinematic dark with soft moss/copper light, large product frames,
// an interactive "what should your Sero become?" switcher.

export function TheatreVariant(): JSX.Element {
	return (
		<div className="th">
			<ThNav />
			<ThHero />
			<ThProblem />
			<ThThesis />
			<ThLoop />
			<ThBecome />
			<ThAnatomy />
			<ThBuiltins />
			<ThAlpha />
			<ThCta />
			<ThFooter />
		</div>
	);
}

function ThNav() {
	return (
		<nav className="th-nav">
			<div className="th-nav__pill">
				<div className="th-nav__brand">
					<span className="th-nav__mark" aria-hidden="true">●</span>
					<span>Sero</span>
				</div>
				<ul>
					{navLinks.map((l) => (
						<li key={l}>
							<a href="#">{l}</a>
						</li>
					))}
				</ul>
				<a className="th-nav__cta" href="#">
					Join the alpha
				</a>
			</div>
		</nav>
	);
}

function ThHero() {
	return (
		<header className="th-hero">
			<div className="th-hero__copy">
				<div className="th-eyebrow">
					<span className="th-eyebrow__dot" />
					{hero.eyebrow}
				</div>
				<h1 className="th-display">
					Build the agent
					<br />
					only you need.
				</h1>
				<p className="th-lede">{hero.sub}</p>
				<div className="th-cta-row">
					<a className="th-btn th-btn--primary" href="#">
						{hero.primary}
					</a>
					<a className="th-btn th-btn--ghost" href="#">
						{hero.secondary}
						<span aria-hidden="true">→</span>
					</a>
				</div>
			</div>
			<TheatreFrame />
		</header>
	);
}

function TheatreFrame() {
	return (
		<div className="th-frame">
			<div className="th-frame__glow" aria-hidden="true" />
			<div className="th-frame__ring" aria-hidden="true" />
			<div className="th-window">
				<div className="th-window__chrome">
					<span /> <span /> <span />
					<span className="th-window__title">Sero · ~/work/agency-portfolio</span>
				</div>
				<img src={images.explorerView} alt="" className="th-window__shot" />
				<div className="th-window__chat">
					<div className="th-bubble th-bubble--user">
						Build me a release-checklist plugin for this repo.
					</div>
					<div className="th-bubble th-bubble--agent">
						Scaffolding <code>weekly-planner</code>… registering tools…{" "}
						<span className="th-bubble__tick">✓ live</span>
					</div>
				</div>
				<div className="th-window__sidebar">
					<div className="th-window__app">Memory</div>
					<div className="th-window__app">Git</div>
					<div className="th-window__app th-window__app--new">
						<span className="th-window__appNew">new</span>
						Release Checklist
					</div>
				</div>
			</div>
		</div>
	);
}

function ThProblem() {
	return (
		<section className="th-section th-problem">
			<p className="th-kicker">— the pain</p>
			<h2 className="th-h2">
				Generic agents make you <em>carry the workflow.</em>
			</h2>
			<p className="th-prose">{problem.body}</p>
			<p className="th-prose th-prose--lift">{problem.resolution}</p>
		</section>
	);
}

function ThThesis() {
	return (
		<section className="th-section th-thesis">
			<p className="th-kicker">— product thesis</p>
			<h2 className="th-h2">
				Your Sero can become <em>different from mine.</em>
			</h2>
			<div className="th-thesis__grid">
				{thesis.pillars.map((p, i) => (
					<article key={p.title} className="th-thesis__card">
						<div className="th-thesis__num">0{i + 1}</div>
						<h3>{p.title}</h3>
						<p>{p.body}</p>
					</article>
				))}
			</div>
		</section>
	);
}

function ThLoop() {
	return (
		<section className="th-section th-loop">
			<p className="th-kicker">— the self-extension loop</p>
			<h2 className="th-h2">{loop.headline}</h2>
			<p className="th-prose">{loop.tagline}</p>
			<ol className="th-loop__rail">
				{loop.steps.map((s, i) => (
					<li key={s.n} className="th-loop__step">
						<div className="th-loop__num">{s.n}</div>
						<div className="th-loop__head">{s.label}</div>
						<p className="th-loop__body">{s.body}</p>
						<div className="th-loop__receipt">{s.receipt}</div>
						{i < loop.steps.length - 1 && (
							<svg className="th-loop__arrow" viewBox="0 0 80 12" aria-hidden="true">
								<path d="M0 6 L70 6 M64 1 L70 6 L64 11" stroke="currentColor" fill="none" strokeWidth="1" />
							</svg>
						)}
					</li>
				))}
			</ol>
		</section>
	);
}

function ThBecome() {
	const [active, setActive] = useState(0);
	const current = become[active]!;
	return (
		<section className="th-section th-become">
			<p className="th-kicker">— what should your Sero become?</p>
			<h2 className="th-h2">
				One shell, <em>many shapes.</em>
			</h2>
			<p className="th-prose">
				Same Sero. Different active plugins, agents, memory, and prompts. Pick a shape:
			</p>
			<div className="th-become__panel">
				<aside className="th-become__tabs" role="tablist">
					{become.map((b, i) => (
						<button
							key={b.id}
							type="button"
							role="tab"
							aria-selected={i === active}
							className={`th-become__tab ${i === active ? "is-on" : ""}`}
							onClick={() => setActive(i)}
						>
							<span className="th-become__tabIdx">0{i + 1}</span>
							<span className="th-become__tabName">{b.title}</span>
							<span className="th-become__tabTag">{b.tagline}</span>
						</button>
					))}
				</aside>
				<div className="th-become__stage">
					<figure className="th-become__shot">
						<div className="th-window__chrome th-become__chrome">
							<span /> <span /> <span />
							<span className="th-window__title">Sero · {current.title}</span>
						</div>
						<img src={current.image} alt="" />
					</figure>
					<div className="th-become__meta">
						<div>
							<div className="th-become__metaLabel">Starts with</div>
							<ul>
								{current.defaults.map((d) => (
									<li key={d}>{d}</li>
								))}
							</ul>
						</div>
						<div>
							<div className="th-become__metaLabel">Make it mine</div>
							<p className="th-become__quote">{current.mineExample}</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function ThAnatomy() {
	return (
		<section className="th-section th-anatomy">
			<p className="th-kicker">— plugin anatomy</p>
			<h2 className="th-h2">
				Plugins are how Sero <em>learns new work.</em>
			</h2>
			<div className="th-anatomy__grid">
				<div className="th-anatomy__hub">
					<div className="th-anatomy__core">plugin</div>
					{pluginAnatomy.map((s, i) => (
						<div
							key={s.slot}
							className="th-anatomy__node"
							style={{ ["--i" as string]: i, ["--n" as string]: pluginAnatomy.length }}
						>
							<span>{s.label}</span>
						</div>
					))}
				</div>
				<dl className="th-anatomy__legend">
					{pluginAnatomy.map((s) => (
						<div key={s.slot}>
							<dt>{s.label}</dt>
							<dd>{s.note}</dd>
						</div>
					))}
				</dl>
			</div>
		</section>
	);
}

function ThBuiltins() {
	return (
		<section className="th-section th-builtins">
			<p className="th-kicker">— starting abilities</p>
			<h2 className="th-h2">Useful from the start. Yours over time.</h2>
			<div className="th-builtins__grid">
				{builtins.map((b) => (
					<article key={b.name} className="th-builtin">
						<figure>
							<img src={b.img} alt="" />
						</figure>
						<div className="th-builtin__copy">
							<h3>{b.name}</h3>
							<p>{b.desc}</p>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

function ThAlpha() {
	return (
		<section className="th-section th-alpha">
			<p className="th-kicker">— honest alpha</p>
			<h2 className="th-h2">Early, useful, built in public.</h2>
			<p className="th-prose">
				Source-only OSS alpha for macOS on Apple Silicon. Real folders, profile-scoped state,
				container-backed workspaces when available, host-mode fallback otherwise. Some plugin
				and runtime contracts will evolve as the ecosystem hardens.
			</p>
		</section>
	);
}

function ThCta() {
	return (
		<section className="th-section th-cta">
			<div className="th-cta__inner">
				<h2 className="th-display th-cta__h">
					Make Sero <em>yours.</em>
				</h2>
				<p className="th-prose th-cta__sub">{cta.sub}</p>
				<div className="th-cta-row th-cta-row--center">
					<a className="th-btn th-btn--primary" href="#">
						{cta.primary}
					</a>
					<a className="th-btn th-btn--ghost" href="#">
						{cta.secondary}
					</a>
					<a className="th-btn th-btn--ghost" href="#">
						{cta.tertiary}
					</a>
				</div>
			</div>
		</section>
	);
}

function ThFooter() {
	return (
		<footer className="th-footer">
			<div>Sero · local-first · macOS alpha</div>
			<div>An agent you can make your own.</div>
		</footer>
	);
}
