// Authentic Sero chat panel reproduction for the Terminal variant hero.
// Mirrors the real Sero AGENT panel: header bar, user bubble with slash
// command + @file refs, collapsible "N actions completed" tool block,
// agent response with markdown + file/code chips, and the chat input
// with the +/persons/db/brain · GPT-5.5 · tier · send toolbar.
//
// Styling stays in the Terminal-variant aesthetic: mono everywhere,
// square-cornered bubbles, phosphor-green accent. The structure and
// affordances are real Sero so a user familiar with the app recognizes it.

export function TmChat(): JSX.Element {
	return (
		<section className="tm-chat" aria-label="Sero agent chat panel">
			<TmChatHeader />
			<div className="tm-chat__scroll">
				<TmUserBubble />
				<TmActionBlock />
				<TmAgentReply />
			</div>
			<TmChatInput />
		</section>
	);
}

function TmChatHeader() {
	return (
		<header className="tm-chat__header">
			<span className="tm-chat__dot" aria-hidden="true" />
			<span className="tm-chat__role">AGENT</span>
			<span className="tm-chat__title" title="Build a release-checklist plugin for this monorepo">
				Build a release-checklist plugin…
			</span>
			<span className="tm-chat__spacer" />
			<span className="tm-chat__meter" aria-label="Context used">
				<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
					<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
					<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="38" strokeDashoffset="33" transform="rotate(-90 8 8)" />
				</svg>
				6%
			</span>
			<span className="tm-chat__cost">
				<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
					<circle cx="6" cy="6" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
					<circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
				</svg>
				$0.25
			</span>
		</header>
	);
}

function TmUserBubble() {
	return (
		<div className="tm-msg tm-msg--user">
			<div className="tm-msg__bubble">
				<span className="tm-cmd">/plugin</span> Build me a{" "}
				<span className="tm-ref">release-checklist</span> plugin for{" "}
				<span className="tm-ref tm-ref--file">@AGENTS.md</span>. Use{" "}
				<span className="tm-ref tm-ref--file">@plugins/sero-git-plugin</span> as a
				reference.
			</div>
			<div className="tm-msg__avatar tm-msg__avatar--user" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="11" height="11">
					<circle cx="8" cy="6" r="3" fill="currentColor" />
					<path d="M2 14c1-3 4-4 6-4s5 1 6 4" fill="currentColor" />
				</svg>
			</div>
		</div>
	);
}

type ToolCall = {
	kind: "read" | "edit" | "bash" | "browser" | "sero-cli";
	arg: string;
};

const ACTIONS: ToolCall[] = [
	{ kind: "read", arg: "AGENTS.md" },
	{ kind: "read", arg: "plugins/sero-git-plugin/package.json" },
	{ kind: "read", arg: "plugins/sero-git-plugin/src/tool.ts" },
	{ kind: "bash", arg: "ls plugins/" },
	{ kind: "edit", arg: "plugins/release-checklist/package.json" },
	{ kind: "edit", arg: "plugins/release-checklist/src/tool.ts" },
	{ kind: "edit", arg: "plugins/release-checklist/src/App.tsx" },
	{ kind: "sero-cli", arg: "plugins reload" },
];

function TmActionBlock() {
	return (
		<div className="tm-actions" role="group" aria-label="Tool calls">
			<button type="button" className="tm-actions__head" aria-expanded="true">
				<svg className="tm-actions__chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
					<path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" />
				</svg>
				<svg className="tm-actions__wrench" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
					<path d="M11 2a3 3 0 0 0-2.7 4.3L2 12.6 3.4 14l6.3-6.3A3 3 0 1 0 11 2zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" fill="currentColor" />
				</svg>
				<span className="tm-actions__check" aria-hidden="true">
					<svg viewBox="0 0 14 14" width="13" height="13">
						<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
						<path d="M4 7.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
					</svg>
				</span>
				<span className="tm-actions__title">{ACTIONS.length} actions completed</span>
			</button>
			<ul className="tm-actions__list">
				{ACTIONS.map((a, i) => (
					<li key={i} className="tm-actions__row">
						<span className="tm-actions__dot" aria-hidden="true" />
						<span className={`tm-actions__kind tm-actions__kind--${a.kind}`}>{a.kind}</span>
						<span className="tm-actions__arg">{a.arg}</span>
					</li>
				))}
			</ul>
			<button type="button" className="tm-actions__more">Show full details</button>
		</div>
	);
}

