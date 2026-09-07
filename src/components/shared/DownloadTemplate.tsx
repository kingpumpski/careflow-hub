import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildTemplate, type ImportColumn } from "@/lib/importUtils";

interface DownloadTemplateProps {
  columns: ImportColumn[];
  fileName: string;
  /** When set, downloads that format directly instead of showing a menu. */
  format?: "csv" | "excel";
}

export default function DownloadTemplate({ columns, fileName, format }: DownloadTemplateProps) {
  if (format) {
    return (
      <Button variant="ghost" size="sm" onClick={() => buildTemplate(columns, fileName, format)} className="gap-1 text-xs h-7">
        <Download className="w-3 h-3" />Template
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
          <Download className="w-3 h-3" />Template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => buildTemplate(columns, fileName, "excel")}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => buildTemplate(columns, fileName, "csv")}>
          <FileText className="w-4 h-4 mr-2" />CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
