import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Award, AppWindow, XCircle } from "lucide-react";
import TablePagination, { usePagination } from "@/components/TablePagination";
import EmptyState from "@/components/EmptyState";

const ACTION_ICONS: Record<string, typeof Shield> = {
  assign_group: Shield,
  assign_license: Award,
  assign_app: AppWindow,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  processing: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  processing: "Processando",
  success: "Concluído",
  failed: "Falhou",
};

const ORIGIN_LABELS: Record<string, string> = {
  manual_individual: "Manual complementar",
  entra_sync: "Importado do Entra ID",
};

const ORIGIN_COLORS: Record<string, string> = {
  manual_individual: "bg-primary/10 text-primary border-primary/30",
  entra_sync: "bg-muted text-muted-foreground border-muted-foreground/20",
};


interface Props {
  individualQueue: any[] | undefined;
  getResourceName: (item: any) => string;
  onRevoke: (item: any) => void;
}

export default function IndividualAccessTabs({ individualQueue, getResourceName, onRevoke }: Props) {
  const [pageLic, setPageLic] = useState(1);
  const [pageGrp, setPageGrp] = useState(1);
  const [pageApp, setPageApp] = useState(1);
  const PAGE_SIZE = 25;

  const items = individualQueue ?? [];
  const licenses = useMemo(() => items.filter((i: any) => i.action_type === "assign_license"), [items]);
  const groups = useMemo(() => items.filter((i: any) => i.action_type === "assign_group"), [items]);
  const apps = useMemo(() => items.filter((i: any) => i.action_type === "assign_app"), [items]);

  const licPage = usePagination(licenses, pageLic, PAGE_SIZE);
  const grpPage = usePagination(groups, pageGrp, PAGE_SIZE);
  const appPage = usePagination(apps, pageApp, PAGE_SIZE);

  const renderTable = (data: any[]) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Recurso</th>
          <th className="p-4 font-medium">Origem</th>
          <th className="p-4 font-medium">Status</th>
          <th className="p-4 font-medium">Data</th>
          <th className="p-4 font-medium">Ação</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item: any) => {
          const Icon = ACTION_ICONS[item.action_type] || Shield;
          const origem = item.requested_by || "entra_sync";
          const isManual = origem === "manual_individual";
          return (
            <tr key={item.id} className="border-b last:border-0">
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{getResourceName(item)}</span>
                </div>
              </td>
              <td className="p-4">
                <Badge variant="outline" className={ORIGIN_COLORS[origem] || ""}>
                  {ORIGIN_LABELS[origem] || origem}
                </Badge>
              </td>
              <td className="p-4">
                <Badge variant="outline" className={STATUS_COLORS[item.status] || ""}>
                  {STATUS_LABELS[item.status] || item.status}
                </Badge>
              </td>
              <td className="p-4 text-muted-foreground">
                {new Date(item.created_at).toLocaleDateString("pt-BR")}
              </td>
              <td className="p-4">
                {isManual ? (
                  <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => onRevoke(item)}>
                    <XCircle className="mr-1 h-3 w-3" /> Revogar
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground italic" title="Gerenciado automaticamente pelo sync do Entra ID / perfil">
                    Gerenciado automaticamente
                  </span>
                )}
              </td>
            </tr>
          );
        })}
        {data.length === 0 && (
          <tr><td colSpan={5}><EmptyState message="Nenhum registro." /></td></tr>
        )}
      </tbody>
    </table>
  );


  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">Acessos Individuais</h3>
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="licencas" className="w-full">
            <div className="px-4 pt-4">
              <TabsList>
                <TabsTrigger value="licencas">Licenças ({licenses.length})</TabsTrigger>
                <TabsTrigger value="grupos">Grupos ({groups.length})</TabsTrigger>
                <TabsTrigger value="apps">Aplicações ({apps.length})</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="licencas" className="mt-0">
              {renderTable(licPage.paginatedItems)}
              <div className="px-4">
                <TablePagination totalItems={licenses.length} pageSize={PAGE_SIZE} currentPage={licPage.safePage} onPageChange={setPageLic} />
              </div>
            </TabsContent>
            <TabsContent value="grupos" className="mt-0">
              {renderTable(grpPage.paginatedItems)}
              <div className="px-4">
                <TablePagination totalItems={groups.length} pageSize={PAGE_SIZE} currentPage={grpPage.safePage} onPageChange={setPageGrp} />
              </div>
            </TabsContent>
            <TabsContent value="apps" className="mt-0">
              {renderTable(appPage.paginatedItems)}
              <div className="px-4">
                <TablePagination totalItems={apps.length} pageSize={PAGE_SIZE} currentPage={appPage.safePage} onPageChange={setPageApp} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
