import { useEffect, useState } from "react";
import "./App.css";
import { WorkshopVariant } from "./variants/v1-workshop/WorkshopVariant";
import { TheatreVariant } from "./variants/v2-theatre/TheatreVariant";
import { BentoVariant } from "./variants/v3-bento/BentoVariant";
import { TerminalVariant } from "./variants/v4-terminal/TerminalVariant";

type VariantId = "workshop" | "theatre" | "bento" | "terminal";

type VariantDef = {
	id: VariantId;
	number: string;
	name: string;
	tagline: string;
	component: () => JSX.Element;
};

const VARIANTS: VariantDef[] = [
	{
		id: "workshop",
		number: "01",
		name: "Workshop Manual",
		tagline: "Editorial · field-manual · annotated receipts",
		component: () => <WorkshopVariant />,
	},
	{
		id: "theatre",
		number: "02",
		name: "Capability Theatre",
		tagline: "Cinematic hero · soft motion · large product frames",
		component: () => <TheatreVariant />,
	},
	{
		id: "bento",
		number: "03",
		name: "Bento Forge",
		tagline: "Modern bento · real product surfaces · oxide accent",
		component: () => <BentoVariant />,
	},
	{
		id: "terminal",
		number: "04",
		name: "Terminal Field Notes",
		tagline: "Brutalist mono · code receipts · raw composition",
		component: () => <TerminalVariant />,
	},
];

function readHash(): VariantId | "index" {
	const h = window.location.hash.replace("#", "");
	if (VARIANTS.some((v) => v.id === h)) return h as VariantId;
	return "index";
}

export function App(): JSX.Element {
	const [route, setRoute] = useState<VariantId | "index">(() => readHash());

	useEffect(() => {
		const onHash = () => setRoute(readHash());
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	if (route !== "index") {
		const v = VARIANTS.find((x) => x.id === route);
		if (v)
			return (
				<>
					<VariantBar current={v} />
					{v.component()}
				</>
			);
	}

	return <Index />;
}

function VariantBar({ current }: { current: VariantDef }): JSX.Element {
	return (
		<div className="variant-bar">
			<a href="#" className="variant-bar__home" aria-label="Back to index">
				← Mockups
			</a>
			<span className="variant-bar__sep">/</span>
			<span className="variant-bar__num">{current.number}</span>
			<span className="variant-bar__name">{current.name}</span>
			<div className="variant-bar__spacer" />
			<nav className="variant-bar__nav">
				{VARIANTS.map((v) => (
					<a
						key={v.id}
						href={`#${v.id}`}
						aria-current={v.id === current.id ? "page" : undefined}
					>
						{v.number}
					</a>
				))}
			</nav>
		</div>
	);
}

function Index(): JSX.Element {
	return (
		<div className="index">
			<div className="index__inner">
				<header className="index__header">
					<div className="index__eyebrow">Sero · landing-page mockups</div>
					<h1 className="index__title">
						Four dark-theme directions for the
						<br /> <em>DIY agent desktop</em> story.
					</h1>
					<p className="index__sub">
						Each variant is a complete dark-theme landing page covering the same plan:
						hero, problem, thesis, the self-extension loop, what Sero can become,
						plugin anatomy, built-in starting points, and final CTA. Pick a direction
						or compare aesthetics side by side.
					</p>
				</header>

				<div className="index__grid">
					{VARIANTS.map((v) => (
						<a key={v.id} href={`#${v.id}`} className={`card card--${v.id}`}>
							<div className="card__num">{v.number}</div>
							<div className="card__name">{v.name}</div>
							<div className="card__tag">{v.tagline}</div>
							<div className="card__cta">Open variant →</div>
						</a>
					))}
				</div>

				<footer className="index__footer">
					Source: <code>docs/plans/sero-landing-page-marketing-site.md</code> · Dark theme
					only · Tip: use <kbd>1</kbd>–<kbd>4</kbd> on a variant page to jump between them.
				</footer>
			</div>
			<KeyboardJumper variants={VARIANTS} />
		</div>
	);
}

function KeyboardJumper({ variants }: { variants: VariantDef[] }): JSX.Element {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const idx = ["1", "2", "3", "4"].indexOf(e.key);
			if (idx >= 0 && variants[idx]) {
				window.location.hash = variants[idx].id;
			} else if (e.key === "Escape") {
				window.location.hash = "";
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [variants]);
	return <></>;
}
