import { app } from 'electron'
import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { AppUpdateInfo, AppUpdateInstallResult } from '../../shared/db-types'

const RELEASE_OWNER = 'robertoumbelino'
const RELEASE_REPO = 'pointer'
const LATEST_RELEASE_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`
const LATEST_MAC_YML_URL = `${LATEST_RELEASE_URL}/download/latest-mac.yml`

type LatestMacManifest = {
  version: string
  path: string
  releaseDate: string | null
}

export class UpdaterService {
  async checkForAppUpdate(): Promise<AppUpdateInfo> {
    const currentVersion = normalizeVersion(app.getVersion())
    const manifest = await fetchLatestMacManifest()
    const latestVersion = normalizeVersion(manifest.version)

    return {
      currentVersion,
      latestVersion,
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      releaseUrl: LATEST_RELEASE_URL,
      publishedAt: manifest.releaseDate ?? null,
      notes: null,
    }
  }

  async installLatestUpdate(): Promise<AppUpdateInstallResult> {
    if (!app.isPackaged) {
      throw new Error('Atualização automática disponível apenas na versão instalada do app.')
    }

    const currentVersion = normalizeVersion(app.getVersion())
    const manifest = await fetchLatestMacManifest()
    const latestVersion = normalizeVersion(manifest.version)

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return {
        started: false,
        message: `Você já está na versão ${currentVersion}.`,
      }
    }

    const zipAssetPath = manifest.path.trim()
    if (!zipAssetPath || !zipAssetPath.endsWith('.zip')) {
      throw new Error('Release sem arquivo .zip para atualização automática.')
    }

    const workspace = await mkdtemp(path.join(tmpdir(), 'pointer-update-'))
    const zipFilename = path.basename(zipAssetPath)
    const zipPath = path.join(workspace, zipFilename)
    await downloadFile(buildLatestReleaseAssetUrl(zipAssetPath), zipPath)

    const bundlePath = resolveBundlePathFromExecutable(app.getPath('exe'))
    const scriptPath = path.join(workspace, 'apply-update.sh')
    const scriptContent = buildApplyUpdateScript({
      appBundlePath: bundlePath,
      zipPath,
      processId: process.pid,
      scriptPath,
    })

    await writeFile(scriptPath, scriptContent, 'utf8')
    await chmod(scriptPath, 0o755)

    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    setTimeout(() => {
      app.quit()
    }, 120)

    return {
      started: true,
      message: `Atualização para ${latestVersion} iniciada. O app vai reiniciar ao concluir.`,
    }
  }
}

async function fetchLatestMacManifest(): Promise<LatestMacManifest> {
  const response = await fetch(LATEST_MAC_YML_URL, {
    headers: {
      'User-Agent': 'pointer-updater',
      Accept: 'text/yaml, text/plain;q=0.9, */*;q=0.8',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Falha ao consultar latest-mac.yml (${response.status}).`)
  }

  const raw = await response.text()
  const version = readYamlScalar(raw, 'version')
  const zipPath = readYamlScalar(raw, 'path')
  const releaseDate = readYamlScalar(raw, 'releaseDate')

  if (!version) {
    throw new Error('latest-mac.yml inválido: campo version ausente.')
  }

  if (!zipPath) {
    throw new Error('latest-mac.yml inválido: campo path ausente.')
  }

  return {
    version,
    path: zipPath,
    releaseDate: releaseDate || null,
  }
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'pointer-updater',
    },
  })

  if (!response.ok) {
    throw new Error(`Falha ao baixar atualização (${response.status}).`)
  }

  const content = Buffer.from(await response.arrayBuffer())
  await writeFile(destinationPath, content)
}

function buildLatestReleaseAssetUrl(assetPath: string): string {
  return `${LATEST_RELEASE_URL}/download/${assetPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

function readYamlScalar(yamlText: string, key: string): string {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, 'm')
  const match = yamlText.match(pattern)
  if (!match) {
    return ''
  }

  const rawValue = match[1].trim()
  if (
    (rawValue.startsWith("'") && rawValue.endsWith("'")) ||
    (rawValue.startsWith('"') && rawValue.endsWith('"'))
  ) {
    return rawValue.slice(1, -1)
  }

  return rawValue
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '')
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((value) => Number.parseInt(value, 10) || 0)
  const rightParts = right.split('.').map((value) => Number.parseInt(value, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0

    if (leftValue > rightValue) {
      return 1
    }

    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}

function resolveBundlePathFromExecutable(executablePath: string): string {
  const contentsMarker = '/Contents/'
  const markerIndex = executablePath.indexOf(contentsMarker)
  if (markerIndex > 0) {
    const candidate = executablePath.slice(0, markerIndex)
    if (candidate.endsWith('.app')) {
      return candidate
    }
  }

  return '/Applications/Pointer.app'
}

function buildApplyUpdateScript(input: {
  appBundlePath: string
  zipPath: string
  processId: number
  scriptPath: string
}): string {
  return `#!/bin/bash
set -euo pipefail

APP_PATH=${shellQuote(input.appBundlePath)}
ZIP_PATH=${shellQuote(input.zipPath)}
OWNER_PID=${input.processId}
SCRIPT_PATH=${shellQuote(input.scriptPath)}

while kill -0 "$OWNER_PID" 2>/dev/null; do
  sleep 1
done

TEMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TEMP_DIR" || true
  rm -f "$SCRIPT_PATH" || true
}
trap cleanup EXIT

ditto -x -k "$ZIP_PATH" "$TEMP_DIR"

if [ ! -d "$TEMP_DIR/Pointer.app" ]; then
  echo "Arquivo de update inválido."
  exit 1
fi

TARGET_DIR="$(dirname "$APP_PATH")"
if [ ! -w "$TARGET_DIR" ]; then
  mkdir -p "$HOME/Applications"
  APP_PATH="$HOME/Applications/Pointer.app"
fi

rm -rf "$APP_PATH"
mv "$TEMP_DIR/Pointer.app" "$APP_PATH"
xattr -dr com.apple.quarantine "$APP_PATH" || true
open "$APP_PATH"
`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
