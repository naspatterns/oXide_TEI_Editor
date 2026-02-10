/**
 * Returns a debounced version of `fn` that delays invocation
 * until `delay` ms have passed since the last call.
 * The returned function also exposes a `.cancel()` method.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
