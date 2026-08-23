import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function releaseAssetUrl(repository, tag, assetName) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

export function createUpdaterManifest({
  repository,
  tag,
  version,
  publishedAt,
  macUpdaterName,
  macSignature,
  windowsUpdaterName,
  windowsSignature,
}) {
  const repo = required(repository, "GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repository form.");
  }
  const releaseTag = required(tag, "GITHUB_REF_NAME");
  const rawVersion = required(version, "RELEASE_VERSION");
  const releaseVersion = rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(releaseVersion)) {
    throw new Error("RELEASE_VERSION must be a semantic version.");
  }
  if (Boolean(windowsUpdaterName) !== Boolean(windowsSignature)) {
    throw new Error("Windows updater filename and signature must be supplied together.");
  }

  const platforms = {
    "darwin-aarch64": {
      signature: required(macSignature, "macOS updater signature"),
      url: releaseAssetUrl(repo, releaseTag, required(macUpdaterName, "macOS updater filename")),
    },
  };
  if (windowsUpdaterName) {
    platforms["windows-x86_64"] = {
      signature: required(windowsSignature, "Windows updater signature"),
      url: releaseAssetUrl(repo, releaseTag, windowsUpdaterName),
    };
  }

  return {
    version: releaseVersion,
    pub_date: new Date(publishedAt).toISOString(),
    platforms,
  };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

function exactlyOne(files, predicate, label) {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${matches.length}.`);
  }
  return matches[0];
}

function atMostOne(files, predicate, label) {
  const matches = files.filter(predicate);
  if (matches.length > 1) {
    throw new Error(`Expected at most one ${label}, found ${matches.length}.`);
  }
  return matches[0];
}

export async function createUpdaterRelease({
  inputDirectory,
  outputDirectory,
  repository,
  tag,
  version,
  publishedAt = new Date(),
}) {
  const files = await listFiles(inputDirectory);

  const macInstaller = exactlyOne(files, (file) => file.endsWith(".dmg"), "macOS DMG");
  const macUpdater = exactlyOne(
    files,
    (file) => file.endsWith(".app.tar.gz"),
    "macOS updater bundle",
  );
  const macSignature = exactlyOne(
    files,
    (file) => file === `${macUpdater}.sig`,
    "macOS updater signature",
  );
  // Windows artifacts are optional so this script keeps working while Windows releases
  // are paused; supply both nsis installer and .sig to include Windows in the manifest.
  const windowsInstaller = atMostOne(
    files,
    (file) => file.endsWith("-setup.exe"),
    "Windows NSIS installer",
  );
  const windowsSignature = windowsInstaller
    ? exactlyOne(files, (file) => file === `${windowsInstaller}.sig`, "Windows updater signature")
    : undefined;

  const selectedFiles = [
    macInstaller,
    macUpdater,
    macSignature,
    windowsInstaller,
    windowsSignature,
  ].filter(Boolean);
  if (selectedFiles.length !== files.length) {
    throw new Error(
      `Expected ${selectedFiles.length} signed release files, found ${files.length}.`,
    );
  }
  const names = selectedFiles.map((file) => path.basename(file));
  if (new Set(names).size !== names.length)
    throw new Error("Release asset filenames must be unique.");

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    selectedFiles.map((file) => copyFile(file, path.join(outputDirectory, path.basename(file)))),
  );

  const manifest = createUpdaterManifest({
    repository,
    tag,
    version,
    publishedAt,
    macUpdaterName: path.basename(macUpdater),
    macSignature: await readFile(macSignature, "utf8"),
    windowsUpdaterName: windowsInstaller ? path.basename(windowsInstaller) : undefined,
    windowsSignature: windowsSignature ? await readFile(windowsSignature, "utf8") : undefined,
  });
  await writeFile(
    path.join(outputDirectory, "latest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createUpdaterRelease({
    inputDirectory: process.argv[2],
    outputDirectory: process.argv[3],
    repository: process.env.GITHUB_REPOSITORY,
    tag: process.env.GITHUB_REF_NAME,
    version: process.env.RELEASE_VERSION,
  });
}
