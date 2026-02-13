# NVIDIA Remote Stream Host Agent

Windows host agent for NVIDIA Remote Stream. This Go service runs alongside `nvstreamer.exe` on host machines, managing WireGuard tunnels, registration with the control plane, and real-time session signaling.

## Architecture

```
apps/host-agent/
  cmd/agent/           Entry point (main.go)
  internal/
    config/            Configuration loading and validation
    registration/      Control plane host registration
    tunnel/            WireGuard tunnel lifecycle management
    nvstreamer/        nvstreamer.exe process monitoring
    heartbeat/         Periodic health reporting and WebSocket signaling
  scripts/             PowerShell install/uninstall scripts
```

## Prerequisites

- Go 1.22 or later
- Windows 10/11 or Windows Server 2019+
- WireGuard for Windows (https://www.wireguard.com/install/)
- NVIDIA GPU with drivers installed
- nvstreamer.exe installed on the host

## Build

```powershell
cd apps\host-agent
go mod tidy
make build
```

The compiled binary will be at `build\nvrs-agent.exe`.

## Install

### Automated (recommended)

Run the install script as Administrator:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

The script will prompt for the control plane URL and bootstrap token, then install and start the Windows service.

For silent installation:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 `
    -ControlPlaneURL "https://nvrs.example.com" `
    -BootstrapToken "your-token" `
    -Silent
```

### Manual

1. Build the binary:
   ```
   make build
   ```

2. Copy to the install directory:
   ```
   copy build\nvrs-agent.exe C:\ProgramData\NVRemoteStream\
   ```

3. Create the configuration file at `C:\ProgramData\NVRemoteStream\agent.yaml`. See `internal/config/config.yaml.example` for reference.

4. Install the service:
   ```
   C:\ProgramData\NVRemoteStream\nvrs-agent.exe --install
   ```

5. Start the service:
   ```
   net start NVRemoteStreamAgent
   ```

## Running in Foreground

For development and debugging, run the agent without installing as a service:

```powershell
.\build\nvrs-agent.exe --run --config .\test-config.yaml
```

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

To keep configuration and registration data:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1 -KeepData
```

## Configuration

Configuration is loaded from `C:\ProgramData\NVRemoteStream\agent.yaml` by default. Environment variables override file values:

| Config Key          | Environment Variable           | Description                         |
|---------------------|-------------------------------|-------------------------------------|
| control_plane_url   | NVRS_CONTROL_PLANE_URL        | Control plane API URL (required)    |
| bootstrap_token     | NVRS_BOOTSTRAP_TOKEN          | Host registration token (required)  |
| host_name           | NVRS_HOST_NAME                | Display name (default: hostname)    |
| nvstreamer_path     | NVRS_NVSTREAMER_PATH          | Path to nvstreamer.exe              |
| data_dir            | NVRS_DATA_DIR                 | Agent state directory               |
| log_level           | NVRS_LOG_LEVEL                | Logging level (debug/info/warn/error) |

## Development

```powershell
# Run tests
make test

# Run tests with coverage
make test-cover

# Format code
make fmt

# Lint
make vet
```
