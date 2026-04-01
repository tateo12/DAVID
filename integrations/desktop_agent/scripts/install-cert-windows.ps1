# install-cert-windows.ps1
# Imports the mitmproxy CA certificate into the Windows Local Machine Root store.
# Must be run with administrator privileges.

param(
    [Parameter(Mandatory=$true)]
    [string]$CertPath
)

if (-not (Test-Path $CertPath)) {
    Write-Error "Certificate file not found: $CertPath"
    exit 1
}

try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertPath)
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        [System.Security.Cryptography.X509Certificates.StoreName]::Root,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($cert)
    $store.Close()
    Write-Host "Certificate installed successfully."
    exit 0
} catch {
    Write-Error "Failed to install certificate: $_"
    exit 1
}
