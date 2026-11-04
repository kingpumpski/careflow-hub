import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  PlusCircle,
  Printer,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/modules/security";
import {
  analyzeClaim,
  calculateClaimTotal,
  catalogItemToClaimLine,
  createClaimResponseDraft,
  mapClaimCatalogItems,
  recordClaimDiagnosisEvent,
  saveClaimDiagnosisDraft,
  type ClaimAnalysisResult,
  type ClaimCatalogItem,
  type ClaimDiagnosisEventMetadata,
  type ClaimDiagnosisRecommendation,
  type ClaimEntryMode,
  type ClaimServiceItem,
  type ClaimWorkflowType,
  type ManualClaimInput,
  type ManualClaimLine,
} from "@/features/claims/services/claimDiagnosis.service";
import { exportClaimDiagnosisDraftPdf, type ClaimDiagnosisPdfData } from "@/features/claims/services/claimDiagnosisPdf.service";

const REJECTION_REASONS = [
  "Medical Necessity",
  "Missing Secondary Diagnosis",
  "Code Mismatch",
  "Prior Authorization",
  "Eligibility",
  "Other",
];

type SelectedCode = ClaimDiagnosisRecommendation & {
  source: "ai" | "manual";
  helpful?: "up" | "down" | null;
};

const emptyManualClaim = (): ManualClaimInput => ({
  patient_name: "",
  claim_number: "",
  date_of_service: "",
  insurance_company_id: "",
  rejection_reason: "",
  clinical_notes: "",
  co_payment: 0,
  authorization_code: "",
  comments: [],
  service_items: [],
  original_diagnoses: [],
});

