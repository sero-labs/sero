/**
 * The Sero Pixel Engine.
 *
 * A sprite project is data — grids of palette indexes — and this is everything
 * that turns that data into pixels: the schema, the codec, the resolver, the
 * validation firewall, the renderer, the packer, the atlas writer, the clip
 * player and the invariant migrations.
 *
 * It has no dependencies, no Node APIs, no React and no imports from the plugin
 * that hosts it, and nothing in a compile path reads a clock or a random number
 * (spec §16). It runs unchanged in the plugin runtime, in the browser and in a
 * game, so extracting it to `@sero-ai/pixel-engine` later is a move rather than
 * a rewrite. Two tests keep that true: `boundary.test.ts` reads the import graph,
 * and `determinism.test.ts` compiles the same project in a second process.
 */

export * from './atlas';
export * from './compile';
export * from './fault';
export * from './grid';
export * from './hash';
export * from './migrate';
export * from './pack';
export * from './player';
export * from './png';
export * from './render';
export * from './resolve';
export * from './schema';
export * from './validate';
