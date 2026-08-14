import { EditorView } from "@codemirror/view";

const ink = "#332e26";
const muted = "#a39b8b";
const accent = "#c9752f";
const accentSoft = "#fbe9d8";
const project = "#4f8f72";

export const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#fdfbf6",
      color: ink,
      height: "100%",
      fontSize: "14px",
    },
    ".cm-content": {
      fontFamily:
        "'SF Mono', 'Menlo', 'Consolas', ui-monospace, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', sans-serif",
      caretColor: accent,
      padding: "12px 0",
    },
    ".cm-cursor": {
      borderLeftColor: accent,
      borderLeftWidth: "2px",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#c7bfae",
      border: "none",
      fontFamily: "'SF Mono', 'Menlo', 'Consolas', ui-monospace, monospace",
      fontSize: "12px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: accent,
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(201, 117, 47, 0.045)",
    },
    ".cm-line": {
      padding: "1px 20px",
      lineHeight: "1.9",
    },
    ".cm-task-checkbox": {
      display: "inline-block",
      width: "13px",
      height: "13px",
      marginRight: "6px",
      border: `1.5px solid ${muted}`,
      borderRadius: "3px",
      verticalAlign: "middle",
      position: "relative",
      top: "-1px",
      cursor: "pointer",
    },
    ".cm-task-checkbox.is-checked": {
      backgroundColor: accent,
      borderColor: accent,
    },
    ".cm-task-checkbox.is-checked::after": {
      content: '""',
      position: "absolute",
      left: "3px",
      top: "0px",
      width: "3px",
      height: "6px",
      border: "solid white",
      borderWidth: "0 1.5px 1.5px 0",
      transform: "rotate(45deg)",
    },
    ".cm-spent-token": {
      color: muted,
      fontSize: "0.92em",
    },
    ".cm-project-tag": {
      color: project,
      fontWeight: "600",
    },
    ".cm-sum-badge": {
      marginLeft: "10px",
      padding: "1px 8px",
      borderRadius: "999px",
      backgroundColor: "#f1ece0",
      color: "#948c7c",
      fontSize: "0.78em",
      verticalAlign: "middle",
    },
    ".cm-delta-badge": {
      marginLeft: "10px",
      color: accent,
      fontWeight: "700",
      fontSize: "0.85em",
    },
    ".cm-active-timer-line": {
      backgroundColor: accentSoft,
      borderLeft: `3px solid ${accent}`,
    },
  },
  { dark: false },
);
