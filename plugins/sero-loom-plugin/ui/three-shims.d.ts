// three@0.184 ships the WebGPU/TSL builds without type declarations for these
// subpath exports. We use them through thin, loosely-typed wrappers, so declare
// them as ambient modules to keep the build self-contained.
declare module 'three/webgpu';
declare module 'three/tsl';
