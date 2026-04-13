import { useState, useMemo, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Trash2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export interface SpPermission {
  site_id: string;
  pasta_nivel1_id: string | null;
  pasta_nivel2_id: string | null;
  permissao: string;
}

interface FolderNode {
  id: string;
  nome: string;
  parent_id: string | null;
  site_db_id: string;
  children: FolderNode[];
}

const PERM_OPTIONS = [
  { value: "__none__", label: "— Nenhuma —" },
  { value: "leitura", label: "Leitura" },
  { value: "escrita", label: "Escrita" },
  { value: "controle_total", label: "Controle Total" },
];

const permLabel = (p: string) => PERM_OPTIONS.find(o => o.value === p)?.label || p;

const permColor = (p: string) => {
  if (p === "leitura") return "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300";
  if (p === "escrita") return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300";
  if (p === "controle_total") return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300";
  return "";
};

interface Props {
  sites: any[];
  allPastas: any[];
  spItems: SpPermission[];
  onItemsChange: (items: SpPermission[]) => void;
  onSyncFolders: (siteDbId: string) => void;
  folderLoading: boolean;
}

export default function SharepointFolderTree({ sites, allPastas, spItems, onItemsChange, onSyncFolders, folderLoading }: Props) {
  const [selectedSite, setSelectedSite] = useState("");
  const [sitePopoverOpen, setSitePopoverOpen] = useState(false);

  // Build tree for selected site
  const folderTree = useMemo(() => {
    if (!selectedSite) return [];
    const sitePastas = (allPastas ?? []).filter((p: any) => p.site_db_id === selectedSite);
    const roots: FolderNode[] = [];
    const map = new Map<string, FolderNode>();
    sitePastas.forEach((p: any) => {
      map.set(p.id, { id: p.id, nome: p.nome, parent_id: p.parent_id, site_db_id: p.site_db_id, children: [] });
    });
    map.forEach(node => {
      if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    roots.sort((a, b) => a.nome.localeCompare(b.nome));
    roots.forEach(r => r.children.sort((a, b) => a.nome.localeCompare(b.nome)));
    return roots;
  }, [allPastas, selectedSite]);

  // Get explicit permission for a folder
  const getFolderPerm = useCallback((folderId: string, isLevel2: boolean): string | null => {
    const item = spItems.find(i => {
      if (i.site_id !== selectedSite) return false;
      if (isLevel2) return i.pasta_nivel2_id === folderId;
      return i.pasta_nivel1_id === folderId && !i.pasta_nivel2_id;
    });
    return item?.permissao ?? null;
  }, [spItems, selectedSite]);

  // Get site-level permission
  const getSitePerm = useCallback((): string | null => {
    const item = spItems.find(i => i.site_id === selectedSite && !i.pasta_nivel1_id && !i.pasta_nivel2_id);
    return item?.permissao ?? null;
  }, [spItems, selectedSite]);

  // Get inherited permission for a folder
  const getInheritedPerm = useCallback((parentPerm: string | null): string | null => {
    return parentPerm || getSitePerm();
  }, [getSitePerm]);

  // Set permission for site level
  const setSitePerm = useCallback((perm: string) => {
    const realPerm = perm === "__none__" ? "" : perm;
    const filtered = spItems.filter(i => !(i.site_id === selectedSite && !i.pasta_nivel1_id && !i.pasta_nivel2_id));
    if (realPerm) {
      onItemsChange([...filtered, { site_id: selectedSite, pasta_nivel1_id: null, pasta_nivel2_id: null, permissao: realPerm }]);
    } else {
      onItemsChange(filtered);
    }
  }, [spItems, selectedSite, onItemsChange]);

  // Set permission for a folder
  const setFolderPerm = useCallback((folderId: string, isLevel2: boolean, parentId: string | null, perm: string) => {
    const realPerm = perm === "__none__" ? "" : perm;
    const filtered = spItems.filter(i => {
      if (i.site_id !== selectedSite) return true;
      if (isLevel2) return i.pasta_nivel2_id !== folderId;
      return !(i.pasta_nivel1_id === folderId && !i.pasta_nivel2_id);
    });
    if (realPerm) {
      if (isLevel2) {
        filtered.push({ site_id: selectedSite, pasta_nivel1_id: parentId, pasta_nivel2_id: folderId, permissao: realPerm });
      } else {
        filtered.push({ site_id: selectedSite, pasta_nivel1_id: folderId, pasta_nivel2_id: null, permissao: realPerm });
      }
    }
    onItemsChange(filtered);
  }, [spItems, selectedSite, onItemsChange]);

  // Summary: all items with resolved names
  const summary = useMemo(() => {
    return spItems.map((item, idx) => {
      const site = (sites ?? []).find((s: any) => s.id === item.site_id);
      const p1 = item.pasta_nivel1_id ? (allPastas ?? []).find((p: any) => p.id === item.pasta_nivel1_id) : null;
      const p2 = item.pasta_nivel2_id ? (allPastas ?? []).find((p: any) => p.id === item.pasta_nivel2_id) : null;
      const path = [site?.nome || "Site", p1?.nome, p2?.nome].filter(Boolean).join(" / ");
      return { ...item, path, idx };
    });
  }, [spItems, sites, allPastas]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Selecione um site e defina permissões individuais para cada pasta e subpasta.</p>

      {/* Site selector */}
      <div className="space-y-1">
        <Popover open={sitePopoverOpen} onOpenChange={setSitePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
              {selectedSite ? (sites ?? []).find((s: any) => s.id === selectedSite)?.nome || "Site" : "Selecione o site SharePoint"}
              <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar site..." />
              <CommandList>
                <CommandEmpty>Nenhum site encontrado.</CommandEmpty>
                <CommandGroup>
                  {(sites ?? []).map((s: any) => (
                    <CommandItem key={s.id} value={s.nome} onSelect={() => {
                      setSelectedSite(s.id);
                      onSyncFolders(s.id);
                      setSitePopoverOpen(false);
                    }}>
                      {s.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Folder tree */}
      {selectedSite && (
        <div className="rounded-md border">
          {/* Site-level permission */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{(sites ?? []).find((s: any) => s.id === selectedSite)?.nome || "Site"}</span>
              <span className="text-xs text-muted-foreground">(site inteiro)</span>
            </div>
            <PermSelect value={getSitePerm() || ""} onChange={setSitePerm} />
          </div>

          {folderLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse p-3">Carregando pastas...</p>
          ) : folderTree.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">Nenhuma pasta encontrada neste site.</p>
          ) : (
            <ScrollArea className="max-h-[280px]">
              <div className="p-1">
                {folderTree.map(folder => (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    level={0}
                    explicitPerm={getFolderPerm(folder.id, false)}
                    inheritedPerm={getInheritedPerm(null)}
                    onPermChange={(perm) => setFolderPerm(folder.id, false, null, perm)}
                    getFolderPerm={getFolderPerm}
                    setFolderPerm={setFolderPerm}
                    parentPerm={getFolderPerm(folder.id, false) || getInheritedPerm(null)}
                    folderId={folder.id}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Summary of all permissions */}
      {summary.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Resumo de permissões ({summary.length})</p>
          <ScrollArea className="max-h-[160px] rounded-md border">
            <div className="p-2 space-y-1">
              {summary.map((s) => (
                <div key={s.idx} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{s.path}</span>
                    <Badge variant="outline" className={cn("ml-2 text-xs", permColor(s.permissao))}>{permLabel(s.permissao)}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onItemsChange(spItems.filter((_, i) => i !== s.idx))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {!selectedSite && summary.length === 0 && (
        <EmptyState message="Nenhuma permissão SharePoint adicionada." size="sm" />
      )}
    </div>
  );
}

function PermSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-[140px] text-xs">
        <SelectValue placeholder="— Nenhuma —" />
      </SelectTrigger>
      <SelectContent>
        {PERM_OPTIONS.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FolderRow({ folder, level, explicitPerm, inheritedPerm, onPermChange, getFolderPerm, setFolderPerm, parentPerm, folderId }: {
  folder: FolderNode;
  level: number;
  explicitPerm: string | null;
  inheritedPerm: string | null;
  onPermChange: (perm: string) => void;
  getFolderPerm: (id: string, isLevel2: boolean) => string | null;
  setFolderPerm: (id: string, isLevel2: boolean, parentId: string | null, perm: string) => void;
  parentPerm: string | null;
  folderId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = folder.children.length > 0;
  const currentPerm = explicitPerm || "";
  const showInherited = !explicitPerm && inheritedPerm;

  return (
    <div>
      <div
        className="flex items-center justify-between py-1.5 px-2 hover:bg-muted/50 rounded"
        style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {hasChildren ? (
            <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-muted rounded">
              {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ) : (
            <span className="w-[18px]" />
          )}
          {expanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-500" /> : <Folder className="h-3.5 w-3.5 text-amber-500" />}
          <span className="text-sm truncate">{folder.nome}</span>
          {showInherited && (
            <span className="text-[10px] text-muted-foreground ml-1">(herda: {permLabel(inheritedPerm!)})</span>
          )}
        </div>
        <PermSelect value={currentPerm} onChange={onPermChange} />
      </div>
      {expanded && hasChildren && folder.children.map(child => {
        const childExplicit = getFolderPerm(child.id, true);
        const childInherited = explicitPerm || inheritedPerm;
        return (
          <FolderRow
            key={child.id}
            folder={child}
            level={level + 1}
            explicitPerm={childExplicit}
            inheritedPerm={childInherited}
            onPermChange={(perm) => setFolderPerm(child.id, true, folderId, perm)}
            getFolderPerm={getFolderPerm}
            setFolderPerm={setFolderPerm}
            parentPerm={childExplicit || childInherited}
            folderId={child.id}
          />
        );
      })}
    </div>
  );
}
