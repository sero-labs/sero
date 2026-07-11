// @sero-ai/ui — Shared UI components, AI elements, and utilities
//
// Prefer importing common primitives from the barrel export:
//   import { Button, Card, Input, cn, useIsMobile } from "@sero-ai/ui"
//
// Deep subpath imports are still supported when needed. Because this package is
// native ESM, consumers should use runtime .js extensions for deep imports:
//   import { Button } from "@sero-ai/ui/components/ui/button.js"
//   import { cn } from "@sero-ai/ui/lib/utils.js"

// ── Utilities ──
export { cn } from "./lib/utils";

// ── Hooks ──
export { useIsMobile } from "./hooks/use-mobile";

// ── Theme ──
export * from "./theme";

// ── UI Components ──
export * from "./components/ui/accordion";
export * from "./components/ui/alert-dialog";
export * from "./components/ui/alert";
export * from "./components/ui/aspect-ratio";
export * from "./components/ui/avatar";
export * from "./components/ui/badge";
export * from "./components/ui/breadcrumb";
export * from "./components/ui/button-group";
export * from "./components/ui/button";
export * from "./components/ui/calendar";
export * from "./components/ui/card";
export * from "./components/ui/carousel";
export * from "./components/ui/chart";
export * from "./components/ui/checkbox";
export * from "./components/ui/collapsible";
export * from "./components/ui/combobox";
export * from "./components/ui/command";
export * from "./components/ui/context-menu";
export * from "./components/ui/dialog";
export * from "./components/ui/direction";
export * from "./components/ui/drawer";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/empty";
export * from "./components/ui/field";
export * from "./components/ui/form";
export * from "./components/ui/hover-card";
export * from "./components/ui/input-group";
export * from "./components/ui/input-otp";
export * from "./components/ui/input";
export * from "./components/ui/item";
export * from "./components/ui/kbd";
export * from "./components/ui/label";
export * from "./components/ui/menubar";
export * from "./components/ui/native-select";
export * from "./components/ui/navigation-menu";
export * from "./components/ui/pagination";
export * from "./components/ui/plugin-safety-disclaimer";
export * from "./components/ui/popover";
export * from "./components/ui/progress";
export * from "./components/ui/radio-group";
export * from "./components/ui/resizable";
export * from "./components/ui/scroll-area";
export * from "./components/ui/search-input";
export * from "./components/ui/select";
export * from "./components/ui/separator";
export * from "./components/ui/sheet";
export * from "./components/ui/sidebar";
export * from "./components/ui/skeleton";
export * from "./components/ui/slider";
export * from "./components/ui/sonner";
export * from "./components/ui/spinner";
export * from "./components/ui/switch";
export * from "./components/ui/table";
export * from "./components/ui/tabs";
export * from "./components/ui/textarea";
export * from "./components/ui/toggle-group";
export * from "./components/ui/toggle";
export * from "./components/ui/tooltip";
export * from "./components/ui/tree";
// ── AI Elements ──
export * from "./components/ai-elements/agent";
export * from "./components/ai-elements/artifact";
export * from "./components/ai-elements/attachments";
export * from "./components/ai-elements/audio-player";
export * from "./components/ai-elements/canvas";
export * from "./components/ai-elements/chain-of-thought";
export * from "./components/ai-elements/checkpoint";
export * from "./components/ai-elements/code-block";
export * from "./components/ai-elements/commit";
export * from "./components/ai-elements/confirmation";
export * from "./components/ai-elements/connection";
export * from "./components/ai-elements/context";
export * from "./components/ai-elements/controls";
export * from "./components/ai-elements/conversation";
export * from "./components/ai-elements/edge";
export * from "./components/ai-elements/environment-variables";
export * from "./components/ai-elements/file-tree";
export * from "./components/ai-elements/image";
export * from "./components/ai-elements/inline-citation";
export * from "./components/ai-elements/jsx-preview";
export * from "./components/ai-elements/message";
export * from "./components/ai-elements/mic-selector";
export * from "./components/ai-elements/model-selector";
export * from "./components/ai-elements/node";
export * from "./components/ai-elements/open-in-chat";
export * from "./components/ai-elements/package-info";
export * from "./components/ai-elements/panel";
export * from "./components/ai-elements/persona";
export * from "./components/ai-elements/plan";
export * from "./components/ai-elements/prompt-input-context";
export * from "./components/ai-elements/prompt-input-elements";
export * from "./components/ai-elements/prompt-input-textarea";
export * from "./components/ai-elements/prompt-input";
export * from "./components/ai-elements/queue";
export * from "./components/ai-elements/reasoning";
export * from "./components/ai-elements/sandbox";
export * from "./components/ai-elements/schema-display";
export * from "./components/ai-elements/shimmer";
export * from "./components/ai-elements/snippet";
export * from "./components/ai-elements/sources";
export * from "./components/ai-elements/speech-input";
export * from "./components/ai-elements/stack-trace";
export * from "./components/ai-elements/suggestion";
export * from "./components/ai-elements/task";
export * from "./components/ai-elements/terminal";
export * from "./components/ai-elements/test-results";
export * from "./components/ai-elements/tool";
export * from "./components/ai-elements/toolbar";
export * from "./components/ai-elements/transcription";
export * from "./components/ai-elements/voice-selector-accent";
export * from "./components/ai-elements/voice-selector";
export * from "./components/ai-elements/web-preview";

// ── Dashboard Components ──
// Compact presentation components for dashboard widgets and full plugin views.
// The discovery catalogue is plain data at "@sero-ai/ui/dashboard-catalog.json";
// its entry type is re-exported here for callers that type the parsed JSON.
export * from "./components/dashboard";
export type { DashboardComponentCatalogEntry } from "./components/dashboard/catalog";

// ── Model Selection Components ──
export * from "./components/model-selection/available-model-picker";
export * from "./components/model-selection/model-warning-list";
export * from "./components/model-selection/thinking-level-picker";
