/** Small insertion-ordered cache for image data URLs. */
export class BoundedImageCache {
  private readonly values = new Map<string, string>();

  constructor(private readonly limit: number) {}

  get(key: string): string | undefined {
    return this.values.get(key);
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next();
      if (oldest.done) return;
      this.values.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  get size(): number {
    return this.values.size;
  }
}
