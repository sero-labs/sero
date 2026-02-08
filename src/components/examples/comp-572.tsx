"use client";

import {
  expandAllFeature,
  hotkeysCoreFeature,
  searchFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type TreeState,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  CircleXIcon,
  FilterIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Tree, TreeItem, TreeItemLabel } from "@/components/ui/tree";

interface Item {
  name: string;
  children?: string[];
}

const items: Record<string, Item> = {
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
  // Store the initial expanded items to reset when search is cleared
  const initialExpandedItems = ["engineering", "frontend", "design-system"];
  const [state, setState] = useState<Partial<TreeState<Item>>>({});
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tree = useTree<Item>({
    dataLoader: {
      getChildren: (itemId) => items[itemId].children ?? [],
      getItem: (itemId) => items[itemId],
    },
    features: [
      syncDataLoaderFeature,
      hotkeysCoreFeature,
      selectionFeature,
      searchFeature,
      expandAllFeature,
    ],
    getItemName: (item) => item.getItemData().name,
    indent,
    initialState: {
      expandedItems: initialExpandedItems,
    },
    isItemFolder: (item) => (item.getItemData()?.children?.length ?? 0) > 0,
    rootItemId: "company",
    setState,
    state,
  });

  // Handle clearing the search
  const handleClearSearch = () => {
    setSearchValue("");

    // Manually trigger the tree's search onChange with an empty value
    // to ensure item.isMatchingSearch() is correctly updated.
    const searchProps = tree.getSearchInputElementProps();
    if (searchProps.onChange) {
      const syntheticEvent = {
        target: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>; // Cast to the expected event type
      searchProps.onChange(syntheticEvent);
    }

    // Reset tree state to initial expanded items
    setState((prevState) => ({
      ...prevState,
      expandedItems: initialExpandedItems,
    }));

    // Clear custom filtered items
    setFilteredItems([]);

    if (inputRef.current) {
      inputRef.current.focus();
      // Also clear the internal search input
      inputRef.current.value = "";
    }
  };

  // Keep track of filtered items separately from the tree's internal search state
  const [filteredItems, setFilteredItems] = useState<string[]>([]);

  // This function determines if an item should be visible based on our custom filtering
  const shouldShowItem = (itemId: string) => {
    if (!searchValue || searchValue.length === 0) return true;
    return filteredItems.includes(itemId);
  };

  // Update filtered items when search value changes
  useEffect(() => {
    if (!searchValue || searchValue.length === 0) {
      setFilteredItems([]);
      return;
    }

    // Get all items
    const allItems = tree.getItems();

    // First, find direct matches
    const directMatches = allItems
      .filter((item) => {
        const name = item.getItemName().toLowerCase();
        return name.includes(searchValue.toLowerCase());
      })
      .map((item) => item.getId());

    // Then, find all parent IDs of matching items
    const parentIds = new Set<string>();
    for (const matchId of directMatches) {
      let item = tree.getItems().find((i) => i.getId() === matchId);

      while (item?.getParent?.()) {
        const parent = item.getParent();
        if (parent) {
          parentIds.add(parent.getId());
          item = parent;
        } else {
          break;
        }
      }
    }

    // Find all children of matching items
    const childrenIds = new Set<string>();
    for (const matchId of directMatches) {
      const item = tree.getItems().find((i) => i.getId() === matchId);

      if (item?.isFolder()) {
        const getDescendants = (itemId: string) => {
          const children = items[itemId]?.children || [];

          for (const childId of children) {
            childrenIds.add(childId);

            if (items[childId]?.children?.length) {
              getDescendants(childId);
            }
          }
        };

        getDescendants(item.getId());
      }
    }

    // Combine direct matches, parents, and children
    setFilteredItems([
      ...directMatches,
      ...Array.from(parentIds),
      ...Array.from(childrenIds),
    ]);

    // Keep all folders expanded during search to ensure all matches are visible
    // Store current expanded state first
    const currentExpandedItems = tree.getState().expandedItems || [];

    // Get all folder IDs that need to be expanded to show matches
    const folderIdsToExpand = allItems
      .filter((item) => item.isFolder())
      .map((item) => item.getId());

    // Update expanded items in the tree state
    setState((prevState) => ({
      ...prevState,
      expandedItems: [
        ...new Set([...currentExpandedItems, ...folderIdsToExpand]),
      ],
    }));
  }, [searchValue, tree]);

  return (
    <div className="flex h-full flex-col gap-2 *:nth-2:grow">
      <div className="relative">
        <Input
          className="peer ps-9"
          onBlur={(e) => {
            // Prevent default blur behavior
            e.preventDefault();

            // Re-apply the search to ensure it stays active
            if (searchValue && searchValue.length > 0) {
              const searchProps = tree.getSearchInputElementProps();
              if (searchProps.onChange) {
                const syntheticEvent = {
                  target: { value: searchValue },
                } as React.ChangeEvent<HTMLInputElement>;
                searchProps.onChange(syntheticEvent);
              }
            }
          }}
          onChange={(e) => {
            const value = e.target.value;
            setSearchValue(value);

            // Apply the search to the tree's internal state as well
            const searchProps = tree.getSearchInputElementProps();
            if (searchProps.onChange) {
              searchProps.onChange(e);
            }

            if (value.length > 0) {
              // If input has at least one character, expand all items
              tree.expandAll();
            } else {
              // If input is cleared, reset to initial expanded state
              setState((prevState) => ({
                ...prevState,
                expandedItems: initialExpandedItems,
              }));
              setFilteredItems([]);
            }
          }}
          placeholder="Filter items..."
          // Prevent the internal search from being cleared on blur
          ref={inputRef}
          type="search"
          value={searchValue}
        />
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
          <FilterIcon aria-hidden="true" className="size-4" />
        </div>
        {searchValue && (
          <button
            aria-label="Clear search"
            className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-[color,box-shadow] hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleClearSearch}
            type="button"
          >
            <CircleXIcon aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      <Tree indent={indent} tree={tree}>
        {searchValue && filteredItems.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm">
            No items found for "{searchValue}"
          </p>
        ) : (
          tree.getItems().map((item) => {
            const isVisible = shouldShowItem(item.getId());

            return (
              <TreeItem
                className="data-[visible=false]:hidden"
                data-visible={isVisible || !searchValue}
                item={item}
                key={item.getId()}
              >
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
          })
        )}
      </Tree>

      <p
        aria-live="polite"
        className="mt-2 text-muted-foreground text-xs"
        role="region"
      >
        Tree with filtering ∙{" "}
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
