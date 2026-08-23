import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReleaseConfig } from "./create-release-config.mjs";
import { createUpdaterManifest, createUpdaterRelease } from "./create-updater-release.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("release updater configuration", () => {
  it("enables signed updater artifacts and preserves Windows Authenticode settings", () => {
    const config = createReleaseConfig({
      repository: "ellreka/monura",
      publicKey: "public-key",
      windowsCertificateThumbprint: "A".repeat(40),
      windowsTimestampUrl: "https://timestamp.example.com",
    });

    expect(config).toEqual({
      bundle: {
        createUpdaterArtifacts: true,
        macOS: {
          signingIdentity: "-",
        },
        windows: {
          certificateThumbprint: "A".repeat(40),
          digestAlgorithm: "sha256",
          timestampUrl: "https://timestamp.example.com",
        },
      },
      plugins: {
        updater: {
          pubkey: "public-key",
          endpoints: ["https://github.com/ellreka/monura/releases/latest/download/latest.json"],
          windows: { installMode: "passive" },
        },
      },
    });
  });

  it("uses ad-hoc macOS signing without Windows Authenticode settings", () => {
    const config = createReleaseConfig({
      repository: "ellreka/monura",
      publicKey: "public-key",
    });

    expect(config.bundle).toEqual({
      createUpdaterArtifacts: true,
      macOS: {
        signingIdentity: "-",
      },
    });
  });

  it("rejects incomplete Windows signing configuration", () => {
    expect(() =>
      createReleaseConfig({
        repository: "ellreka/monura",
        publicKey: "public-key",
        windowsCertificateThumbprint: "A".repeat(40),
      }),
    ).toThrow("must be supplied together");
  });
});

describe("latest.json generation", () => {
  it("maps signed macOS and Windows bundles to Tauri platform identifiers", () => {
    const manifest = createUpdaterManifest({
      repository: "ellreka/monura",
      tag: "v1.2.3",
      version: "v1.2.3",
      publishedAt: "2026-08-20T00:00:00.000Z",
      macUpdaterName: "Monura.app.tar.gz",
      macSignature: "mac-signature\n",
      windowsUpdaterName: "Monura_1.2.3_x64-setup.exe",
      windowsSignature: "windows-signature\n",
    });

    expect(manifest).toEqual({
      version: "1.2.3",
      pub_date: "2026-08-20T00:00:00.000Z",
      platforms: {
        "darwin-aarch64": {
          signature: "mac-signature",
          url: "https://github.com/ellreka/monura/releases/download/v1.2.3/Monura.app.tar.gz",
        },
        "windows-x86_64": {
          signature: "windows-signature",
          url: "https://github.com/ellreka/monura/releases/download/v1.2.3/Monura_1.2.3_x64-setup.exe",
        },
      },
    });
  });

  it("omits the Windows platform from latest.json when no Windows artifacts are supplied", () => {
    const manifest = createUpdaterManifest({
      repository: "ellreka/monura",
      tag: "v1.2.3",
      version: "v1.2.3",
      publishedAt: "2026-08-20T00:00:00.000Z",
      macUpdaterName: "Monura.app.tar.gz",
      macSignature: "mac-signature\n",
    });

    expect(manifest).toEqual({
      version: "1.2.3",
      pub_date: "2026-08-20T00:00:00.000Z",
      platforms: {
        "darwin-aarch64": {
          signature: "mac-signature",
          url: "https://github.com/ellreka/monura/releases/download/v1.2.3/Monura.app.tar.gz",
        },
      },
    });
  });

  it("rejects a Windows updater filename supplied without its signature", () => {
    expect(() =>
      createUpdaterManifest({
        repository: "ellreka/monura",
        tag: "v1.2.3",
        version: "v1.2.3",
        publishedAt: "2026-08-20T00:00:00.000Z",
        macUpdaterName: "Monura.app.tar.gz",
        macSignature: "mac-signature\n",
        windowsUpdaterName: "Monura_1.2.3_x64-setup.exe",
      }),
    ).toThrow("must be supplied together");
  });

  it("flattens exactly five signed inputs and adds latest.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "monura-updater-"));
    temporaryDirectories.push(root);
    const input = path.join(root, "input");
    const output = path.join(root, "output");
    await mkdir(path.join(input, "macos"), { recursive: true });
    await mkdir(path.join(input, "windows"), { recursive: true });
    const files = [
      ["macos/Monura_1.2.3_aarch64.dmg", "dmg"],
      ["macos/Monura.app.tar.gz", "archive"],
      ["macos/Monura.app.tar.gz.sig", "mac-signature"],
      ["windows/Monura_1.2.3_x64-setup.exe", "installer"],
      ["windows/Monura_1.2.3_x64-setup.exe.sig", "windows-signature"],
    ];
    await Promise.all(files.map(([name, content]) => writeFile(path.join(input, name), content)));

    await createUpdaterRelease({
      inputDirectory: input,
      outputDirectory: output,
      repository: "ellreka/monura",
      tag: "v1.2.3",
      version: "1.2.3",
      publishedAt: "2026-08-20T00:00:00.000Z",
    });

    expect((await readdir(output)).sort()).toEqual([
      "Monura.app.tar.gz",
      "Monura.app.tar.gz.sig",
      "Monura_1.2.3_aarch64.dmg",
      "Monura_1.2.3_x64-setup.exe",
      "Monura_1.2.3_x64-setup.exe.sig",
      "latest.json",
    ]);
    const manifest = JSON.parse(await readFile(path.join(output, "latest.json"), "utf8"));
    expect(manifest.platforms["windows-x86_64"].signature).toBe("windows-signature");
  });

  it("flattens macOS-only inputs and omits the Windows platform when Windows is paused", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "monura-updater-"));
    temporaryDirectories.push(root);
    const input = path.join(root, "input");
    const output = path.join(root, "output");
    await mkdir(path.join(input, "macos"), { recursive: true });
    const files = [
      ["macos/Monura_1.2.3_aarch64.dmg", "dmg"],
      ["macos/Monura.app.tar.gz", "archive"],
      ["macos/Monura.app.tar.gz.sig", "mac-signature"],
    ];
    await Promise.all(files.map(([name, content]) => writeFile(path.join(input, name), content)));

    await createUpdaterRelease({
      inputDirectory: input,
      outputDirectory: output,
      repository: "ellreka/monura",
      tag: "v1.2.3",
      version: "1.2.3",
      publishedAt: "2026-08-20T00:00:00.000Z",
    });

    expect((await readdir(output)).sort()).toEqual([
      "Monura.app.tar.gz",
      "Monura.app.tar.gz.sig",
      "Monura_1.2.3_aarch64.dmg",
      "latest.json",
    ]);
    const manifest = JSON.parse(await readFile(path.join(output, "latest.json"), "utf8"));
    expect(manifest.platforms).not.toHaveProperty("windows-x86_64");
  });
});
