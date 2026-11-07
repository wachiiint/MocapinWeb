$ErrorActionPreference = 'Stop'

$modelAssets = Join-Path $PSScriptRoot 'public'
$modelSpecs = @(
    @{
        File = 'rtmdet-nano.onnx'
        Url = 'https://download.openmmlab.com/mmpose/v1/projects/rtmpose/rtmpose-cpu.zip'
        EntrySuffix = 'rtmpose-ort/rtmdet-nano/end2end.onnx'
        Hash = 'B8585ADB6D1352796F6E86337E09C3459B830645A7E7192D9381670BEA2FACBD'
    },
    @{
        File = 'rtmpose-s-halpe26.onnx'
        Url = 'https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-s_simcc-body7_pt-body7-halpe26_700e-256x192-7f134165_20230605.zip'
        EntrySuffix = 'rtmpose-s_simcc-body7_pt-body7-halpe26_700e-256x192-7f134165_20230605/end2end.onnx'
        Hash = '85C5D669AA0B0C7969799EA9E0620D3B8C1D3C2B6878243E98A1EF8351457986'
    }
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-ModelHash([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
}
[System.IO.Directory]::CreateDirectory($modelAssets) | Out-Null
$downloadDir = Join-Path ([System.IO.Path]::GetTempPath()) ('mocapin-models-' + [guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($downloadDir) | Out-Null

foreach ($spec in $modelSpecs) {
    $target = Join-Path $modelAssets $spec.File
    if ((Test-Path -LiteralPath $target) -and ((Get-ModelHash $target) -eq $spec.Hash)) {
        Write-Output "$($spec.File) is ready."
        continue
    }
    $archivePath = Join-Path $downloadDir ($spec.File + '.zip')
    Invoke-WebRequest -Uri $spec.Url -OutFile $archivePath -UseBasicParsing
    $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
    $staged = Join-Path $downloadDir $spec.File
    try {
        $entries = @($archive.Entries | Where-Object { $_.FullName.EndsWith($spec.EntrySuffix, [StringComparison]::Ordinal) })
        if ($entries.Count -ne 1) { throw "Unexpected archive layout for $($spec.File)." }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0], $staged)
    } finally {
        $archive.Dispose()
    }
    if ((Get-ModelHash $staged) -ne $spec.Hash) {
        throw "Checksum mismatch for $($spec.File). Existing asset was not replaced."
    }
    Copy-Item -LiteralPath $staged -Destination $target -Force
    Remove-Item -LiteralPath $staged, $archivePath
    Write-Output "$($spec.File) is ready."
}
Remove-Item -LiteralPath $downloadDir
