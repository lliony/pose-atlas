export function createRequestSession() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      return { id: ++generation, signal: controller.signal };
    },
    isCurrent(id: number) {
      return (
        id === generation && controller !== null && !controller.signal.aborted
      );
    },
    cancel() {
      controller?.abort();
      controller = null;
    },
  };
}
