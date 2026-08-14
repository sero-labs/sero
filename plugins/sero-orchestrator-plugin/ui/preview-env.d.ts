/** Harness-only: lets preview.tsx import the host theme JSON presets. */
declare module '*.json' {
  const value: unknown;
  export default value;
}
