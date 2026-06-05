export class Signal<T = void> {
  private readonly handlers = new Set<(payload: T) => void>();

  connect(handler: (payload: T) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  once(handler: (payload: T) => void): void {
    const off = this.connect((payload) => { handler(payload); off(); });
  }

  fire(payload: T): void {
    for (const h of this.handlers) h(payload);
  }

  disconnectAll(): void {
    this.handlers.clear();
  }
}
