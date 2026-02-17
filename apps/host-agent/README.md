# NVRemote Host Agent

Host agent for NVRemote. This Go service runs on host machines, managing registration with the control plane, and real-time session signaling via P2P ICE.

## Architecture

```
apps/host-agent/
  cmd/agent/           Entry point (main.go)
  internal/
    config/            Configuration loading and validation
    registration/      Control plane host registration
    heartbeat/         Periodic health reporting and WebSocket signaling
  scripts/             PowerShell install/uninstall scripts
```

## Prerequisites

- Go 1.22 or later
- Windows 10/11 or Windows Server 2019+
- NVIDIA GPU with drivers installed
- nvremote-host.exe installed on the host

## Build

```powershell
cd apps\host-agent
go mod tidy
make build
```

The compiled binary will be at `build\NVRemoteAgent.exe`.

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
    -ControlPlaneURL "https://api.nvremote.com" `
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
   copy build\NVRemoteAgent.exe C:\ProgramData\NVRemote\
   ```

3. Create the configuration file at `C:\ProgramData\NVRemote\agent.yaml`. See `internal/config/config.yaml.example` for reference.

4. Install the service:
   ```
   C:\ProgramData\NVRemote\NVRemoteAgent.exe --install
   ```

5. Start the service:
   ```
   net start NVRemoteAgent
   ```

## Running in Foreground

For development and debugging, run the agent without installing as a service:

```powershell
.\build\NVRemoteAgent.exe --run --config .\test-config.yaml
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

Configuration is loaded from `C:\ProgramData\NVRemote\agent.yaml` by default. Environment variables override file values:

| Config Key          | Environment Variable           | Description                         |
|---------------------|-------------------------------|-------------------------------------|
| control_plane_url   | NVREMOTE_CONTROL_PLANE_URL    | Control plane API URL (required)    |
| bootstrap_token     | NVREMOTE_BOOTSTRAP_TOKEN      | Host registration token (required)  |
| host_name           | NVREMOTE_HOST_NAME            | Display name (default: hostname)    |
| streamer_path       | NVREMOTE_STREAMER_PATH        | Path to nvremote-host.exe           |
| data_dir            | NVREMOTE_DATA_DIR             | Agent state directory               |
| log_level           | NVREMOTE_LOG_LEVEL            | Logging level (debug/info/warn/error) |

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
