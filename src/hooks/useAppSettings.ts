import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { EditorHandle } from "../components/Editor";
import { toAccelerator } from "../lib/keybinding";
import { loadSettings, saveSettings, type AppSettings } from "../lib/settings";
import {
  DEFAULT_PRESET_MINUTES,
  DEFAULT_PRESETS,
  DEFAULT_START_STOP_SHORTCUT,
  DEFAULT_TOGGLE_CHECKBOX_SHORTCUT,
  MAX_PRESETS,
  reassignShortcut,
} from "../lib/timer";

export function useAppSettings(editorRef: RefObject<EditorHandle | null>) {
  const [dataDir, setDataDirState] = useState<string | null>(null);
  const [settingsReady, setSettingsReady] = useState(() => !isTauri());
  const [vimMode, setVimMode] = useState(false);
  const [presetMinutes, setPresetMinutes] = useState(
    DEFAULT_PRESETS[0]?.minutes ?? DEFAULT_PRESET_MINUTES,
  );
  const [presets, setPresets] = useState<AppSettings["presets"]>(() =>
    DEFAULT_PRESETS.map((preset) => ({ ...preset })),
  );
  const [startStopShortcut, setStartStopShortcut] = useState<string | null>(
    DEFAULT_START_STOP_SHORTCUT,
  );
  const [toggleCheckboxShortcut, setToggleCheckboxShortcut] = useState<string | null>(
    DEFAULT_TOGGLE_CHECKBOX_SHORTCUT,
  );
  const [globalHotkey, setGlobalHotkey] = useState<string | null>(null);
  const [globalHotkeyError, setGlobalHotkeyError] = useState<string | null>(null);
  const [globalHotkeyBusy, setGlobalHotkeyBusy] = useState(false);
  const globalHotkeyBusyRef = useRef(false);

  const settings = (): AppSettings => ({
    dataDir,
    vimMode,
    presets,
    shortcuts: { startStop: startStopShortcut, toggleCheckbox: toggleCheckboxShortcut },
    globalHotkey,
  });

  const persist = (next: AppSettings) => {
    if (isTauri())
      void saveSettings(next).catch((error) => console.error("save settings failed:", error));
  };

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void loadSettings()
      .then(async (next) => {
        if (cancelled) return;
        setDataDirState(next.dataDir);
        setVimMode(next.vimMode);
        setPresets(next.presets);
        setPresetMinutes(next.presets[0]?.minutes ?? DEFAULT_PRESET_MINUTES);
        setStartStopShortcut(next.shortcuts.startStop);
        setToggleCheckboxShortcut(next.shortcuts.toggleCheckbox);
        editorRef.current?.setEditorKeymap(
          next.presets,
          next.shortcuts.startStop,
          next.shortcuts.toggleCheckbox,
        );
        try {
          await invoke("set_global_hotkey", {
            accelerator: next.globalHotkey ? toAccelerator(next.globalHotkey) : null,
          });
          setGlobalHotkey(next.globalHotkey);
        } catch (error) {
          setGlobalHotkey(null);
          const nativeError = error instanceof Error ? error.message : String(error);
          setGlobalHotkeyError(nativeError);
          try {
            await saveSettings({ ...next, globalHotkey: null });
          } catch (saveError) {
            const persistenceError =
              saveError instanceof Error ? saveError.message : String(saveError);
            setGlobalHotkeyError(
              `${nativeError}; clearing the saved hotkey failed: ${persistenceError}`,
            );
          }
        }
      })
      .catch((error) => console.error("settings load failed:", error))
      .finally(() => !cancelled && setSettingsReady(true));
    return () => {
      cancelled = true;
    };
  }, [editorRef]);

  const setDataDir = (next: string) => {
    persist({ ...settings(), dataDir: next });
    setDataDirState(next);
  };

  const toggleVimMode = () => {
    const next = !vimMode;
    setVimMode(next);
    editorRef.current?.setVimMode(next);
    persist({ ...settings(), vimMode: next });
  };

  const addPreset = () => {
    if (presets.length >= MAX_PRESETS) return;
    const next = [...presets, { minutes: 15, shortcut: null }];
    setPresets(next);
    editorRef.current?.setEditorKeymap(next, startStopShortcut, toggleCheckboxShortcut);
    persist({ ...settings(), presets: next });
  };

  const setPresetDuration = (index: number, minutes: number) => {
    const previous = presets[index]?.minutes;
    const next = presets.map((preset, current) =>
      current === index ? { ...preset, minutes } : preset,
    );
    setPresets(next);
    editorRef.current?.setEditorKeymap(next, startStopShortcut, toggleCheckboxShortcut);
    setPresetMinutes((current) => (current === previous ? minutes : current));
    persist({ ...settings(), presets: next });
  };

  const setPresetShortcut = (index: number, key: string | null) => {
    const {
      presets: next,
      startStop,
      toggleCheckbox,
    } = reassignShortcut(presets, startStopShortcut, toggleCheckboxShortcut, index, key);
    setPresets(next);
    setStartStopShortcut(startStop);
    setToggleCheckboxShortcut(toggleCheckbox);
    editorRef.current?.setEditorKeymap(next, startStop, toggleCheckbox);
    persist({ ...settings(), presets: next, shortcuts: { startStop, toggleCheckbox } });
  };

  const removePreset = (index: number) => {
    if (presets.length <= 1) return;
    const removed = presets[index]?.minutes;
    const next = presets.filter((_, current) => current !== index);
    setPresets(next);
    editorRef.current?.setEditorKeymap(next, startStopShortcut, toggleCheckboxShortcut);
    setPresetMinutes((current) =>
      current === removed ? (next[0]?.minutes ?? DEFAULT_PRESET_MINUTES) : current,
    );
    persist({ ...settings(), presets: next });
  };

  const setStartStop = (key: string | null) => {
    const {
      presets: next,
      startStop,
      toggleCheckbox,
    } = reassignShortcut(presets, startStopShortcut, toggleCheckboxShortcut, "startStop", key);
    setPresets(next);
    setStartStopShortcut(startStop);
    setToggleCheckboxShortcut(toggleCheckbox);
    editorRef.current?.setEditorKeymap(next, startStop, toggleCheckbox);
    persist({ ...settings(), presets: next, shortcuts: { startStop, toggleCheckbox } });
  };

  const setToggleCheckbox = (key: string | null) => {
    const {
      presets: next,
      startStop,
      toggleCheckbox,
    } = reassignShortcut(presets, startStopShortcut, toggleCheckboxShortcut, "toggleCheckbox", key);
    setPresets(next);
    setStartStopShortcut(startStop);
    setToggleCheckboxShortcut(toggleCheckbox);
    editorRef.current?.setEditorKeymap(next, startStop, toggleCheckbox);
    persist({ ...settings(), presets: next, shortcuts: { startStop, toggleCheckbox } });
  };

  const setGlobal = async (key: string | null) => {
    if (globalHotkeyBusyRef.current) return;
    globalHotkeyBusyRef.current = true;
    setGlobalHotkeyBusy(true);
    const previous = globalHotkey;
    const tauri = isTauri();
    const next = { ...settings(), globalHotkey: key };
    let nativeChanged = false;
    try {
      if (tauri) {
        await invoke("set_global_hotkey", {
          accelerator: key ? toAccelerator(key) : null,
        });
        nativeChanged = previous !== key;
        await saveSettings(next);
      }
      setGlobalHotkey(key);
      setGlobalHotkeyError(null);
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error);
      if (tauri && nativeChanged) {
        try {
          await invoke("set_global_hotkey", {
            accelerator: previous ? toAccelerator(previous) : null,
          });
          setGlobalHotkey(previous);
        } catch (rollbackError) {
          const rollbackMessage =
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          setGlobalHotkey(key);
          message = `${message}; restoring previous hotkey failed: ${rollbackMessage}`;
        }
      }
      setGlobalHotkeyError(message);
    } finally {
      globalHotkeyBusyRef.current = false;
      setGlobalHotkeyBusy(false);
    }
  };

  return {
    dataDir,
    settingsReady,
    vimMode,
    presetMinutes,
    presets,
    startStopShortcut,
    toggleCheckboxShortcut,
    globalHotkey,
    globalHotkeyError,
    globalHotkeyBusy,
    setDataDir,
    setPresetMinutes,
    toggleVimMode,
    addPreset,
    setPresetDuration,
    setPresetShortcut,
    removePreset,
    setStartStop,
    setToggleCheckbox,
    setGlobal,
  };
}
