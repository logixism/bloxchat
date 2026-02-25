#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const nextVersion = process.argv[2]?.trim();
if (!nextVersion) {
  console.error("Usage: bun run desktop:version -- <version>");
  process.exit(1);
}

const semverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (!semverPattern.test(nextVersion)) {
  console.error(`Invalid semver version: "${nextVersion}"`);
  process.exit(1);
}

const desktopPackageJsonPath = path.join(repoRoot, "apps/desktop/package.json");
const tauriConfigPath = path.join(
  repoRoot,
  "apps/desktop/src-tauri/tauri.conf.json",
);
const cargoTomlPath = path.join(repoRoot, "apps/desktop/src-tauri/Cargo.toml");

function updateJsonVersion(filePath, version) {
  const source = fs.readFileSync(filePath, "utf8");
  const versionPattern = /("version"\s*:\s*")[^"]+(")/;
  if (!versionPattern.test(source)) {
    throw new Error(`Could not locate "version" in ${path.relative(repoRoot, filePath)}`);
  }

  const updated = source.replace(versionPattern, (_, prefix, suffix) => {
    return `${prefix}${version}${suffix}`;
  });

  fs.writeFileSync(filePath, updated);
}

function updateCargoVersion(filePath, version) {
  const source = fs.readFileSync(filePath, "utf8");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  let inPackageSection = false;
  let replaced = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*\[.*\]\s*$/.test(line)) {
      inPackageSection = /^\s*\[package\]\s*$/.test(line);
      continue;
    }

    if (inPackageSection && /^\s*version\s*=/.test(line)) {
      lines[i] = `version = "${version}"`;
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    throw new Error("Could not locate [package].version in Cargo.toml");
  }

  fs.writeFileSync(filePath, lines.join(newline));
}

updateJsonVersion(desktopPackageJsonPath, nextVersion);
updateJsonVersion(tauriConfigPath, nextVersion);
updateCargoVersion(cargoTomlPath, nextVersion);

console.log(`Updated desktop version to ${nextVersion}:`);
console.log(`- apps/desktop/package.json`);
console.log(`- apps/desktop/src-tauri/tauri.conf.json`);
console.log(`- apps/desktop/src-tauri/Cargo.toml`);
