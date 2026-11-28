import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PdfPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blob: Blob | null;
  fileName: string;
  title: string;
};

export function PdfPreviewDialog({ open, onOpenChange, blob, fileName, title }: PdfPreviewDialogProps) {
  const [objectUrl, setObjectUrl] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!blob || !open) {
      setObjectUrl("");
      return;
    }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob, open]);

  const savePdf = () => {
    if (!objectUrl) return;
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const printPdf = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Review the complete document before printing or saving it.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/20">
          {objectUrl ? <iframe ref={frameRef} title={title} src={objectUrl} className="h-full w-full bg-white" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Preparing document preview…</div>}
        </div>
        <DialogFooter className="flex-row flex-wrap justify-end">
          <Button type="button" variant="outline" onClick={printPdf} disabled={!objectUrl}><Printer className="mr-2 h-4 w-4" />Print</Button>
          <Button type="button" onClick={savePdf} disabled={!objectUrl}><Download className="mr-2 h-4 w-4" />Save PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type HtmlPrintPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  title: string;
};

export function HtmlPrintPreviewDialog({ open, onOpenChange, html, title }: HtmlPrintPreviewDialogProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const print = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Review the report first. Choose a printer or “Save as PDF” from the print dialog when ready.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/20">
          <iframe ref={frameRef} title={title} srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-full w-full bg-white" />
        </div>
        <DialogFooter>
          <Button type="button" onClick={print}><Printer className="mr-2 h-4 w-4" />Print / Save as PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
