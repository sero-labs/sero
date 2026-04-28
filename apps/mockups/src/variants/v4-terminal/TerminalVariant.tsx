import "./terminal.css";
import { SeroEmblem, SeroLogo } from "./SeroBrand";
import {
	hero,
	problem,
	loop,
	become,
	pluginAnatomy,
	builtins,
	cta,
	images,
} from "../../shared/content";

// Note: a hand-built Sero chat panel mock lives in TmChat.tsx but is hidden
// for now — the hero uses the real product screenshot instead so the marketing
// surface stays grounded in the actual UI.

// V4 — Terminal Field Notes
// Brutalist mono. Pure dark, ASCII rules, code receipts, manifest snippets.
// The most distinctive direction — speaks directly to power users.

export function TerminalVariant(): JSX.Element {
	return (
		<div className="tm">
			<TmTopBar />
			<TmHero />
			<TmProblem />
			<TmLoop />
			<TmBecome />
			<TmAnatomy />
			<TmBuiltins />
			<TmAlpha />
			<TmCta />
			<TmFooter />
		</div>
	);
}

function TmTopBar() {
	return (
		<div className="tm-top">
			<div className="tm-top__inner">
				<span className="tm-top__brand" aria-label="Sero">
					<SeroEmblem className="tm-top__emblem" />
					<SeroLogo className="tm-top__logo" />
				</span>
				<span className="tm-top__sep">/</span>
				<span className="tm-top__path">~/marketing/landing</span>
				<span className="tm-top__spacer" />
				<a href="#" className="tm-top__link">[product]</a>
				<a href="#" className="tm-top__link">[plugins]</a>
				<a href="#" className="tm-top__link">[docs]</a>
				<a href="#" className="tm-top__link">[github]</a>
				<a href="#" className="tm-top__cta">[ join alpha ]</a>
			</div>
		</div>
	);
}

function TmHero() {
	return (
		<header className="tm-hero">
			<TmBrandBanner />
			<h1 className="tm-h1">
				<span className="tm-h1__line">build the agent</span>
				<span className="tm-h1__line tm-h1__line--accent">only_you_need</span>
			</h1>
			<p className="tm-lede">{hero.sub}</p>

			<div className="tm-cta-row">
				<a className="tm-btn tm-btn--primary" href="#">
					<span aria-hidden="true">▸</span> {hero.primary}
				</a>
				<a className="tm-btn tm-btn--ghost" href="#">
					{hero.secondary}
				</a>
			</div>

			<TmChatShot />
		</header>
	);
}

function TmBrandBanner() {
	return (
		<div className="tm-brand" aria-label="Sero — a workshop OS for agents">
			<div className="tm-brand__row">
				<SeroEmblem className="tm-brand__emblem" aria-label="Sero phoenix emblem" />
				<SeroLogo className="tm-brand__logo" aria-label="Sero" />
			</div>
			<div className="tm-brand__tag">
				<span className="tm-brand__bullet" aria-hidden="true" />
				a workshop OS for agents
			</div>
		</div>
	);
}

function TmChatShot() {
	return (
		<figure className="tm-shot" aria-label="A live Sero session: agent chat panel beside an HTML preview.">
			<img
				src={images.seroChat}
				alt="Sero workspace with the agent chat panel on the right showing a multi-step plan to scaffold a landing page."
			/>
		</figure>
	);
}

function TmProblem() {
	return (
		<section className="tm-section">
			<TmHeader idx="01" label="the_pain" />
			<div className="tm-cols">
				<div>
					<h2 className="tm-h2">{problem.headline}</h2>
				</div>
				<div>
					<p className="tm-prose">{problem.body}</p>
					<p className="tm-prose tm-prose--lift">→ {problem.resolution}</p>
				</div>
			</div>
		</section>
	);
}

