export interface FileTabInfo {
  name: string;
}

interface FileTabsProps {
  files: readonly FileTabInfo[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onCreate: () => void;
  disabled: boolean;
  showCompleted: boolean;
  onToggleShowCompleted: () => void;
}

export function FileTabs({
  files,
  activeIndex,
  onSelect,
  onCreate,
  disabled,
  showCompleted,
  onToggleShowCompleted,
}: FileTabsProps) {
  return (
    <div className="file-tabs">
      <div className="file-tabs-list">
        {files.map((file, index) => (
          <button
            key={file.name}
            type="button"
            className={"file-tab" + (index === activeIndex ? " is-active" : "")}
            onClick={() => onSelect(index)}
            disabled={disabled && index !== activeIndex}
            title={disabled && index !== activeIndex ? "計測中は他のファイルに切り替えられません" : undefined}
          >
            {file.name}
          </button>
        ))}
        <button
          type="button"
          className="file-tab-add"
          onClick={onCreate}
          disabled={disabled}
          aria-label="新規ファイル"
        >
          +
        </button>
      </div>
      <button
        type="button"
        className={"show-completed-toggle" + (showCompleted ? " is-active" : "")}
        onClick={onToggleShowCompleted}
      >
        完了タスクを表示
      </button>
    </div>
  );
}
