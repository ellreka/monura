import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState, type RefObject } from "react";
import type { EditorHandle } from "../components/Editor";
import { toAccelerator } from "../lib/keybinding";
import { getSettingsFilePath, loadSettings, saveSettings, type AppSettings } from "../lib/settings";
import {
  DEFAULT_PRESET_MINUTES,
  DEFAULT_PRESETS,
  DEFAULT_START_STOP_SHORTCUT,
  MAX_PRESETS,
  reassignShortcut,
} from "../lib/timer";

export function useAppSettings(editorRef: RefObject<EditorHandle | null>) {
  const [dataDir, setDataDirState] = useState<string | null>(null);
  const [settingsFilePath, setSettingsFilePath] = useState<string | null>(null);
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
  const [globalHotkey, setGlobalHotkey] = useState<string | null>(null);

  const settings = (): AppSettings => ({
    dataDir,
    vimMode,
    presets,
    shortcuts: { startStop: startStopShortcut },
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
      .then((next) => {
        if (cancelled) return;
        setDataDirState(next.dataDir);
        setVimMode(next.vimMode);
        setPresets(next.presets);
        setPresetMinutes(next.presets[0]?.minutes ?? DEFAULT_PRESET_MINUTES);
        setStartStopShortcut(next.shortcuts.startStop);
        setGlobalHotkey(next.globalHotkey);
        void getSettingsFilePath()
          .then((path) => !cancelled && setSettingsFilePath(path))
          .catch((error) => console.error("settings path load failed:", error));
        void invoke("set_global_hotkey", {
          accelerator: next.globalHotkey ? toAccelerator(next.globalHotkey) : null,
        }).catch((error) => console.error("set global hotkey failed:", error));
      })
      .catch((error) => console.error("settings load failed:", error))
      .finally(() => !cancelled && setSettingsReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

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
    editorRef.current?.setTimerKeymap(next, startStopShortcut);
    persist({ ...settings(), presets: next });
  };

  const setPresetDuration = (index: number, minutes: number) => {
    const previous = presets[index]?.minutes;
    const next = presets.map((preset, current) =>
      current === index ? { ...preset, minutes } : preset,
    );
    setPresets(next);
    editorRef.current?.setTimerKeymap(next, startStopShortcut);
    setPresetMinutes((current) => (current === previous ? minutes : current));
    persist({ ...settings(), presets: next });
  };

  const setPresetShortcut = (index: number, key: string | null) => {
    const { presets: next, startStop } = reassignShortcut(presets, startStopShortcut, index, key);
    setPresets(next);
    setStartStopShortcut(startStop);
    editorRef.current?.setTimerKeymap(next, startStop);
    persist({ ...settings(), presets: next, shortcuts: { startStop } });
  };

  const removePreset = (index: number) => {
    if (presets.length <= 1) return;
    const removed = presets[index]?.minutes;
    const next = presets.filter((_, current) => current !== index);
    setPresets(next);
    editorRef.current?.setTimerKeymap(next, startStopShortcut);
    setPresetMinutes((current) =>
      current === removed ? (next[0]?.minutes ?? DEFAULT_PRESET_MINUTES) : current,
    );
    persist({ ...settings(), presets: next });
  };

  const setStartStop = (key: string | null) => {
    const { presets: next, startStop } = reassignShortcut(
      presets,
      startStopShortcut,
      "startStop",
      key,
    );
    setPresets(next);
    setStartStopShortcut(startStop);
    editorRef.current?.setTimerKeymap(next, startStop);
    persist({ ...settings(), presets: next, shortcuts: { startStop } });
  };

  const setGlobal = (key: string | null) => {
    setGlobalHotkey(key);
    if (isTauri())
      void invoke("set_global_hotkey", {
        accelerator: key ? toAccelerator(key) : null,
      }).catch((error) => console.error("set global hotkey failed:", error));
    persist({ ...settings(), globalHotkey: key });
  };

  return {
    dataDir,
    settingsFilePath,
    settingsReady,
    vimMode,
    presetMinutes,
    presets,
    startStopShortcut,
    globalHotkey,
    setDataDir,
    setPresetMinutes,
    toggleVimMode,
    addPreset,
    setPresetDuration,
    setPresetShortcut,
    removePreset,
    setStartStop,
    setGlobal,
  };
}
