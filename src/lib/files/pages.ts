export interface PageNavigation {
  previousIndex: number | null;
  nextIndex: number | null;
}

export function getPageNavigation(total: number, activeIndex: number): PageNavigation | null {
  if (total <= 0 || activeIndex < 0 || activeIndex >= total) return null;
  return {
    previousIndex: activeIndex + 1 < total ? activeIndex + 1 : null,
    nextIndex: activeIndex > 0 ? activeIndex - 1 : null,
  };
}
