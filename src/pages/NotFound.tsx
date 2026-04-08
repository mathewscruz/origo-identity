import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import origoLogo from "@/assets/origo-logo.png";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center space-y-6">
        <img src={origoLogo} alt="Órigo" className="mx-auto h-16 w-16 opacity-30 grayscale" />
        <div>
          <h1 className="mb-2 text-5xl font-bold text-foreground">404</h1>
          <p className="text-lg text-muted-foreground">Página não encontrada</p>
          <p className="text-sm text-muted-foreground/70 mt-1">O endereço que você tentou acessar não existe ou foi removido.</p>
        </div>
        <Button onClick={() => navigate("/")} size="lg">
          Voltar ao Início
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
