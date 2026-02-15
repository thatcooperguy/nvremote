//go:build linux || darwin

package streamer

import (
	"fmt"
	"net"
	"time"
)

// dialPipe connects to the nvremote-host process via a Unix domain socket.
// On Unix systems the "pipe name" from the config is mapped to a socket path.
func dialPipe(pipeName string, timeout time.Duration) (net.Conn, error) {
	socketPath := pipeName
	if socketPath == defaultPipeName {
		socketPath = "/tmp/nvremote-host.sock"
	}

	conn, err := net.DialTimeout("unix", socketPath, timeout)
	if err != nil {
		return nil, fmt.Errorf("connecting to unix socket %s: %w", socketPath, err)
	}
	return conn, nil
}
