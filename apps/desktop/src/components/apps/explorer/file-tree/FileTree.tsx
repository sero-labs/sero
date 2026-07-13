import { AssistiveTreeDescription } from '@headless-tree/react';
import { Tree, TreeDragLine, TreeItem, TreeItemLabel } from '@sero-ai/ui/components/ui/tree';
import { Input } from '@sero-ai/ui/components/ui/input';
import { cn } from '@sero-ai/ui/lib/utils';
import { FileIcon } from './file-icons';
import { FileTreeContextMenu } from './file-tree-context-menu';
import { useFileTreeModel, type FileTreeModelOptions } from './useFileTreeModel';

export interface FileTreeProps extends FileTreeModelOptions {}

export function FileTree(props: FileTreeProps) {
  const { workspaceId, rootId, onDeleted } = props;
  const { indent, loadDirectory, tree } = useFileTreeModel(props);

  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden" data-testid="file-tree">
      <Tree indent={indent} tree={tree} className="py-1">
        <AssistiveTreeDescription tree={tree} />
        {tree.getItems().map((item) => (
          <FileTreeContextMenu
            key={item.getId()}
            itemPath={item.getId()}
            isFolder={item.isFolder()}
            isRoot={item.getId() === rootId}
            workspaceId={workspaceId}
            onStartRename={() => item.startRenaming()}
            onDeleted={onDeleted}
            onReloadDir={loadDirectory}
          >
            <TreeItem
              item={item}
              data-testid={`file-tree-item-${item.getItemData()?.name ?? 'unknown'}`}
              className="hover:bg-white/[0.06] data-[selected=true]:bg-white/[0.10]"
            >
              <TreeItemLabel className="!px-1.5 !py-[3px]">
                <span className="flex min-w-0 items-center gap-1.5 text-base">
                  {!item.isFolder() && (
                    <FileIcon
                      extension={item.getItemData()?.fileExtension}
                      fileName={item.getItemData()?.name ?? ''}
                      className="text-muted-foreground/70 pointer-events-none size-4 shrink-0"
                    />
                  )}
                  {item.isRenaming() ? (
                    <Input
                      {...item.getRenameInputProps()}
                      autoFocus
                      className="-my-0.5 h-5 px-1 text-base"
                    />
                  ) : (
                    <span
                      className={cn(
                        'truncate',
                        item.isFolder()
                          ? 'text-[var(--text-primary)] font-medium'
                          : 'text-[var(--text-primary)]',
                      )}
                    >
                      {item.getItemName()}
                    </span>
                  )}
                </span>
              </TreeItemLabel>
            </TreeItem>
          </FileTreeContextMenu>
        ))}
        <TreeDragLine />
      </Tree>
    </div>
  );
}
