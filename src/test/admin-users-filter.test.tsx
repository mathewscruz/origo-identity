import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: [
  { id: "admin-one", nome: "Administrador Um", email: "one@example.test", role: "platform_admin", ativo: true },
  { id: "admin-two", nome: "Administrador Dois", email: "two@example.test", role: "platform_admin", ativo: true },
  { id: "support", nome: "Pessoa Suporte", email: "support@example.test", role: "operador", ativo: true },
], error: null })) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "platform_admin", user: { id: "admin-one" }, profile: null, refreshProfile: vi.fn() }) }));
vi.mock("@/lib/avatarUrl", () => ({ useAvatarUrl: () => null }));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunction: vi.fn() }));

import UsuariosPage from "@/pages/admin/UsuariosPage";

afterEach(cleanup);

describe("Filtro de Super Admins", () => {
  it("lista os dois platform_admin e volta a todos no segundo clique", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><UsuariosPage /></TooltipProvider></MemoryRouter></QueryClientProvider>);
    await screen.findByText("Pessoa Suporte");
    fireEvent.click(screen.getByText("Super Admins"));
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Administrador Um")).toBeInTheDocument();
    expect(table.getByText("Administrador Dois")).toBeInTheDocument();
    expect(table.queryByText("Pessoa Suporte")).not.toBeInTheDocument();
    expect(table.getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByText("Super Admins"));
    expect(table.getByText("Pessoa Suporte")).toBeInTheDocument();
  });
});