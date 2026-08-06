import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useColaboradores } from "@/hooks/useOrigoData";

export interface ColaboradorOption {
  id: string;
  nome: string;
  email: string | null;
}

interface Props {
  value?: string | null;
  onChange: (colaborador: ColaboradorOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  onlyActive?: boolean;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function ColaboradorPicker({ value, onChange, placeholder = "Buscar colaborador...", disabled, onlyActive = true }: Props) {
  const { data: colaboradores } = useColaboradores();
  const [open, setOpen] = useState(false);

  const all: ColaboradorOption[] = useMemo(() => {
    const list = (colaboradores ?? []) as any[];
    return list.map((c) => ({ id: c.id, nome: c.nome, email: c.email ?? null, status: c.status })) as any[];
  }, [colaboradores]);

  const options: ColaboradorOption[] = useMemo(() => {
    return all.filter((c: any) => (onlyActive ? !["inativo", "desligado"].includes(String(c.status ?? "").toLowerCase()) : true));
  }, [all, onlyActive]);

  // Fallback to the full list so an already-selected (possibly inactive) colaborador still renders
  const selected = options.find((o) => o.id === value) ?? all.find((o) => o.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate text-left">
              <span className="font-medium">{selected.nome}</span>
              {selected.email && <span className="ml-2 text-xs text-muted-foreground">{selected.email}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2"><Search className="h-3 w-3" />{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const opt = options.find((o) => o.id === itemValue);
            if (!opt) return 0;
            const haystack = normalize(`${opt.nome} ${opt.email ?? ""}`);
            return haystack.includes(normalize(search)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por nome ou e-mail..." />
          <CommandList>
            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
            <CommandGroup>
              {selected && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Limpar seleção
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={opt.id}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{opt.nome}</span>
                    {opt.email && <span className="text-xs text-muted-foreground">{opt.email}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
