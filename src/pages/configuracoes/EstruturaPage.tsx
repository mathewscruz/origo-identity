import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AreasPage from "./AreasPage";
import EmpresasPage from "./EmpresasPage";
import LocalidadesPage from "./LocalidadesPage";

const TABS = ["areas", "empresas", "localidades"] as const;

export default function EstruturaPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("aba") as never) ? params.get("aba")! : "areas";
  return (
    <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })} className="space-y-4">
      <TabsList>
        <TabsTrigger value="areas">Áreas</TabsTrigger>
        <TabsTrigger value="empresas">Empresas</TabsTrigger>
        <TabsTrigger value="localidades">Localidades</TabsTrigger>
      </TabsList>
      <TabsContent value="areas"><AreasPage /></TabsContent>
      <TabsContent value="empresas"><EmpresasPage /></TabsContent>
      <TabsContent value="localidades"><LocalidadesPage /></TabsContent>
    </Tabs>
  );
}
