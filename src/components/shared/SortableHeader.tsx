import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: { key: string; direction: "asc" | "desc" } | null;
  onSort: (key: string) => void;
}

export default function SortableHeader({ label, sortKey, currentSort, onSort }: SortableHeaderProps) {
  const isActive = currentSort?.key === sortKey;
  return (
    <th
      className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentSort.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />
        )}
      </div>
    </th>
  );
}

export function useSort<T>(data: T[], defaultKey?: string) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(
    defaultKey ? { key: defaultKey, direction: "desc" } : null
  );

  const handleSort = (key: string) => {
    setSort(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const sorted = sort
    ? [...data].sort((a: any, b: any) => {
        const aVal = a[sort.key];
        const bVal = b[sort.key];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = typeof aVal === "number" ? aVal - bVal : String(aVal).localeCompare(String(bVal));
        return sort.direction === "asc" ? cmp : -cmp;
      })
    : data;

  return { sorted, sort, handleSort };
}

import { useState } from "react";
