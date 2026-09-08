import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface HybridReferenceOption {
  id: string;
  label: string;
  secondary?: string;
}

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: HybridReferenceOption[];
  placeholder?: string;
  required?: boolean;
}

/** Reference input supporting fast selection and controlled manual entry. */
export function HybridReferenceInput({ label, value, onChange, options, placeholder, required }: Props) {
  const listId = useId();
  return (
    <div>
      <Label htmlFor={listId}>{label}{required ? " *" : ""}</Label>
      <Input id={listId} className="mt-1" list={`${listId}-options`} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} autoComplete="off" />
      <datalist id={`${listId}-options`}>
        {options.map((option) => <option key={option.id} value={option.label}>{option.secondary || option.label}</option>)}
      </datalist>
    </div>
  );
}
