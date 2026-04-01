# set-proxy-windows.ps1
# Configures the WinInet/WinHTTP system proxy to route through Sentinel.

param(
    [int]$Port = 9876,
    [string]$Overrides = "localhost;127.*;10.*;192.168.*;<local>"
)

$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"

Set-ItemProperty -Path $RegPath -Name ProxyEnable    -Value 1 -Type DWord
Set-ItemProperty -Path $RegPath -Name ProxyServer    -Value "127.0.0.1:$Port"
Set-ItemProperty -Path $RegPath -Name ProxyOverride  -Value $Overrides

# Notify WinInet consumers of the change
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms")
$INTERNET_OPTION_REFRESH          = 37
$INTERNET_OPTION_SETTINGS_CHANGED = 39
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinInetHelper {
    [DllImport("wininet.dll", SetLastError=true)]
    public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int lpdwBufferLength);
}
"@
[WinInetHelper]::InternetSetOption([IntPtr]::Zero, $INTERNET_OPTION_SETTINGS_CHANGED, [IntPtr]::Zero, 0) | Out-Null
[WinInetHelper]::InternetSetOption([IntPtr]::Zero, $INTERNET_OPTION_REFRESH, [IntPtr]::Zero, 0) | Out-Null

Write-Host "System proxy set to 127.0.0.1:$Port"