function TmAgentReply() {
	return (
		<div className="tm-msg tm-msg--agent">
			<div className="tm-msg__avatar tm-msg__avatar--bot" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="11" height="11">
					<rect x="3" y="5" width="10" height="8" rx="1" fill="currentColor" />
					<circle cx="6" cy="9" r="1" fill="#0a0b0a" />
					<circle cx="10" cy="9" r="1" fill="#0a0b0a" />
					<path d="M8 2v3" stroke="currentColor" strokeWidth="1.4" />
					<circle cx="8" cy="2" r="1" fill="currentColor" />
				</svg>
			</div>
			<div className="tm-msg__body">
				<p>
					Scaffolded <code>release-checklist</code> as a Sero plugin under{" "}
					<code>plugins/release-checklist/</code>. Followed the patterns in{" "}
					<code>sero-git-plugin</code>.
				</p>
				<p>
					<strong>Registered:</strong>
				</p>
				<ul>
					<li>
						tool <code>checklist.gate</code> — agent-callable, blocks ship if open items
					</li>
					<li>
						command <code>/ship</code> — runs the gate, opens the checklist UI
					</li>
					<li>
						sidebar app <code>release-checklist</code> —{" "}
						<span className="tm-pill tm-pill--ok">live</span>
					</li>
				</ul>
				<p>
					Try <code>/ship</code> in this session, or call <code>checklist.gate</code> from any
					subagent.
				</p>
				<div className="tm-react" aria-label="Message reactions">
					<button type="button" aria-label="Helpful">
						<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
							<path d="M5 14V8l3-5 1 1v3h4l-1 7H5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
						</svg>
					</button>
					<button type="button" aria-label="Not helpful">
						<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
							<path d="M11 2v6l-3 5-1-1v-3H3l1-7h7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
						</svg>
					</button>
					<button type="button" aria-label="Copy">
						<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
							<rect x="5" y="3" width="8" height="10" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<path d="M3 5v8h6" fill="none" stroke="currentColor" strokeWidth="1.3" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}

function TmChatInput() {
	return (
		<div className="tm-input">
			<div className="tm-input__field">Ask Sero anything… (/ for commands, @ for files)</div>
			<div className="tm-input__bar">
				<div className="tm-input__tools">
					<button type="button" aria-label="Attach" className="tm-input__icon">
						<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
							<path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" />
						</svg>
					</button>
					<button type="button" aria-label="Subagents" className="tm-input__icon">
						<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
							<circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<circle cx="11" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<path d="M2.5 13c.6-2 2-3 3.5-3s2.9 1 3.5 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<path d="M9.5 13c.5-1.4 1.4-2.2 2.5-2.2s2 .8 2.5 2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
						</svg>
					</button>
					<button type="button" aria-label="Memory" className="tm-input__icon">
						<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
							<ellipse cx="8" cy="5" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<path d="M3 5v3c0 1.1 2.2 2 5 2s5-.9 5-2V5" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<path d="M3 8v3c0 1.1 2.2 2 5 2s5-.9 5-2V8" fill="none" stroke="currentColor" strokeWidth="1.3" />
						</svg>
					</button>
					<button type="button" aria-label="Skills" className="tm-input__icon">
						<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
							<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<path d="M5 8c0-3 1-5 3-5s3 2 3 5-1 5-3 5-3-2-3-5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
							<path d="M2 8h12" stroke="currentColor" strokeWidth="1.3" />
						</svg>
					</button>
				</div>
				<div className="tm-input__model">
					<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="tm-input__provider">
						<path d="M8 2l4 2v4l-4 2-4-2V4l4-2zm0 6l4 2v4l-4 2-4-2v-4l4-2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
					</svg>
					<span className="tm-input__modelName">GPT-5.5</span>
					<span className="tm-input__tier">Low</span>
					<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
						<path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" />
					</svg>
				</div>
				<button type="button" className="tm-input__send" aria-label="Send">
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<path d="M3 9h7M7 5l4 4-4 4" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="square" />
					</svg>
				</button>
			</div>
		</div>
	);
}
