import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

interface Props {
  value: string[]; // diagnosis_code ids
  onChange: (ids: string[]) => void;
  label?: string;
}

export default function MultiDiagnosisPicker({ value, onChange, label = "Diagnoses (ICD-10)" }: Props) {
  const { data: codes } = useSupabaseQuery("diagnosis_codes");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => (codes || []).filter((c: any) => !c.archived), [codes]);
  const selected = list.filter((c: any) => value.includes(c.id));
  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return list.slice(0, 25);
    return list.filter((c: any) =>
      c.code?.toLowerCase().includes(t) ||
      c.description?.toLowerCase().includes(t) ||
      c.category?.toLowerCase?.().includes(t),
    ).slice(0, 50);
  }, [q, list]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex flex-wrap gap-1.5 min-h-[34px] p-2 rounded-md border border-input bg-background">
        {selected.length === 0 && <span className="text-xs text-muted-foreground">None selected</span>}
        {selected.map((c: any) => (
          <Badge key={c.id} variant="secondary" className="gap-1">
            {c.code} — {c.description}
            <button type="button" onClick={() => toggle(c.id)}><X className="w-3 h-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search ICD-10 code, description, category..."
          className="pl-10 h-9"
        />
      </div>
      {open && (
        <div className="border border-border rounded-md max-h-56 overflow-y-auto bg-background shadow-sm">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No matches</div>
          ) : filtered.map((c: any) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 ${value.includes(c.id) ? "bg-primary/5" : ""}`}
            >
              <input type="checkbox" readOnly checked={value.includes(c.id)} />
              <span className="font-mono text-xs">{c.code}</span>
              <span className="flex-1">{c.description}</span>
              {c.category && <span className="text-xs text-muted-foreground">{c.category}</span>}
            </button>
          ))}
          <div className="p-2 text-right">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}