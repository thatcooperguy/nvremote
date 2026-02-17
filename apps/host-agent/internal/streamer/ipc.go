// Package streamer manages the nvremote-host.exe process lifecycle and IPC communication.
package streamer

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"
)

const (
	// defaultPipeName is the default Windows named pipe for nvremote-host IPC.
	defaultPipeName = `\\.\pipe\nvremote-host`

	// ipcConnectTimeout is how long to wait when opening the named pipe connection.
	ipcConnectTimeout = 5 * time.Second

	// ipcReadTimeout is the maximum time to wait for a response from the streamer.
	ipcReadTimeout = 10 * time.Second

	// ipcWriteTimeout is the maximum time to wait when sending a command.
	ipcWriteTimeout = 5 * time.Second
)

// IpcCommand is the JSON structure sent to nvremote-host over the named pipe.
type IpcCommand struct {
	Command string                 `json:"command"`
	Params  map[string]interface{} `json:"params,omitempty"`
}

// IpcResponse is the JSON structure received from nvremote-host over the named pipe.
type IpcResponse struct {
	Status  string                 `json:"status"` // "ok" or "error"
	Error   string                 `json:"error,omitempty"`
	Data    map[string]interface{} `json:"data,omitempty"`
}

// IpcClient communicates with nvremote-host.exe over a Windows named pipe using
// newline-delimited JSON messages.
type IpcClient struct {
	pipeName string
	conn     net.Conn
	reader   *bufio.Reader
	mu       sync.Mutex
}

// NewIpcClient creates a new IPC client targeting the given pipe name.
// If pipeName is empty, the default pipe name is used.
func NewIpcClient(pipeName string) *IpcClient {
	if pipeName == "" {
		pipeName = defaultPipeName
	}
	return &IpcClient{
		pipeName: pipeName,
	}
}

// Connect opens a connection to the nvremote-host named pipe.
// On Windows, named pipes are accessed via net.Dial("pipe", ...) or by opening
// the UNC path. We use the npipe-style approach via net.DialTimeout.
func (c *IpcClient) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		return nil // already connected
	}

	conn, err := dialPipe(c.pipeName, ipcConnectTimeout)
	if err != nil {
		return fmt.Errorf("connecting to named pipe %s: %w", c.pipeName, err)
	}

	c.conn = conn
	c.reader = bufio.NewReader(conn)
	return nil
}

// SendCommand sends a JSON command to the streamer process and waits for a JSON response.
// The protocol uses newline-delimited JSON: each message is a single JSON object followed
// by a newline character.
func (c *IpcClient) SendCommand(command string, params map[string]interface{}) (map[string]interface{}, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil, fmt.Errorf("IPC client not connected")
	}

	cmd := IpcCommand{
		Command: command,
		Params:  params,
	}

	data, err := json.Marshal(cmd)
	if err != nil {
		return nil, fmt.Errorf("marshalling IPC command: %w", err)
	}

	// Append newline delimiter.
	data = append(data, '\n')

	// Write with timeout.
	if err := c.conn.SetWriteDeadline(time.Now().Add(ipcWriteTimeout)); err != nil {
		return nil, fmt.Errorf("setting write deadline: %w", err)
	}

	if _, err := c.conn.Write(data); err != nil {
		return nil, fmt.Errorf("writing IPC command: %w", err)
	}

	// Read response with timeout.
	if err := c.conn.SetReadDeadline(time.Now().Add(ipcReadTimeout)); err != nil {
		return nil, fmt.Errorf("setting read deadline: %w", err)
	}

	line, err := c.reader.ReadBytes('\n')
	if err != nil {
		return nil, fmt.Errorf("reading IPC response: %w", err)
	}

	var resp IpcResponse
	if err := json.Unmarshal(line, &resp); err != nil {
		return nil, fmt.Errorf("unmarshalling IPC response: %w", err)
	}

	if resp.Status == "error" {
		return nil, fmt.Errorf("IPC command %q failed: %s", command, resp.Error)
	}

	return resp.Data, nil
}

// Close closes the named pipe connection.
func (c *IpcClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil
	}

	err := c.conn.Close()
	c.conn = nil
	c.reader = nil
	return err
}

// IsConnected returns true if the IPC client has an active connection.
func (c *IpcClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// Reconnect closes any existing connection and establishes a new one.
func (c *IpcClient) Reconnect() error {
	_ = c.Close()
	return c.Connect()
}

// PipeName returns the configured pipe name.
func (c *IpcClient) PipeName() string {
	return c.pipeName
}
