import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query", "@radix-ui/react-dropdown-menu"],
  },
  plugins: [
    react(),
    // O codegen do MCP (supabase/functions/mcp/index.ts) tem um bug no Windows:
    // caminhos absolutos "C:\..." são tratados como pacote npm e o bundle sai
    // quebrado, sobrescrevendo o arquivo versionado. No Lovable (Linux) funciona.
    process.platform !== "win32" && mcpPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
