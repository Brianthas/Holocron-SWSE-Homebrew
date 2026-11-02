// @foundryvtt/foundryvtt-cli ships no types; this declares the one call tools/build-packs.ts makes
// (node_modules/@foundryvtt/foundryvtt-cli/lib/package.mjs, compilePack).
declare module "@foundryvtt/foundryvtt-cli" {
  export function compilePack(src: string, dest: string, options?: { nedb?: boolean; yaml?: boolean; recursive?: boolean; log?: boolean }): Promise<void>;
}
