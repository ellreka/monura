import type { ReactNode } from "react";
import type { PageNavigation } from "../lib/files/pages";

interface PageNavigatorProps {
  title: string;
  navigation: PageNavigation | null;
  disabled: boolean;
  dragRegion: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onCreate: () => void;
}

interface PageButtonProps {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

function PageButton({ label, title, disabled, onClick, children }: PageButtonProps) {
  return (
    <button
      type="button"
      className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md p-0 text-muted hover:bg-white/7 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}

function ChevronGlyph({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M15 6L9 12L15 18" : "M9 6L15 12L9 18"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

export function PageNavigator({
  title,
  navigation,
  disabled,
  dragRegion,
  onPrevious,
  onNext,
  onCreate,
}: PageNavigatorProps) {
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1"
      data-tauri-drag-region={dragRegion || undefined}
    >
      <span className="pointer-events-none min-w-0 flex-1 truncate text-center text-xs font-semibold">
        {title}
      </span>
      <PageButton
        label="Previous page"
        title="Previous page (⇧⌘[)"
        disabled={disabled || navigation === null || navigation.previousIndex === null}
        onClick={onPrevious}
      >
        <ChevronGlyph direction="left" />
      </PageButton>
      <PageButton
        label="Next page"
        title="Next page (⇧⌘])"
        disabled={disabled || navigation === null || navigation.nextIndex === null}
        onClick={onNext}
      >
        <ChevronGlyph direction="right" />
      </PageButton>
      <PageButton label="New page" title="New page" disabled={disabled} onClick={onCreate}>
        <PlusGlyph />
      </PageButton>
    </div>
  );
}
