# unset-proxy-windows.ps1
# Disables the WinInet system proxy (called on agent quit).

$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
Set-ItemProperty -Path $RegPath -Name ProxyEnable -Value 0 -Type DWord

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinInetHelper2 {
    [DllImport("wininet.dll", SetLastError=true)]
    public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int lpdwBufferLength);
}
"@
[WinInetHelper2]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
[WinInetHelper2]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null

Write-Host "System proxy disabled."
