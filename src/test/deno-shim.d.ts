// Shim de tipos para testes que importam módulos de Edge Functions (Deno).
// Não afeta o runtime — apenas satisfaz o typecheck do frontend.
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};
