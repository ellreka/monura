import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export function createReleaseConfig({
  repository,
  publicKey,
  windowsCertificateThumbprint,
  windowsTimestampUrl,
}) {
  const repo = required(repository, "GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repository form.");
  }

  const updaterPublicKey = required(publicKey, "TAURI_UPDATER_PUBLIC_KEY");
  const thumbprint = windowsCertificateThumbprint?.replace(/\s/g, "") ?? "";
  const timestampUrl = windowsTimestampUrl?.trim() ?? "";
  if ((thumbprint === "") !== (timestampUrl === "")) {
    throw new Error("Windows certificate thumbprint and timestamp URL must be supplied together.");
  }
  if (thumbprint && !/^[A-Fa-f0-9]{40}$/.test(thumbprint)) {
    throw new Error("Windows certificate thumbprint must be 40 hexadecimal characters.");
  }
  if (timestampUrl) {
    const parsedTimestampUrl = new URL(timestampUrl);
    if (parsedTimestampUrl.protocol !== "https:") {
      throw new Error("WINDOWS_TIMESTAMP_URL must use HTTPS.");
    }
  }

  const config = {
    bundle: {
      createUpdaterArtifacts: true,
      macOS: {
        signingIdentity: "-",
      },
    },
    plugins: {
      updater: {
        pubkey: updaterPublicKey,
        endpoints: [`https://github.com/${repo}/releases/latest/download/latest.json`],
        windows: {
          installMode: "passive",
        },
      },
    },
  };

  if (thumbprint) {
    config.bundle.windows = {
      certificateThumbprint: thumbprint,
      digestAlgorithm: "sha256",
      timestampUrl,
    };
  }

  return config;
}

export async function writeReleaseConfig(outputPath, env = process.env) {
  if (!outputPath) throw new Error("Output path is required.");
  const config = createReleaseConfig({
    repository: env.GITHUB_REPOSITORY,
    publicKey: env.TAURI_UPDATER_PUBLIC_KEY,
    windowsCertificateThumbprint: env.WINDOWS_CERTIFICATE_THUMBPRINT,
    windowsTimestampUrl: env.WINDOWS_TIMESTAMP_URL,
  });
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeReleaseConfig(process.argv[2]);
}
