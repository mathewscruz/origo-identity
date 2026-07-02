// Ambient declaration so browser TS project compiles files that reference
// `process.env`. The MCP tool files are extracted at build time and re-emitted
// into a Deno edge function bundle where `process.env` resolves at runtime.
declare const process: { env: Record<string, string | undefined> };
