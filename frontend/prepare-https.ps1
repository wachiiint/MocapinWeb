param(
    [Parameter(Mandatory = $true)][string]$Address,
    [string]$OutputDirectory = ''
)
$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = $PSScriptRoot }
$parsedAddress = $null
if (-not [Net.IPAddress]::TryParse($Address, [ref]$parsedAddress) -or
    $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
    $Address -eq '0.0.0.0') {
    throw 'Address must be the computer Wi-Fi IPv4 address, such as 192.168.1.10.'
}
$Address = $parsedAddress.IPAddressToString
$openssl = Get-Command openssl -CommandType Application -ErrorAction SilentlyContinue
if (-not $openssl) { throw 'OpenSSL is required. See the Android Wi-Fi HTTPS instructions in frontend/README.md.' }
$certDir = (Resolve-Path -LiteralPath $OutputDirectory).Path
if (-not (Test-Path -LiteralPath $certDir -PathType Container)) { throw 'OutputDirectory must be an existing directory.' }
$publicDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'public'))
if ($certDir.Equals($publicDir, [StringComparison]::OrdinalIgnoreCase) -or
    $certDir.StartsWith($publicDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Do not generate private keys inside public.'
}
$ca = Join-Path $certDir 'dev-https-ca.local.crt'
$caKey = Join-Path $certDir 'dev-https-ca-key.local.pem'
$cert = Join-Path $certDir 'dev-https.local.pem'
$key = Join-Path $certDir 'dev-https-key.local.pem'
$request = Join-Path $certDir 'dev-https.local.csr'
$extensions = Join-Path $certDir 'dev-https.local.ext'

function Invoke-OpenSsl([string[]]$ToolArguments) {
    & $openssl.Source @ToolArguments
    if ($LASTEXITCODE -ne 0) { throw 'OpenSSL failed. Existing CA files have not been intentionally replaced; check the error above.' }
}
if ((Test-Path -LiteralPath $ca) -ne (Test-Path -LiteralPath $caKey)) {
    throw 'Only one CA file exists. Restore the matching CA certificate/key pair before generating a new server certificate.'
}
if (-not (Test-Path -LiteralPath $ca)) {
    Invoke-OpenSsl @('req', '-x509', '-newkey', 'rsa:2048', '-noenc', '-sha256', '-days', '365',
        '-keyout', $caKey, '-out', $ca, '-subj', '/CN=Mocapin Local Development CA',
        '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
}
Invoke-OpenSsl @('x509', '-in', $ca, '-checkend', '2592000', '-noout')
Invoke-OpenSsl @('req', '-new', '-newkey', 'rsa:2048', '-noenc', '-sha256',
    '-keyout', $key, '-out', $request, '-subj', '/CN=Mocapin Development Server')
@"
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$Address
"@ | Set-Content -LiteralPath $extensions -Encoding ascii
try {
    Invoke-OpenSsl @('x509', '-req', '-in', $request, '-CA', $ca, '-CAkey', $caKey,
        '-CAcreateserial', '-out', $cert, '-days', '30', '-sha256', '-extfile', $extensions)
    Invoke-OpenSsl @('verify', '-CAfile', $ca, '-verify_ip', $Address, $cert)
} finally {
    Remove-Item -LiteralPath $request, $extensions -ErrorAction SilentlyContinue
}
Write-Output "HTTPS certificate ready for https://${Address}:5173"
Write-Output "Install only this public CA certificate on the Android test device: $ca"
Write-Output 'Keep both private key files on this computer. No operating-system trust store was modified.'
Write-Output 'Start with: npm run dev:https -- --host'
