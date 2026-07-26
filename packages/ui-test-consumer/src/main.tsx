import { Button, cn } from "@sero-ai/ui";
import { createRoot } from "react-dom/client";
import "@sero-ai/ui/styles/plugin.css";

export function MinimalUiConsumer() {
  return <Button className={cn("minimal-consumer")}>Ready</Button>;
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(<MinimalUiConsumer />);
}
