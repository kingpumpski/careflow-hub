import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface FilterBarProps {
  filters: { company?: string; month?: string; year?: string; status?: string };
  onChange: (filters: any) => void;
  showStatus?: boolean;
  statusOptions?: { value: string; label: string }[];
  showCompany?: boolean;
}

export default function FilterBar({ filters, onChange, showStatus = false, statusOptions, showCompany = true }: FilterBarProps) {
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const hasFilters = Object.values(filters).some(v => v);

  return (
    <div className="flex min-w-0 w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
          <Filter className="w-4 h-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground sm:hidden">Filters</span>
      </div>
      <div className="grid grid-cols-2 gap-2 min-w-0 flex-1 sm:flex sm:flex-wrap sm:flex-none">
        {showCompany && (
          <select
            className="h-9 min-w-0 w-full sm:w-auto rounded-md border border-input bg-background px-2.5 text-xs"
            value={filters.company || ""}
            aria-label="Filter by insurance company"
            onChange={(e) => onChange({ ...filters, company: e.target.value })}
          >
            <option value="">All Companies</option>
            {(insurers || []).filter((i: any) => i.is_active !== false).map((i: any) => (
              <option key={i.id} value={i.id}>{i.company_name}</option>
            ))}
          </select>
        )}
        <select
          className="h-9 min-w-0 w-full sm:w-auto rounded-md border border-input bg-background px-2.5 text-xs"
          value={filters.month || ""}
          aria-label="Filter by month"
          onChange={(e) => onChange({ ...filters, month: e.target.value })}
        >
          <option value="">All Months</option>
          {monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <Input
          type="number"
          placeholder="Year"
          aria-label="Filter by year"
          className="h-9 min-w-0 w-full sm:w-20 text-xs"
          value={filters.year || ""}
          onChange={(e) => onChange({ ...filters, year: e.target.value })}
        />
        {showStatus && statusOptions && (
          <select
            className="h-9 min-w-0 w-full sm:w-auto rounded-md border border-input bg-background px-2.5 text-xs"
            value={filters.status || ""}
            aria-label="Filter by status"
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
          >
            <option value="">All Statuses</option>
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 w-full sm:w-auto shrink-0 px-2 text-xs" onClick={() => onChange({ company: "", month: "", year: "", status: "" })}>
          <X className="w-3 h-3 mr-1" />Clear
        </Button>
      )}
    </div>
  );
}
