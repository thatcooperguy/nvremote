#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Uninstalls the NVIDIA Remote Stream Host Agent Windows service and cleans up files.

.DESCRIPTION
    This script performs the following steps:
    1. Verifies administrator privileges
    2. Stops the agent service
    3. Tears down the WireGuard tunnel (if active)
    4. Uninstalls the Windows service
    5. Optionally removes all data files

.PARAMETER KeepData
    If specified, preserves the configuration and registration data in ProgramData.
    Without this flag, all agent data is removed.
#>

param(
    [switch]$KeepData
)

$ErrorActionPreference = "Stop"

$InstallDir = "C:\ProgramData\NVRemoteStream"
$AgentBinary = Join-Path $InstallDir "nvrs-agent.exe"
$ServiceName = "NVRemoteStreamAgent"
$WgServiceName = "WireGuardTunnel`$nvrs-tunnel"

function Write-Step {
    param([string]$Message)
    Write-Host "[*] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[+] $Message" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Message)
    Write-Host "[-] $Message" -ForegroundColor Red
}

# --- Step 1: Verify administrator privileges ---
Write-Step "Checking administrator privileges..."
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Failure "This script must be run as Administrator."
    exit 1
}
Write-Success "Running with administrator privileges."

# --- Step 2: Stop the WireGuard tunnel ---
Write-Step "Checking for WireGuard tunnel..."
$wgService = Get-Service -Name $WgServiceName -ErrorAction SilentlyContinue
if ($wgService) {
    Write-Step "Stopping WireGuard tunnel service..."
    Stop-Service -Name $WgServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Try to uninstall via wireguard.exe.
    $wgExe = "C:\Program Files\WireGuard\wireguard.exe"
    if (Test-Path $wgExe) {
        & $wgExe /uninstalltunnelservice nvrs-tunnel 2>$null
        Write-Success "WireGuard tunnel removed."
    } else {
        Write-Failure "wireguard.exe not found; tunnel service may need manual removal."
    }
} else {
    Write-Host "  No WireGuard tunnel service found."
}

# --- Step 3: Stop the agent service ---
Write-Step "Stopping agent service..."
$agentService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($agentService) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Success "Agent service stopped."
} else {
    Write-Host "  Agent service not found (may already be uninstalled)."
}

# --- Step 4: Uninstall the Windows service ---
Write-Step "Uninstalling agent service..."
if (Test-Path $AgentBinary) {
    & $AgentBinary --uninstall 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Agent service uninstalled."
    } else {
        Write-Failure "Agent --uninstall returned non-zero exit code."
        # Try sc.exe as a fallback.
        sc.exe delete $ServiceName 2>$null
    }
} else {
    # Binary not found; try sc.exe directly.
    sc.exe delete $ServiceName 2>$null
    Write-Success "Agent service removed via sc.exe."
}

# --- Step 5: Clean up files ---
if ($KeepData) {
    Write-Step "Keeping data directory: $InstallDir"
    # Only remove the binary.
    if (Test-Path $AgentBinary) {
        Remove-Item -Path $AgentBinary -Force
        Write-Success "Agent binary removed."
    }
} else {
    Write-Step "Removing all agent data from $InstallDir..."

    if (Test-Path $InstallDir) {
        # Remove known agent files, preserving any non-agent files.
        $agentFiles = @(
            "nvrs-agent.exe",
            "agent.yaml",
            "registration.json",
            "wg_private.key",
            "wg_public.key",
            "nvrs-tunnel.conf"
        )

        foreach ($file in $agentFiles) {
            $filePath = Join-Path $InstallDir $file
            if (Test-Path $filePath) {
                Remove-Item -Path $filePath -Force
                Write-Host "  Removed: $file"
            }
        }

        # Remove the directory if empty.
        $remaining = Get-ChildItem -Path $InstallDir -File
        if ($remaining.Count -eq 0) {
            Remove-Item -Path $InstallDir -Recurse -Force
            Write-Success "Install directory removed."
        } else {
            Write-Host "  Directory not removed (contains other files)."
        }
    } else {
        Write-Host "  Install directory does not exist."
    }
}

Write-Host ""
Write-Success "Uninstallation complete."
