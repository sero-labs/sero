import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@sero-ai/ui';
import { useRef, useState } from 'react';

/**
 * Where a character comes from.
 *
 * Three ways in, one outcome: a picture is measured, and words are drawn first
 * and then measured. Either way the next thing the user sees is the character
 * sheet, because nothing is generated until that is approved (D5).
 */

type Source = 'picture' | 'words' | 'library';

export interface NewCharacterDialogProps {
  open: boolean;
  libraryImages: { id: string; title: string }[];
  onOpenChange(open: boolean): void;
  onCreateFromFile(name: string, file: File): void;
  onCreateFromText(name: string, description: string): void;
  onCreateFromItem(name: string, itemId: string): void;
}

export function NewCharacterDialog({
  open,
  libraryImages,
  onOpenChange,
  onCreateFromFile,
  onCreateFromText,
  onCreateFromItem,
}: NewCharacterDialogProps) {
  const [source, setSource] = useState<Source>('picture');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [itemId, setItemId] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const items = libraryImages.map((image) => ({ value: image.id, label: image.title }));
  const chosenItem = items.find((item) => item.value === itemId) ?? null;
  const blocked =
    name.trim() === '' ||
    (source === 'picture' && file === null) ||
    (source === 'words' && description.trim() === '') ||
    (source === 'library' && itemId === '');

  const submit = () => {
    if (blocked) return;
    if (source === 'picture' && file !== null) onCreateFromFile(name.trim(), file);
    if (source === 'words') onCreateFromText(name.trim(), description.trim());
    if (source === 'library') onCreateFromItem(name.trim(), itemId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New character</DialogTitle>
          <DialogDescription>
            The artwork is measured before anything is generated from it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="character-name">Name</Label>
            <Input
              id="character-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Explorer"
            />
          </div>

          <Tabs
            activationMode="manual"
            value={source}
            onValueChange={(value) => setSource(value as Source)}
          >
            <TabsList variant="line" className="justify-start" aria-label="Where it comes from">
              <TabsTrigger value="picture" className="flex-none px-3">
                Picture
              </TabsTrigger>
              <TabsTrigger value="words" className="flex-none px-3">
                Words
              </TabsTrigger>
              <TabsTrigger value="library" className="flex-none px-3">
                Library
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {source === 'picture' && (
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => picker.current?.click()}>
                Choose a file
              </Button>
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                {file?.name ?? 'PNG or JPEG'}
              </span>
              <input
                ref={picker}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </div>
          )}

          {source === 'words' && (
            <div className="space-y-1.5">
              <Label htmlFor="character-description">Describe them</Label>
              <Textarea
                id="character-description"
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="An explorer in a wide brimmed hat and an olive shirt, a coiled whip in his left hand."
              />
            </div>
          )}

          {source === 'library' && (
            <div className="space-y-1.5">
              <Label htmlFor="character-item">Work from</Label>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing in the Library to work from yet.
                </p>
              ) : (
                <Combobox
                  items={items}
                  value={chosenItem}
                  onValueChange={(item) => setItemId(item?.value ?? '')}
                >
                  <ComboboxInput
                    id="character-item"
                    placeholder="Search references"
                    className="w-full"
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>No references found</ComboboxEmpty>
                    <ComboboxList>
                      {(item) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={submit} disabled={blocked}>
            Measure it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
