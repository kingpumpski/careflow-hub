import { useEffect } from "react";
import { startAutomaticSync } from "@/modules/offline/connectivity";

export function CareFlowRuntime() {
  useEffect(() => startAutomaticSync(), []);
  return null;
}