function getConfidenceTone(confidence: number) {
  if (confidence >= 85) return "bg-emerald-500";
  if (confidence >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

function asNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export default function ClaimDiagnosisAssistant() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { data: catalogRows } = useSupabaseQuery("preauth_catalog_items");
  const { data: procedureRows } = useSupabaseQuery("procedures");
  const { data: diagnosisRows } = useSupabaseQuery("diagnosis_codes");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: savedDrafts } = useSupabaseQuery("claim_diagnosis_drafts", { limit: 10 });
  const [workflowType, setWorkflowType] = useState<ClaimWorkflowType>("new_claim");
  const [entryMode, setEntryMode] = useState<ClaimEntryMode>("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ClaimAnalysisResult | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<SelectedCode[]>([]);
  const [helpful, setHelpful] = useState<Record<string, "up" | "down">>({});
  const [manualClaim, setManualClaim] = useState<ManualClaimInput>(emptyManualClaim);
  const [searchText, setSearchText] = useState("");
  const [searchMode, setSearchMode] = useState<"begins" | "contains">("contains");
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseEditable, setResponseEditable] = useState(false);
  const [customItem, setCustomItem] = useState({ code: "", description: "", unitPrice: "", category: "Other" as ClaimServiceItem["category"] });
  const [diagnosisInput, setDiagnosisInput] = useState({ code: "", description: "" });
  const [manualDiagnosisSearch, setManualDiagnosisSearch] = useState("");
  const [selectedManualDiagnosis, setSelectedManualDiagnosis] = useState<Record<string, unknown> | null>(null);
  const [commentInput, setCommentInput] = useState("");

  const canWrite = can("claims.write");
  const canUseRejected = can("claims.write") || can("payments.write");
  const catalog = useMemo(
    () => mapClaimCatalogItems((catalogRows ?? []) as Array<Record<string, unknown>>, (procedureRows ?? []) as Array<Record<string, unknown>>),
    [catalogRows, procedureRows],
  );
  const filteredCatalog = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return catalog.slice(0, 60);
    return catalog.filter((item) => {
      const target = `${item.code} ${item.name} ${item.category}`.toLowerCase();
      return searchMode === "begins"
        ? item.code.toLowerCase().startsWith(query) || item.name.toLowerCase().startsWith(query)
        : target.includes(query);
    }).slice(0, 60);
  }, [catalog, searchMode, searchText]);
  const filteredDiagnoses = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return ((diagnosisRows ?? []) as Array<Record<string, unknown>>)
      .filter((entry) => !query || `${entry.code} ${entry.description}`.toLowerCase().includes(query))
      .slice(0, 12);
  }, [diagnosisRows, searchText]);
  const filteredManualDiagnoses = useMemo(() => {
    const query = manualDiagnosisSearch.trim().toLowerCase();
    return ((diagnosisRows ?? []) as Array<Record<string, unknown>>)
      .filter((entry) => !query || `${entry.code} ${entry.description}`.toLowerCase().includes(query))
      .slice(0, 12);
  }, [diagnosisRows, manualDiagnosisSearch]);
  const total = calculateClaimTotal(manualClaim.service_items);

  const clearAnalysis = () => {
    setAnalysis(null);
    setSelectedCodes([]);
    setHelpful({});
    setResponseText("");
  };

  const handleFilePicked = (nextFile?: File) => {
    if (!nextFile) return;
    setUploadedFile(nextFile);
    setEntryMode("upload");
    clearAnalysis();
  };

  const updateManualClaim = <K extends keyof ManualClaimInput>(key: K, value: ManualClaimInput[K]) => {
    setManualClaim((current) => ({ ...current, [key]: value }));
  };

  const addCatalogItem = (item: ClaimCatalogItem) => {
    const nextLine = catalogItemToClaimLine(item);
    updateManualClaim("service_items", [...manualClaim.service_items, nextLine]);
  };

  const addCustomItem = () => {
    if (!customItem.description.trim()) {
      toast({ title: "Item description required", description: "Enter a description for the service item.", variant: "destructive" });
      return;
    }
    const line: ManualClaimLine = {
      id: crypto.randomUUID(),
      code: customItem.code.trim(),
      description: customItem.description.trim(),
      tooth: "",
      eye: "",
      days: 1,
      unit: "Unit",
      quantity: 1,
      unitPrice: asNumber(customItem.unitPrice),
      flag: "",
      status: "Pending",
      category: customItem.category,
    };
    updateManualClaim("service_items", [...manualClaim.service_items, line]);
    setCustomItem({ code: "", description: "", unitPrice: "", category: "Other" });
  };

  const updateLine = (id: string, patch: Partial<ManualClaimLine>) => {
    updateManualClaim("service_items", manualClaim.service_items.map((line) => line.id === id ? { ...line, ...patch } : line));
  };

  const addManualDiagnosis = () => {
    const code = String(selectedManualDiagnosis?.code ?? "").trim().toUpperCase();
    const match = ((diagnosisRows ?? []) as Array<Record<string, unknown>>).find((row) => String(row.code).toUpperCase() === code);
    if (!match) {
      toast({ title: "Select a diagnosis from the code list", description: "Typed text cannot be added as a diagnosis. Select a matching entry from the project diagnosis master first.", variant: "destructive" });
      return;
    }
    const diagnosis = { code, description: String(match.description) };
    if (manualClaim.original_diagnoses.some((entry) => entry.code === diagnosis.code)) return;
    updateManualClaim("original_diagnoses", [...manualClaim.original_diagnoses, diagnosis]);
    setDiagnosisInput({ code: "", description: "" });
    setManualDiagnosisSearch("");
    setSelectedManualDiagnosis(null);
  };

  const addComment = () => {
    const value = commentInput.trim();
    if (!value) return;
    updateManualClaim("comments", [...manualClaim.comments, value]);
    setCommentInput("");
  };

  const runAnalysis = async () => {
    if (entryMode === "upload" && !uploadedFile) return;
    if (entryMode === "manual" && !manualClaim.service_items.length && !manualClaim.clinical_notes.trim() && !manualClaim.original_diagnoses.length) {
      toast({ title: "Add claim details first", description: "Enter clinical notes, an existing diagnosis, or at least one service item before analysis.", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    clearAnalysis();
    setSearchText("");
    try {
      const analysisId = crypto.randomUUID();
      const manualInput: ManualClaimInput = {
        ...manualClaim,
        rejection_reason: workflowType === "rejected_claim" ? manualClaim.rejection_reason || REJECTION_REASONS[0] : "",
      };
      const result = await analyzeClaim({
        workflow_type: workflowType,
        analysis_id: analysisId,
        rejection_reason: workflowType === "rejected_claim" ? manualClaim.rejection_reason || REJECTION_REASONS[0] : undefined,
        ...(entryMode === "upload" && uploadedFile ? { file: uploadedFile } : { manual_claim: manualInput }),
      });
      setAnalysis(result);
      setResponseText(result.response_message ?? "");
      toast({ title: "Claim analysis complete", description: `${result.recommended_diagnoses.length} diagnosis recommendation(s) returned for review.` });
    } catch (error) {
      toast({
        title: "Claim analysis failed",
        description: error instanceof Error ? error.message : "The analysis service could not process this claim.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const recordEvent = async (action: string, metadata: ClaimDiagnosisEventMetadata) => {
    if (!analysis) return;
    try {
      await recordClaimDiagnosisEvent(analysis.analysis_id, action, {
        workflow_type: analysis.workflowType,
        document_sha256: analysis.document_sha256,
        ...metadata,
      });
    } catch (error) {
      toast({
        title: "Audit event was not recorded",
        description: error instanceof Error ? error.message : "The action could not be written to the audit log.",
        variant: "destructive",
      });
    }
  };

  const acceptRecommendation = (recommendation: ClaimDiagnosisRecommendation) => {
    setSelectedCodes((existing) => {
      if (existing.some((code) => code.code === recommendation.code)) return existing;
      return [...existing, { ...recommendation, source: "ai" }];
    });
    void recordEvent("recommendation_selected", { code: recommendation.code, selected: true, source: "ai" });
  };

  const addManualCode = (entry: Record<string, unknown>) => {
    const code = String(entry.code);
    const recommendation: SelectedCode = {
      code,
      version: "ICD-10",
      description: String(entry.description),
      confidence: 100,
      justification: "Manually selected from the project's diagnosis master.",
      sourceText: "User-selected diagnosis code",
      source: "manual",
    };
    setSelectedCodes((existing) => existing.some((item) => item.code === code) ? existing : [...existing, recommendation]);
    void recordEvent("recommendation_selected", { code, selected: true, source: "manual" });
  };

  const removeSelectedCode = (code: string) => {
    setSelectedCodes((existing) => existing.filter((item) => item.code !== code));
    void recordEvent("recommendation_selected", { code, selected: false });
  };

  const setRecommendationFeedback = (code: string, value: "up" | "down") => {
    const next = helpful[code] === value ? undefined : value;
    setHelpful((current) => {
      const updated = { ...current };
      if (next) updated[code] = next;
      else delete updated[code];
      return updated;
    });
    void recordEvent("recommendation_feedback", { code, helpful: next ?? null });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFilePicked(event.dataTransfer.files?.[0]);
  };

  const handleBrowse = (event: ChangeEvent<HTMLInputElement>) => {
    handleFilePicked(event.target.files?.[0]);
    event.target.value = "";
  };

  const copyResponse = async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
      toast({ title: "Response copied" });
    } catch (error) {
      toast({ title: "Could not copy response", description: error instanceof Error ? error.message : "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  const exportDraftPdf = (draft: ClaimDiagnosisPdfData) => {
    try {
      exportClaimDiagnosisDraftPdf(draft);
      toast({ title: "Draft PDF downloaded" });
    } catch (error) {
      toast({
        title: "Could not export draft",
        description: error instanceof Error ? error.message : "The PDF could not be generated.",
        variant: "destructive",
      });
    }
  };

  const exportSavedDraftPdf = (draft: Record<string, unknown>) => {
    const insurerName = ((insurers ?? []) as Array<Record<string, unknown>>)
      .find((insurer) => insurer.id === draft.insurance_company_id)?.company_name;
    exportDraftPdf({ ...draft, insurer_name: insurerName } as ClaimDiagnosisPdfData);
  };

  const exportCurrentDraftPdf = () => {
    if (!analysis) return;
    const serviceItems = entryMode === "manual"
      ? manualClaim.service_items
      : analysis.service_items.map((item) => ({
          id: crypto.randomUUID(),
          code: item.code,
          description: item.description,
          tooth: "",
          eye: "",
          days: 1,
          unit: "Unit",
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? 0,
          flag: "",
          status: "Pending",
          category: item.category,
        }));
    const insurerName = ((insurers ?? []) as Array<Record<string, unknown>>)
      .find((insurer) => insurer.id === manualClaim.insurance_company_id)?.company_name;
    exportDraftPdf({
      id: analysis.analysis_id,
      workflow_type: workflowType,
      patient_name: manualClaim.patient_name || analysis.patient_name,
      claim_number: manualClaim.claim_number || analysis.claim_number,
      date_of_service: manualClaim.date_of_service || analysis.date_of_service,
      insurance_company_id: manualClaim.insurance_company_id,
      insurer_name: insurerName,
      rejection_reason: manualClaim.rejection_reason || analysis.rejection_reason,
      clinical_notes: manualClaim.clinical_notes,
      authorization_code: manualClaim.authorization_code,
      co_payment: manualClaim.co_payment,
      comments: manualClaim.comments,
      diagnoses: selectedCodes,
      service_items: serviceItems,
      response_message: responseText,
      total_amount: calculateClaimTotal(serviceItems),
    });
  };

  const prepareClaimUpdate = async () => {
    if (!analysis) return;
    if (!canWrite) {
      toast({ title: "Claims write permission required", description: "You can review analysis, but only claims write users may save a draft.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const serviceItems = entryMode === "manual"
        ? manualClaim.service_items
        : analysis.service_items.map((item) => ({
            id: crypto.randomUUID(),
            code: item.code,
            description: item.description,
            tooth: "",
            eye: "",
            days: 1,
            unit: "Unit",
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? 0,
            flag: "",
            status: "Pending",
            category: item.category,
          }));
      const draftInput: ManualClaimInput = {
        ...manualClaim,
        patient_name: manualClaim.patient_name || analysis.patient_name || "",
        claim_number: manualClaim.claim_number || analysis.claim_number || "",
        date_of_service: manualClaim.date_of_service || analysis.date_of_service || "",
        rejection_reason: workflowType === "rejected_claim" ? manualClaim.rejection_reason || analysis.rejection_reason || "" : "",
        service_items: serviceItems,
      };
      const draftId = await saveClaimDiagnosisDraft(draftInput, { ...analysis, response_message: responseText }, selectedCodes);
      await recordEvent("claim_update_prepared", { draft_id: draftId, selected_codes: selectedCodes.map((item) => item.code) });
      await queryClient.invalidateQueries({ queryKey: ["claim_diagnosis_drafts"] });
      toast({ title: "Claim update draft prepared", description: `Draft ${draftId} is saved for manual review. No claim was submitted.` });
    } catch (error) {
      toast({
        title: "Could not prepare claim update",
        description: error instanceof Error ? error.message : "The draft could not be saved.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const fileMode = entryMode === "upload";

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="page-header flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">Claim Diagnosis Assistant</h1>
          <p className="page-description">
            Analyze a claim document or enter its service items manually. Recommendations are advisory and require review before use.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-muted p-1" aria-label="Claim workflow">
          {(["new_claim", "rejected_claim"] as ClaimWorkflowType[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (option === "rejected_claim" && !canUseRejected) {
                  toast({ title: "Permission required", description: "Rejected-claim analysis requires claims write or payments write permission.", variant: "destructive" });
                  return;
                }
                setWorkflowType(option);
                clearAnalysis();
              }}
              aria-pressed={workflowType === option}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${workflowType === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {option === "new_claim" ? "New Claim" : "Rejected Claim"}
            </button>
          ))}
        </div>
      </div>

      <Card className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2 border-b pb-4">
          <Button type="button" variant={fileMode ? "default" : "outline"} onClick={() => { setEntryMode("upload"); clearAnalysis(); }}>
            <UploadCloud className="mr-2 h-4 w-4" /> Upload document
          </Button>
          <Button type="button" variant={!fileMode ? "default" : "outline"} onClick={() => { setEntryMode("manual"); clearAnalysis(); }}>
            <FileText className="mr-2 h-4 w-4" /> Enter manually
          </Button>
        </div>

        {fileMode ? (
          <div className="space-y-4">
            {workflowType === "rejected_claim" && (
              <label className="block max-w-sm space-y-1 text-sm"><span>Rejection reason</span><select value={manualClaim.rejection_reason || REJECTION_REASONS[0]} onChange={(event) => updateManualClaim("rejection_reason", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3">{REJECTION_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            )}
            <div
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-2xl border border-dashed p-6 text-center transition ${isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
            >
            {uploadedFile ? (
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-background shadow-sm"><FileText className="h-8 w-8 text-primary" /></div>
                <div><p className="font-medium">{uploadedFile.name}</p><p className="mt-1 text-sm text-muted-foreground">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p></div>
                <div className="flex justify-center gap-2">
                  <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>Change file</Button>
                  <Button type="button" variant="ghost" onClick={() => { setUploadedFile(null); clearAnalysis(); }}><X className="mr-2 h-4 w-4" /> Remove</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-background shadow-sm"><UploadCloud className="h-8 w-8 text-primary" /></div>
                <div><h2 className="text-lg font-semibold">Upload a claim document</h2><p className="mt-1 text-sm text-muted-foreground">PDF, JPG, PNG, WEBP, EDI or text files up to 8 MB.</p></div>
                <Button type="button" onClick={() => inputRef.current?.click()}>Browse Files</Button>
              </div>
            )}
            <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.edi,.837,.txt" className="hidden" onChange={handleBrowse} />
          </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-sm"><span>Patient name</span><Input value={manualClaim.patient_name} onChange={(event) => updateManualClaim("patient_name", event.target.value)} placeholder="Patient name" /></label>
              <label className="space-y-1 text-sm"><span>Claim number</span><Input value={manualClaim.claim_number} onChange={(event) => updateManualClaim("claim_number", event.target.value)} placeholder="Claim reference" /></label>
              <label className="space-y-1 text-sm"><span>Date of service</span><Input type="date" value={manualClaim.date_of_service} onChange={(event) => updateManualClaim("date_of_service", event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span>Insurance company</span>
                <select value={manualClaim.insurance_company_id} onChange={(event) => updateManualClaim("insurance_company_id", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select insurer (optional)</option>
                  {((insurers ?? []) as Array<Record<string, unknown>>).map((insurer) => <option key={String(insurer.id)} value={String(insurer.id)}>{String(insurer.company_name)}</option>)}
                </select>
              </label>
              {workflowType === "rejected_claim" && (
                <label className="space-y-1 text-sm"><span>Rejection reason</span>
                  <select value={manualClaim.rejection_reason || REJECTION_REASONS[0]} onChange={(event) => updateManualClaim("rejection_reason", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {REJECTION_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                  </select>
                </label>
              )}
              <label className="space-y-1 text-sm"><span>Co-payment</span><Input type="number" min="0" step="0.01" value={manualClaim.co_payment || ""} onChange={(event) => updateManualClaim("co_payment", asNumber(event.target.value))} placeholder="0.00" /></label>
              <label className="space-y-1 text-sm"><span>Authorization code</span><Input value={manualClaim.authorization_code} onChange={(event) => updateManualClaim("authorization_code", event.target.value)} placeholder="Optional" /></label>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)]">
              <Card className="space-y-4 p-4">
                <div>
                  <h2 className="font-semibold">Search service items</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Add an item from the existing service catalog or enter one manually.</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search code or service name" className="pl-9" />
                </div>
                <div className="flex gap-4 text-sm">
                  {(["begins", "contains"] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-2">
                      <input type="radio" name="catalog-match-mode" checked={searchMode === mode} onChange={() => setSearchMode(mode)} />
                      {mode === "begins" ? "Begins with" : "Contains"}
                    </label>
                  ))}
                </div>
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <table className="w-full min-w-[400px] text-left text-sm">
                    <thead className="sticky top-0 bg-amber-100 text-xs text-foreground"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Item name</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
                    <tbody>
                      {filteredCatalog.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{item.code || "—"}</td>
                          <td className="px-3 py-2"><span className="font-medium">{item.name}</span><span className="block text-xs text-muted-foreground">{item.category}</span></td>
                          <td className="px-3 py-2 text-right"><Button type="button" size="icon" variant="ghost" aria-label={`Add ${item.name}`} onClick={() => addCatalogItem(item)}><PlusCircle className="h-4 w-4" /></Button></td>
                        </tr>
                      ))}
                      {!filteredCatalog.length && <tr><td colSpan={3} className="px-3 py-5 text-center text-muted-foreground">No items found. Add a custom item below.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-2 border-t pt-4 sm:grid-cols-2">
                  <Input value={customItem.code} onChange={(event) => setCustomItem({ ...customItem, code: event.target.value })} placeholder="Code (optional)" />
                  <Input value={customItem.description} onChange={(event) => setCustomItem({ ...customItem, description: event.target.value })} placeholder="Item description" />
                  <Input type="number" min="0" step="0.01" value={customItem.unitPrice} onChange={(event) => setCustomItem({ ...customItem, unitPrice: event.target.value })} placeholder="Unit price" />
                  <Button type="button" variant="outline" onClick={addCustomItem}><PlusCircle className="mr-2 h-4 w-4" /> Add custom item</Button>
                </div>
              </Card>

              <Card className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="font-semibold">Claim items</h2><p className="text-sm text-muted-foreground">{manualClaim.claim_number || "Claim reference not provided"}</p></div>
                  <div className="text-right"><p className="text-xs uppercase text-muted-foreground">Total</p><p className="text-xl font-semibold">GH¢ {total.toFixed(2)}</p></div>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-muted/50 text-xs"><tr>
                      <th className="px-2 py-2">Item</th><th className="px-2 py-2">Tooth</th><th className="px-2 py-2">Eye</th><th className="px-2 py-2">Days</th><th className="px-2 py-2">Sell unit</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2">Unit price</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2">Flag</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Action</th>
                    </tr></thead>
                    <tbody>
                      {manualClaim.service_items.map((item) => (
                        <tr key={item.id} className="border-t align-middle">
                          <td className="px-2 py-2"><span className="font-medium">{item.description}</span><span className="block font-mono text-xs text-muted-foreground">{item.code || item.category}</span></td>
                          <td className="px-1 py-2"><Input aria-label="Tooth" className="h-9 w-16" value={item.tooth} onChange={(event) => updateLine(item.id, { tooth: event.target.value })} /></td>
                          <td className="px-1 py-2"><Input aria-label="Eye" className="h-9 w-16" value={item.eye} onChange={(event) => updateLine(item.id, { eye: event.target.value })} /></td>
                          <td className="px-1 py-2"><Input aria-label="Days" type="number" min="1" className="h-9 w-16" value={item.days} onChange={(event) => updateLine(item.id, { days: Math.max(1, Math.floor(asNumber(event.target.value, 1))) })} /></td>
                          <td className="px-1 py-2"><Input aria-label="Sell unit" className="h-9 w-20" value={item.unit} onChange={(event) => updateLine(item.id, { unit: event.target.value })} /></td>
                          <td className="px-1 py-2"><Input aria-label="Quantity" type="number" min="0.01" step="0.01" className="h-9 w-20" value={item.quantity} onChange={(event) => updateLine(item.id, { quantity: asNumber(event.target.value, 1) })} /></td>
                          <td className="px-1 py-2"><Input aria-label="Unit price" type="number" min="0" step="0.01" className="h-9 w-24" value={item.unitPrice} onChange={(event) => updateLine(item.id, { unitPrice: asNumber(event.target.value) })} /></td>
                          <td className="px-2 py-2 text-right font-semibold">{(item.quantity * item.unitPrice).toFixed(2)}</td>
                          <td className="px-2 py-2"><Input aria-label="Flag" className="h-9 w-20" value={item.flag} onChange={(event) => updateLine(item.id, { flag: event.target.value })} /></td>
                          <td className="px-2 py-2">{item.status}</td>
                          <td className="px-2 py-2"><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${item.description}`} onClick={() => updateManualClaim("service_items", manualClaim.service_items.filter((line) => line.id !== item.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                        </tr>
                      ))}
                      {!manualClaim.service_items.length && <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No service items added yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Existing diagnoses</p>
                    <div className="flex gap-2">
                      <Input value={manualDiagnosisSearch} onChange={(event) => { setManualDiagnosisSearch(event.target.value); setDiagnosisInput({ code: "", description: "" }); setSelectedManualDiagnosis(null); }} placeholder="Search diagnosis code or description" />
                      <Button type="button" variant="outline" onClick={addManualDiagnosis} disabled={!selectedManualDiagnosis}>Add code</Button>
                    </div>
                    {!diagnosisRows?.length && <p className="text-xs text-amber-700">The project diagnosis master has no entries available. Add or import diagnosis codes in Master Data before selecting a diagnosis.</p>}
                    {manualDiagnosisSearch && filteredManualDiagnoses.length > 0 && (
                      <div className="max-h-32 overflow-auto rounded-md border">
                        {filteredManualDiagnoses.map((entry) => <button key={String(entry.id)} type="button" className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted ${selectedManualDiagnosis?.id === entry.id ? "bg-muted" : ""}`} onClick={() => { setSelectedManualDiagnosis(entry); setDiagnosisInput({ code: String(entry.code), description: String(entry.description) }); }}><span className="font-mono font-semibold">{String(entry.code)}</span> — {String(entry.description)}</button>)}
                      </div>
                    )}
                    {manualDiagnosisSearch && diagnosisRows?.length > 0 && !filteredManualDiagnoses.length && <p className="text-xs text-muted-foreground">No matching diagnosis code exists in the project diagnosis master.</p>}
                    {selectedManualDiagnosis && <p className="text-xs text-muted-foreground">Selected: <span className="font-mono">{diagnosisInput.code}</span> — {diagnosisInput.description}</p>}
                    <div className="flex flex-wrap gap-2">{manualClaim.original_diagnoses.map((item) => <Badge key={item.code} variant="secondary">{item.code} · {item.description}<button type="button" aria-label={`Remove ${item.code}`} className="ml-1" onClick={() => updateManualClaim("original_diagnoses", manualClaim.original_diagnoses.filter((entry) => entry.code !== item.code))}>×</button></Badge>)}</div>
                  </div>
                  <label className="space-y-2 text-sm"><span>Clinical notes</span><Textarea value={manualClaim.clinical_notes} onChange={(event) => updateManualClaim("clinical_notes", event.target.value)} placeholder="Enter documented findings or relevant chart notes. Avoid adding unsupported conclusions." className="min-h-24" /></label>
                </div>
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Claim comments</p>
                  <div className="flex gap-2"><Input value={commentInput} onChange={(event) => setCommentInput(event.target.value)} placeholder="Add a claim comment" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addComment(); } }} /><Button type="button" variant="outline" onClick={addComment}>Add Comment</Button></div>
                  {manualClaim.comments.map((comment, index) => <p key={`${index}-${comment}`} className="rounded border bg-muted/20 px-3 py-2 text-sm">{comment}</p>)}
                </div>
              </Card>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {workflowType === "rejected_claim" ? "Rejected-claim analysis is restricted to claims-write or payments-write roles." : "Nothing is submitted to a payer from this assistant."}
          </p>
          <Button type="button" onClick={runAnalysis} disabled={isAnalyzing || (entryMode === "upload" && !uploadedFile)} className="gap-2">
            <Sparkles className={`h-4 w-4 ${isAnalyzing ? "animate-pulse" : ""}`} />{isAnalyzing ? "Analyzing claim..." : "Analyze Claim"}
          </Button>
        </div>
      </Card>

      {savedDrafts && savedDrafts.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Prepared Claim Updates</h2><p className="text-sm text-muted-foreground">Saved drafts are not submitted claims.</p></div><Badge variant="outline">{savedDrafts.length}</Badge></div>
          <div className="overflow-auto rounded-lg border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Claim reference</th><th className="px-3 py-2">Workflow</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Export</th></tr></thead><tbody>
            {(savedDrafts as Array<Record<string, unknown>>).map((draft) => <tr key={String(draft.id)} className="border-t"><td className="px-3 py-2">{String(draft.patient_name || "—")}</td><td className="px-3 py-2 font-mono text-xs">{String(draft.claim_number || "—")}</td><td className="px-3 py-2">{draft.workflow_type === "rejected_claim" ? "Rejected claim" : "New claim"}</td><td className="px-3 py-2">GH¢ {Number(draft.total_amount || 0).toFixed(2)}</td><td className="px-3 py-2">{draft.updated_at ? new Date(String(draft.updated_at)).toLocaleString() : "—"}</td><td className="px-3 py-2"><Badge variant="secondary">Draft</Badge></td><td className="px-3 py-2"><Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => exportSavedDraftPdf(draft)}><Download className="h-4 w-4" />PDF</Button></td></tr>)}
          </tbody></table></div>
        </Card>
      )}

      {analysis && (
        <div className={`grid gap-5 ${workflowType === "rejected_claim" ? "xl:grid-cols-[1fr_1.2fr_1fr]" : "xl:grid-cols-[1fr_1.2fr]"}`}>
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Document Extracts</h2><Badge variant="secondary">{analysis.extracted_confidence}% extraction confidence</Badge></div>
            {analysis.fallback_warning && <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{analysis.fallback_warning}</span></div>}
            {analysis.warnings.map((warning, index) => <p key={index} className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{warning}</p>)}
            <section className="space-y-2"><h3 className="text-sm font-medium text-muted-foreground">Original Diagnoses</h3>
              {analysis.original_diagnoses.map((diagnosis, index) => <div key={`${diagnosis.code}-${index}`} className="rounded-lg border bg-muted/20 p-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold">{diagnosis.code}</span>{diagnosis.page && <Badge variant="outline">Pg {diagnosis.page}</Badge>}</div><p className="mt-1 text-muted-foreground">{diagnosis.description}</p><p className="mt-2 text-xs text-muted-foreground">{diagnosis.position}{diagnosis.line ? ` · line ${diagnosis.line}` : ""}</p></div>)}
              {!analysis.original_diagnoses.length && <p className="text-sm text-muted-foreground">No existing diagnosis codes were found.</p>}
            </section>
            <section className="space-y-2"><h3 className="text-sm font-medium text-muted-foreground">Service Items</h3>
              <div className="overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Qty</th></tr></thead><tbody>
                {analysis.service_items.map((item, index) => <tr key={`${item.code}-${index}`} className="border-t"><td className="px-3 py-2 font-mono">{item.code}</td><td className="px-3 py-2">{item.description}</td><td className="px-3 py-2">{item.quantity}</td></tr>)}
                {!analysis.service_items.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No service items extracted.</td></tr>}
              </tbody></table></div>
            </section>
            <section><h3 className="mb-2 text-sm font-medium text-muted-foreground">Coding checks</h3>{analysis.compliance_flags.map((flag, index) => <p key={index} className="mb-2 flex gap-2 rounded border bg-muted/20 p-2 text-xs"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{flag}</p>)}</section>
          </Card>

          <Card className="space-y-4 bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Recommended Diagnoses</h2><p className="text-xs text-muted-foreground">Confidence is an AI review-priority score, not a medical probability.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search ICD-10 code or description" className="pl-9" /></div></div>
            {searchText && <div className="rounded-xl border bg-background p-2"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project diagnosis master</p><div className="max-h-56 space-y-2 overflow-auto">
              {filteredDiagnoses.map((entry) => <div key={String(entry.id)} className="flex items-center justify-between gap-3 rounded-md border p-2"><div><p className="font-mono text-sm font-semibold">{String(entry.code)}</p><p className="text-xs text-muted-foreground">{String(entry.description)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => addManualCode(entry)}>Add to Selection</Button></div>)}
              {!filteredDiagnoses.length && <p className="text-sm text-muted-foreground">No codes found in the project diagnosis master.</p>}
            </div></div>}
            <div className="space-y-3">
              {analysis.recommended_diagnoses.map((recommendation) => <div key={recommendation.code} className="rounded-xl border bg-background p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-mono text-base font-semibold">{recommendation.code}</span><Badge variant="secondary">{recommendation.version}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{recommendation.description}</p></div><Badge className={`${getConfidenceTone(recommendation.confidence)} border-0 text-white`}>{recommendation.confidence}%</Badge></div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${getConfidenceTone(recommendation.confidence)}`} style={{ width: `${recommendation.confidence}%` }} /></div>
                <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Evidence:</span> {recommendation.justification}</p>
                <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">"{recommendation.sourceText}"</blockquote>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2"><Button type="button" size="sm" onClick={() => acceptRecommendation(recommendation)} className="gap-1"><Check className="h-4 w-4" /> Accept</Button><Button type="button" size="sm" variant="outline" onClick={() => setSearchText(recommendation.description.split(/\s+/).slice(0, 2).join(" "))} className="gap-1"><ArrowLeftRight className="h-4 w-4" /> Alternate</Button></div>
                  <div className="flex gap-2"><button type="button" aria-label={`Helpful for ${recommendation.code}`} onClick={() => setRecommendationFeedback(recommendation.code, "up")} className={`rounded-md border p-2 ${helpful[recommendation.code] === "up" ? "bg-emerald-500/10 text-emerald-700" : "bg-background"}`}><ThumbsUp className="h-4 w-4" /></button><button type="button" aria-label={`Not helpful for ${recommendation.code}`} onClick={() => setRecommendationFeedback(recommendation.code, "down")} className={`rounded-md border p-2 ${helpful[recommendation.code] === "down" ? "bg-rose-500/10 text-rose-700" : "bg-background"}`}><ThumbsDown className="h-4 w-4" /></button></div>
                </div>
              </div>)}
              {!analysis.recommended_diagnoses.length && <p className="rounded-lg border bg-background p-5 text-sm text-muted-foreground">No recommendations were returned. Review the extracted information, add relevant documentation, or choose a code manually from the diagnosis master.</p>}
            </div>
            <div className="rounded-xl border bg-background p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Selected for Claim</h3><Badge variant="outline">{selectedCodes.length}</Badge></div>
              <div className="space-y-2">{selectedCodes.map((code) => <div key={code.code} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-2 text-sm"><div><div className="flex items-center gap-2"><span className="font-mono font-semibold">{code.code}</span><Badge variant={code.source === "manual" ? "secondary" : "outline"}>{code.source === "manual" ? "Manual Override" : "AI Recommended"}</Badge></div><p className="mt-1 text-muted-foreground">{code.description}</p></div><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${code.code}`} onClick={() => removeSelectedCode(code.code)}><X className="h-4 w-4" /></Button></div>)}{!selectedCodes.length && <p className="text-sm text-muted-foreground">Accept recommendations or add a code manually.</p>}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={exportCurrentDraftPdf}><Download className="mr-2 h-4 w-4" />Export Draft PDF</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button><Button type="button" disabled={!canWrite || isSaving} onClick={prepareClaimUpdate}>{isSaving ? "Saving draft..." : "Prepare Claim Update"}</Button></div>
            {!canWrite && <p className="text-right text-xs text-muted-foreground">Claims write permission is required to save a review draft.</p>}
          </Card>

          {workflowType === "rejected_claim" && <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Claim Response</h2><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={exportCurrentDraftPdf}><Download className="mr-2 h-4 w-4" />PDF</Button><Button type="button" variant="outline" size="sm" onClick={() => setResponseEditable((editable) => !editable)}>{responseEditable ? "Read-only" : "Edit"}</Button><Button type="button" variant="outline" size="sm" onClick={copyResponse}><Clipboard className="mr-2 h-4 w-4" /> Copy</Button></div></div>
            <label className="block space-y-2 text-sm"><span>Rejection reason</span><select value={manualClaim.rejection_reason || analysis.rejection_reason || REJECTION_REASONS[0]} onChange={(event) => { updateManualClaim("rejection_reason", event.target.value); setResponseText(createClaimResponseDraft(analysis, event.target.value)); setResponseEditable(false); }} className="h-10 w-full rounded-md border border-input bg-background px-3">{REJECTION_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            <label className="block space-y-2 text-sm"><span>Generated response note</span><Textarea value={responseText} readOnly={!responseEditable} onChange={(event) => setResponseText(event.target.value)} className="min-h-[320px] resize-y" /></label>
            <p className="text-xs text-muted-foreground">Draft only. Verify clinical documentation and payer requirements before sending.</p>
          </Card>}
        </div>
      )}
    </div>
  );
}
