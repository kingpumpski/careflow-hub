export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  /** Optional structured business context serialised into the prompt */
  context?: Record<string, unknown>;
}

export interface AIProvider {
  name: string;
  complete(request: AICompletionRequest): Promise<string>;
}