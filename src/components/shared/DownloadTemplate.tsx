import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";

interface DownloadTemplateProps {
  columns: { key: string; label: string }[];
  fileName: string;
  format?: "csv" | "excel";
}

export default function DownloadTemplate({ columns, fileName, format = "csv" }: DownloadTemplateProps) {
  const handleDownload = () => {
    if (format === "excel") {
      const ws = XLSX.utils.aoa_to_sheet([columns.map(c => c.label)]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      const csv = columns.map(c => c.label).join(",") + "\n";
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleDownload} className="gap-1 text-xs h-7">
      <Download className="w-3 h-3" />Template
    </Button>
  );
}
