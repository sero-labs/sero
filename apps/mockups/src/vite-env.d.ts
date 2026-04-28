/// <reference types="vite/client" />

// JPG/PNG/WEBP/SVG imports under @docs-images/* and elsewhere — Vite resolves
// these as URL strings at runtime; declare the types so TypeScript is happy.
declare module "*.jpg" {
	const src: string;
	export default src;
}
declare module "*.jpeg" {
	const src: string;
	export default src;
}
declare module "*.png" {
	const src: string;
	export default src;
}
declare module "*.webp" {
	const src: string;
	export default src;
}
declare module "*.svg" {
	const src: string;
	export default src;
}

// React 19 ships JSX namespace under `React.JSX`. Re-expose the global
// `JSX` namespace for ergonomic `JSX.Element` annotations.
import type { JSX as ReactJSX } from "react";
declare global {
	namespace JSX {
		type Element = ReactJSX.Element;
		type ElementClass = ReactJSX.ElementClass;
		type IntrinsicElements = ReactJSX.IntrinsicElements;
	}
}
