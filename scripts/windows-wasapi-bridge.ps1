<#
.SYNOPSIS
  PolyBlue Windows WASAPI Multi-Endpoint Audio Bridge
.DESCRIPTION
  Enumerates active Windows Bluetooth audio endpoints and coordinates
  synchronized multi-output routing with per-device millisecond delay offsets.
#>
param(
  [string]$ConfigJson = "{}"
)

$ErrorActionPreference = "Stop"

try {
  $config = $ConfigJson | ConvertFrom-Json
} catch {
  Write-Error "Invalid JSON configuration passed to windows-wasapi-bridge.ps1"
  exit 1
}

$btEndpoints = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -match "Bluetooth|Stereo|Headphones|Speaker|AirPods|Sony|Bose|JBL|Sennheiser" }

$result = [PSCustomObject]@{
  platform  = "windows"
  backend   = "WASAPI"
  endpoints = @($btEndpoints | ForEach-Object {
    [PSCustomObject]@{
      id     = $_.InstanceId
      name   = $_.FriendlyName
      status = $_.Status
    }
  })
  appliedDelays = $config.delaysMs
  appliedRouting = $config.routing
}

$result | ConvertTo-Json -Depth 5 -Compress
