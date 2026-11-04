import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, ArrowLeftRight, Check, CheckCircle2, Clipboard, FileText, Search, Sparkles, ThumbsDown, ThumbsUp, UploadCloud, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeClaimDocument,
  getDemoClaimAnalysis,
  getManualCodeLookup,
  type ClaimAnalysisResult,
  type ClaimDiagnosisRecommendation,
  type ClaimWorkflowType,
  type ICDLookupEntry,
} from "@/modules/ai/services/claims-analysis";

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

function getConfidenceTone(confidence: number) {
  if (confidence >= 85) return "bg-emerald-500";
  if (confidence >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

export default function ClaimDiagnosisAssistant() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [workflowType, setWorkflowType] = useState<ClaimWorkflowType>("new_claim");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ClaimAnalysisResult | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<SelectedCode[]>([]);
  const [rejectionReason, setRejectionReason] = useState(REJECTION_REASONS[0]);
  const [searchText, setSearchText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [responseText, setResponseText] = useState("");

  const manualCodeSearch = useMemo(() => getManualCodeLookup(searchText), [searchText]);

  const handleFilePicked = (nextFile?: File) => {
    if (!nextFile) return;
    setUploadedFile(nextFile);
    setAnalysis(null);
    setSelectedCodes([]);
    setResponseText("");
  };

  const runAnalysis = () => {
    if (!uploadedFile) return;
    setIsAnalyzing(true);
    window.setTimeout(() => {
      const result = getDemoClaimAnalysis(workflowType, uploadedFile.name);
      const recommended: SelectedCode[] = result.recommended_diagnoses.map((item) => ({
        ...item,
        source: "ai",
        helpful: null,
      }));
      setAnalysis(result);
      setSelectedCodes(recommended.slice(0, 1));
      setRejectionReason(result.rejection_reason ?? REJECTION_REASONS[0]);
      setResponseText(result.response_message ?? "");
      setIsAnalyzing(false);
    }, 400);
  };

  const acceptRecommendation = (recommendation: ClaimDiagnosisRecommendation) => {
    const next = {
      ...recommendation,
      source: "ai",
      helpful: null,
    } satisfies SelectedCode;

    setSelectedCodes((existing) => {
      const found = existing.find((code) => code.code === recommendation.code);
      if (found) return existing;
      return [...existing, next];
    });
  };

  const addManualCode = (entry: ICDLookupEntry) => {
    const next: SelectedCode = {
      code: entry.code,
      version: entry.version,
      description: entry.description,
      confidence: 80,
      justification: "Manual override added from local ICD lookup.",
      sourceText: "User added from search index",
      manual: true,
      source: "manual",
      helpful: null,
    };

    setSelectedCodes((existing) => {
      const found = existing.find((code) => code.code === next.code);
      if (found) return existing;
      return [...existing, next];
    });
  };

  const toggleHelpful = (code: string, value: "up" | "down") => {
    setSelectedCodes((existing) =>
      existing.map((entry) => (entry.code === code ? { ...entry, helpful: entry.helpful === value ? null : value } : entry)),
    );
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFilePicked(event.dataTransfer.files?.[0]);
  };

  const handleBrowse = (event: ChangeEvent<HTMLInputElement>) => {
    handleFilePicked(event.target.files?.[0]);
  };

  const copyResponse = async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
    } catch {
      // fallback: browser clipboard APIs may not be available in this environment
    }
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="page-header flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">Claim Diagnosis Assistant</h1>
          <p className="page-description">
            Upload a claim document to extract diagnoses and receive ICD recommendations. For rejected claims, we will also generate a response note to support reversal.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-muted p-1">
          {(["new_claim", "rejected_claim"] as ClaimWorkflowType[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWorkflowType(option)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${workflowType === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {option === "new_claim" ? "New Claim" : "Rejected Claim"}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl border border-dashed p-6 text-center transition ${isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
        >
          {uploadedFile ? (
            <div className="space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-background shadow-sm">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-medium">{uploadedFile.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div className="flex justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                  Change file
                </Button>
                <Button type="button" variant="ghost" onClick={() => setUploadedFile(null)}>
                  <X className="mr-2 h-4 w-4" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-background shadow-sm">
                <UploadCloud className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Upload a claim document</h2>
                <p className="mt-1 text-sm text-muted-foreground">PDF, JPG, PNG, or EDI claim files supported.</p>
              </div>
              <div className="flex justify-center gap-3">
                <Button type="button" onClick={() => inputRef.current?.click()}>
                  Browse Files
                </Button>
              </div>
            </div>
          )}
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.edi,.txt" className="hidden" onChange={handleBrowse} />
        </div>

        <div className="mt-4 flex items-center justify-end">
          <Button type="button" onClick={runAnalysis} disabled={!uploadedFile || isAnalyzing} className="gap-2">
            {isAnalyzing ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Sparkles className="h-4 w-4" />}
            {isAnalyzing ? "Analyzing claim..." : "Analyze Claim"}
          </Button>
        </div>
      </Card>

      {analysis && (
        <div className="grid gap-5 xl:grid-cols-[1.05fr_1.3fr_1fr]">
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Document Extracts</h2>
              <Badge variant="secondary">{analysis.extracted_confidence}% legibility</Badge>
            </div>
            {analysis.fallback_warning && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>{analysis.fallback_warning}</span>
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Original Diagnoses</p>
                {analysis.original_diagnoses.map((diagnosis) => (
                  <div key={`${diagnosis.code}-${diagnosis.page}-${diagnosis.line}`} className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{diagnosis.code}</span>
                      <Badge variant="outline">Pg {diagnosis.page}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{diagnosis.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{diagnosis.position} • line {diagnosis.line}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Service Items</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.service_items.map((item) => (
                        <tr key={`${item.category}-${item.code}`} className="border-t">
                          <td className="px-3 py-2">{item.code}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">{item.dateOfService}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-muted/30 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recommended Diagnoses</h2>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search ICD-10/ICD-11 code or description…"
                  className="h-9 w-48"
                />
              </div>
            </div>

            {searchText && (
              <div className="mb-4 rounded-xl border bg-background p-2">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Local code index</p>
                <div className="space-y-2">
                  {manualCodeSearch.length ? (
                    manualCodeSearch.map((entry) => (
                      <div key={entry.code} className="flex items-center justify-between gap-3 rounded-md border p-2">
                        <div>
                          <p className="font-mono text-sm font-semibold">{entry.code}</p>
                          <p className="text-xs text-muted-foreground">{entry.description}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => addManualCode(entry)}>
                          Add to Selection
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No matches found for the current search.</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {analysis.recommended_diagnoses.map((recommendation) => (
                <div key={`${recommendation.code}-${recommendation.version}`} className="rounded-xl border bg-background p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-semibold">{recommendation.code}</span>
                        <Badge variant="secondary">{recommendation.version}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{recommendation.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${getConfidenceTone(recommendation.confidence)} text-white border-0`}>
                        {recommendation.confidence}%
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${getConfidenceTone(recommendation.confidence)}`} style={{ width: `${recommendation.confidence}%` }} />
                  </div>

                  <p className="mt-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Justification:</span> {recommendation.justification}
                  </p>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" onClick={() => acceptRecommendation(recommendation)} className="gap-1">
                        <Check className="h-4 w-4" /> Accept
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => acceptRecommendation(recommendation)} className="gap-1">
                        <ArrowLeftRight className="h-4 w-4" /> Alternate
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <button type="button" aria-label="Helpful" onClick={() => toggleHelpful(recommendation.code, "up")} className={`rounded-md border p-1 ${selectedCodes.find((code) => code.code === recommendation.code)?.helpful === "up" ? "bg-emerald-500/10 text-emerald-700" : "bg-background"}`}>
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Not helpful" onClick={() => toggleHelpful(recommendation.code, "down")} className={`rounded-md border p-1 ${selectedCodes.find((code) => code.code === recommendation.code)?.helpful === "down" ? "bg-rose-500/10 text-rose-700" : "bg-background"}`}>
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Selected for Claim</h3>
                <Badge variant="outline">{selectedCodes.length}</Badge>
              </div>
              <div className="space-y-2">
                {selectedCodes.length ? (
                  selectedCodes.map((code) => (
                    <div key={`${code.code}-${code.source}`} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-2 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{code.code}</span>
                          {code.manual ? <Badge variant="secondary">Manual Override</Badge> : <Badge variant="outline">AI Recommended</Badge>}
                        </div>
                        <p className="mt-1 text-muted-foreground">{code.description}</p>
                      </div>
                      {code.helpful && (
                        <CheckCircle2 className={`h-4 w-4 ${code.helpful === "up" ? "text-emerald-600" : "text-rose-600"}`} />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No codes selected yet.</p>
                )}
              </div>
            </div>
          </Card>

          {workflowType === "rejected_claim" && (
            <Card className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Claim Response</h2>
                <Button type="button" variant="outline" size="sm" onClick={copyResponse} className="gap-2">
                  <Clipboard className="h-4 w-4" /> Copy
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Rejection Reason</label>
                  <select
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {REJECTION_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Generated Response Note</label>
                  <Textarea value={responseText || ""} readOnly onChange={(event) => setResponseText(event.target.value)} className="min-h-[240px] resize-none" />
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
