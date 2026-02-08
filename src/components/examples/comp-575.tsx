"use client";

import {
  createOnDropHandler,
  dragAndDropFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import {
  RiBracesLine,
  RiCodeSSlashLine,
  RiFileLine,
  RiFileTextLine,
  RiImageLine,
  RiReactjsLine,
} from "@remixicon/react";
import { useState } from "react";

import { Tree, TreeItem, TreeItemLabel } from "@/components/ui/tree";

interface Item {
  name: string;
  children?: string[];
  fileExtension?: string;
}

const initialItems: Record<string, Item> = {
  app: {
    children: ["app/layout.tsx", "app/page.tsx", "app/(dashboard)", "app/api"],
    name: "app",
  },
  "app/(dashboard)": {
    children: ["app/(dashboard)/dashboard"],
    name: "(dashboard)",
  },
  "app/(dashboard)/dashboard": {
    children: ["app/(dashboard)/dashboard/page.tsx"],
    name: "dashboard",
  },
  "app/(dashboard)/dashboard/page.tsx": {
    fileExtension: "tsx",
    name: "page.tsx",
  },
  "app/api": { children: ["app/api/hello"], name: "api" },
  "app/api/hello": { children: ["app/api/hello/route.ts"], name: "hello" },
  "app/api/hello/route.ts": { fileExtension: "ts", name: "route.ts" },
  "app/layout.tsx": { fileExtension: "tsx", name: "layout.tsx" },
  "app/page.tsx": { fileExtension: "tsx", name: "page.tsx" },
  components: {
    children: ["components/button.tsx", "components/card.tsx"],
    name: "components",
  },
  "components/button.tsx": { fileExtension: "tsx", name: "button.tsx" },
  "components/card.tsx": { fileExtension: "tsx", name: "card.tsx" },
  lib: { children: ["lib/utils.ts"], name: "lib" },
  "lib/utils.ts": { fileExtension: "ts", name: "utils.ts" },
  "next.config.mjs": { fileExtension: "mjs", name: "next.config.mjs" },
  "package.json": { fileExtension: "json", name: "package.json" },
  public: {
    children: ["public/favicon.ico", "public/vercel.svg"],
    name: "public",
  },
  "public/favicon.ico": { fileExtension: "ico", name: "favicon.ico" },
  "public/vercel.svg": { fileExtension: "svg", name: "vercel.svg" },
  "README.md": { fileExtension: "md", name: "README.md" },
  root: {
    children: [
      "app",
      "components",
      "lib",
      "public",
      "package.json",
      "tailwind.config.ts",
      "tsconfig.json",
      "next.config.mjs",
      "README.md",
    ],
    name: "Project Root",
  },
  "tailwind.config.ts": { fileExtension: "ts", name: "tailwind.config.ts" },
  "tsconfig.json": { fileExtension: "json", name: "tsconfig.json" },
};

// Helper function to get icon based on file extension
function getFileIcon(extension: string | undefined, className: string) {
  switch (extension) {
    case "tsx":
    case "jsx":
      return <RiReactjsLine className={className} />;
    case "ts":
    case "js":
    case "mjs":
      return <RiCodeSSlashLine className={className} />;
    case "json":
      return <RiBracesLine className={className} />;
    case "svg":
    case "ico":
    case "png":
    case "jpg":
      return <RiImageLine className={className} />;
    case "md":
      return <RiFileTextLine className={className} />;
    default:
      return <RiFileLine className={className} />;
  }
}

const indent = 20;

export default function Component() {
  const [items, setItems] = useState(initialItems);

  const tree = useTree<Item>({
    canReorder: false,
    dataLoader: {
      getChildren: (itemId) => items[itemId]?.children ?? [],
      getItem: (itemId) => items[itemId],
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
    ],
    getItemName: (item) => item.getItemData()?.name ?? "Unknown",
    indent,
    initialState: {
      expandedItems: ["app", "app/(dashboard)", "app/(dashboard)/dashboard"],
      selectedItems: ["components"],
    },
    isItemFolder: (item) => (item.getItemData()?.children?.length ?? 0) > 0,
    onDrop: createOnDropHandler((parentItem, newChildrenIds) => {
      setItems((prevItems) => {
        // Sort the children alphabetically
        const sortedChildren = [...newChildrenIds].sort((a, b) => {
          const itemA = prevItems[a];
          const itemB = prevItems[b];

          // First sort folders before files
          const isAFolder = (itemA?.children?.length ?? 0) > 0;
          const isBFolder = (itemB?.children?.length ?? 0) > 0;

          if (isAFolder && !isBFolder) return -1;
          if (!isAFolder && isBFolder) return 1;

          // Then sort alphabetically by name
          return (itemA?.name ?? "").localeCompare(itemB?.name ?? "");
        });

        return {
          ...prevItems,
          [parentItem.getId()]: {
            ...prevItems[parentItem.getId()],
            children: sortedChildren,
          },
        };
      });
    }),
    rootItemId: "root",
  });

  return (
    <div className="flex h-full flex-col gap-2 *:first:grow">
      <div>
        <Tree
          className="before:-ms-1 relative before:absolute before:inset-0 before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)))]"
          indent={indent}
          tree={tree}
        >
          <AssistiveTreeDescription tree={tree} />
          {tree.getItems().map((item) => {
            return (
              <TreeItem className="pb-0!" item={item} key={item.getId()}>
                <TreeItemLabel className="rounded-none py-1">
                  <span className="flex items-center gap-2">
                    {!item.isFolder() &&
                      getFileIcon(
                        item.getItemData()?.fileExtension,
                        "text-muted-foreground pointer-events-none size-4"
                      )}
                    {item.getItemName()}
                  </span>
                </TreeItemLabel>
              </TreeItem>
            );
          })}
        </Tree>
      </div>

      <p
        aria-live="polite"
        className="mt-2 text-muted-foreground text-xs"
        role="region"
      >
        File editor with drag and drop ∙{" "}
        <a
          className="underline hover:text-foreground"
          href="https://headless-tree.lukasbach.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          API
        </a>
      </p>
    </div>
  );
}
