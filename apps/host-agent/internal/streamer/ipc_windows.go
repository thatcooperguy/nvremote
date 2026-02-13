//go:build windows

package streamer

import (
	"fmt"
	"net"
	"os"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// dialPipe opens a connection to a Windows named pipe with the given timeout.
// Named pipes on Windows are accessed by opening the file path (e.g., \\.\pipe\name)
// using CreateFile. We poll until the pipe becomes available or the timeout expires.
func dialPipe(pipeName string, timeout time.Duration) (net.Conn, error) {
	deadline := time.Now().Add(timeout)
	pipeNameUTF16, err := windows.UTF16PtrFromString(pipeName)
	if err != nil {
		return nil, fmt.Errorf("converting pipe name to UTF-16: %w", err)
	}

	for {
		handle, err := windows.CreateFile(
			pipeNameUTF16,
			windows.GENERIC_READ|windows.GENERIC_WRITE,
			0,   // no sharing
			nil, // default security
			windows.OPEN_EXISTING,
			windows.FILE_FLAG_OVERLAPPED,
			0,
		)

		if err == nil {
			// Wrap the raw Windows handle into an *os.File, then into a net.Conn.
			f := os.NewFile(uintptr(handle), pipeName)
			if f == nil {
				windows.CloseHandle(handle)
				return nil, fmt.Errorf("failed to create os.File from pipe handle")
			}
			conn, connErr := net.FileConn(f)
			f.Close() // FileConn duplicates the fd internally
			if connErr != nil {
				return nil, fmt.Errorf("creating net.Conn from pipe file: %w", connErr)
			}
			return conn, nil
		}

		if time.Now().After(deadline) {
			return nil, fmt.Errorf("timeout waiting for pipe %s: %w", pipeName, err)
		}

		// If the pipe exists but all instances are busy, use WaitNamedPipe.
		if err == windows.ERROR_PIPE_BUSY {
			_ = waitNamedPipe(pipeNameUTF16, 1000)
			continue
		}

		// For other errors (pipe doesn't exist yet), sleep and retry.
		time.Sleep(250 * time.Millisecond)
	}
}

// waitNamedPipe calls the Windows WaitNamedPipeW API to wait for a pipe instance
// to become available. timeoutMs is the wait duration in milliseconds.
func waitNamedPipe(name *uint16, timeoutMs uint32) error {
	kernel32 := windows.NewLazySystemDLL("kernel32.dll")
	proc := kernel32.NewProc("WaitNamedPipeW")

	r1, _, err := proc.Call(
		uintptr(unsafe.Pointer(name)),
		uintptr(timeoutMs),
	)
	if r1 == 0 {
		return fmt.Errorf("WaitNamedPipeW failed: %w", err)
	}
	return nil
}
