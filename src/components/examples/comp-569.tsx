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
import { FolderIcon, FolderOpenIcon } from "lucide-react";
import { useState } from "react";

import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
} from "@/components/ui/tree";

interface Item {
  name: string;
  children?: string[];
}

const initialItems: Record<string, Item> = {
  apis: { name: "APIs" },
  backend: { children: ["apis", "infrastructure"], name: "Backend" },
  company: {
    children: ["engineering", "marketing", "operations"],
    name: "Company",
  },
  components: { name: "Components" },
  content: { name: "Content" },
  "design-system": {
    children: ["components", "tokens", "guidelines"],
    name: "Design System",
  },
  engineering: {
    children: ["frontend", "backend", "platform-team"],
    name: "Engineering",
  },
  finance: { name: "Finance" },
  frontend: { children: ["design-system", "web-platform"], name: "Frontend" },
  guidelines: { name: "Guidelines" },
  hr: { name: "HR" },
  infrastructure: { name: "Infrastructure" },
  marketing: { children: ["content", "seo"], name: "Marketing" },
  operations: { children: ["hr", "finance"], name: "Operations" },
  "platform-team": { name: "Platform Team" },
  seo: { name: "SEO" },
  tokens: { name: "Tokens" },
  "web-platform": { name: "Web Platform" },
};

const indent = 20;

export default function Component() {
  const [items, setItems] = useState(initialItems);

  const tree = useTree<Item>({
    canReorder: true,
    dataLoader: {
      getChildren: (itemId) => items[itemId].children ?? [],
      getItem: (itemId) => items[itemId],
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
    ],
    getItemName: (item) => item.getItemData().name,
    indent,
    initialState: {
      expandedItems: ["engineering", "frontend", "design-system"],
      selectedItems: ["components"],
    },
    isItemFolder: (item) => (item.getItemData()?.children?.length ?? 0) > 0,
    onDrop: createOnDropHandler((parentItem, newChildrenIds) => {
      setItems((prevItems) => ({
        ...prevItems,
        [parentItem.getId()]: {
          ...prevItems[parentItem.getId()],
          children: newChildrenIds,
        },
      }));
    }),
    rootItemId: "company",
  });

  return (
    <div className="flex h-full flex-col gap-2 *:first:grow">
      <Tree indent={indent} tree={tree}>
        <AssistiveTreeDescription tree={tree} />
        {tree.getItems().map((item) => {
          return (
            <TreeItem item={item} key={item.getId()}>
              <TreeItemLabel>
                <span className="flex items-center gap-2">
                  {item.isFolder() &&
                    (item.isExpanded() ? (
                      <FolderOpenIcon className="pointer-events-none size-4 text-muted-foreground" />
                    ) : (
                      <FolderIcon className="pointer-events-none size-4 text-muted-foreground" />
                    ))}
                  {item.getItemName()}
                </span>
              </TreeItemLabel>
            </TreeItem>
          );
        })}
        <TreeDragLine />
      </Tree>

      <p
        aria-live="polite"
        className="mt-2 text-muted-foreground text-xs"
        role="region"
      >
        Tree with multi-select and drag and drop ∙{" "}
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