function TmLoop() {
	return (
		<section className="tm-section">
			<TmHeader idx="02" label="self_extension_loop" />
			<h2 className="tm-h2">when sero is missing a capability, ask it to make one.</h2>
			<p className="tm-tag">// {loop.tagline}</p>

			<div className="tm-loop">
				{loop.steps.map((s, i) => (
					<div key={s.n} className="tm-loop__row">
						<div className="tm-loop__gutter">
							<span className="tm-loop__n">{s.n}</span>
							{i < loop.steps.length - 1 && <span className="tm-loop__pipe" aria-hidden="true">│</span>}
						</div>
						<div className="tm-loop__content">
							<div className="tm-loop__head">
								<span className="tm-loop__label">{s.label}</span>
								<span className="tm-loop__sep">·</span>
								<span className="tm-loop__receipt">{s.receipt}</span>
							</div>
							<p className="tm-loop__body">{s.body}</p>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function TmBecome() {
	return (
		<section className="tm-section">
			<TmHeader idx="03" label="what_can_it_become" />
			<h2 className="tm-h2">build the agent you actually wanted.</h2>

			<div className="tm-pick">
				<div className="tm-pick__prompt">
					<span className="tm-shell__user">$</span> sero shape{" "}
					<span className="tm-pick__placeholder">[ pick one ]</span>
				</div>
				<div className="tm-pick__grid">
					{become.map((b, i) => (
						<article key={b.id} className="tm-pick__card">
							<div className="tm-pick__head">
								<span className="tm-pick__idx">--{b.id}</span>
								<span className="tm-pick__name">{b.title}</span>
							</div>
							<figure>
								<img src={b.image} alt="" />
							</figure>
							<p className="tm-pick__tag">{b.tagline}</p>
							<ul className="tm-pick__defaults">
								{b.defaults.map((d) => (
									<li key={d}>+ {d}</li>
								))}
							</ul>
							<div className="tm-pick__quote">
								<span className="tm-shell__user">{">"}</span> {b.mineExample}
							</div>
							<span className="tm-pick__corner" aria-hidden="true">
								0{i + 1}
							</span>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}

function TmAnatomy() {
	return (
		<section className="tm-section">
			<TmHeader idx="04" label="plugin_anatomy" />
			<h2 className="tm-h2">plugins are how sero learns new work.</h2>

			<div className="tm-anatomy">
				<pre className="tm-manifest" aria-label="Plugin manifest">
{`{
  "name": "release-checklist",
  "version": "0.1.0",
  "sero": {
    "app":      "./dist/App.js",
    "tools":    ["./dist/tool.js"],
    "commands": ["./dist/command.js"],
    "runtime":  "./dist/runtime.js",
    "widgets":  ["./dist/Widget.js"],
    "state":    "./dist/state.js",
    "skills":   ["./skills/*.md"],
    "prompts":  ["./prompts/*.md"]
  }
}`}
				</pre>
				<ul className="tm-anatomy__list">
					{pluginAnatomy.map((s) => (
						<li key={s.slot}>
							<span className="tm-anatomy__slot">[{s.slot}]</span>
							<span className="tm-anatomy__label">{s.label}</span>
							<span className="tm-anatomy__note">— {s.note}</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

function TmBuiltins() {
	return (
		<section className="tm-section">
			<TmHeader idx="05" label="starting_abilities" />
			<h2 className="tm-h2">useful from the start. yours over time.</h2>
			<div className="tm-builtins">
				{builtins.map((b) => (
					<article key={b.name} className="tm-builtin">
						<figure>
							<img src={b.img} alt="" />
						</figure>
						<div className="tm-builtin__copy">
							<span className="tm-builtin__name">[{b.name.toLowerCase()}]</span>
							<p>{b.desc}</p>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

function TmAlpha() {
	return (
		<section className="tm-section">
			<TmHeader idx="06" label="honest_alpha" />
			<div className="tm-cols">
				<h2 className="tm-h2">early, useful, built in public.</h2>
				<div>
					<p className="tm-prose">
						source-only OSS alpha · macOS · apple silicon · profile-scoped state ·
						container-backed workspaces when available · host-mode fallback otherwise ·
						plugin/runtime contracts will evolve.
					</p>
					<pre className="tm-receipt">
{`$ sero --version
sero/0.x  pi-coding-agent  electron  react-19
profile: dan@host  macOS 14.x  arm64`}
					</pre>
				</div>
			</div>
		</section>
	);
}

function TmCta() {
	return (
		<section className="tm-section tm-cta">
			<TmHeader idx="07" label="make_it_yours" />
			<h2 className="tm-h2 tm-cta__h">make sero yours.</h2>
			<p className="tm-prose tm-cta__sub">{cta.sub}</p>
			<div className="tm-cta-row">
				<a className="tm-btn tm-btn--primary" href="#">
					<span aria-hidden="true">▸</span> {cta.primary}
				</a>
				<a className="tm-btn tm-btn--ghost" href="#">
					{cta.secondary}
				</a>
				<a className="tm-btn tm-btn--ghost" href="#">
					{cta.tertiary}
				</a>
			</div>
			<HeroProof />
		</section>
	);
}

function HeroProof() {
	return (
		<figure className="tm-proof">
			<img src={images.explorerView} alt="" />
		</figure>
	);
}

function TmFooter() {
	return (
		<footer className="tm-footer">
			<div className="tm-footer__rule" aria-hidden="true" />
			<div className="tm-footer__row">
				<div className="tm-footer__brand">
					<SeroEmblem className="tm-footer__emblem" />
					<SeroLogo className="tm-footer__logo" />
				</div>
				<div className="tm-footer__meta">
					workshop OS · alpha · local-first · macOS apple silicon
				</div>
			</div>
			<div className="tm-footer__row tm-footer__row--bot">
				<span>plugins are how sero learns new work.</span>
				<span>© sero · source-only OSS</span>
			</div>
			<div className="tm-footer__rule" aria-hidden="true" />
		</footer>
	);
}

function TmHeader({ idx, label }: { idx: string; label: string }) {
	return (
		<div className="tm-secHead">
			<span className="tm-secHead__bracket">§</span>
			<span className="tm-secHead__idx">{idx}</span>
			<span className="tm-secHead__rule" />
			<span className="tm-secHead__label">{label}</span>
		</div>
	);
}
