///////////////////////////////////////////////////////////////////////////////
// nack_sender.h -- Selective retransmission (NACK) requester
//
// Tracks incoming packet sequence numbers and detects gaps. When a gap
// is detected, sends a NACK packet (type=0xFD) to the sender requesting
// retransmission of the missing packets.
//
// Limits:
//   - Max 10 NACKs per frame to avoid overwhelming the sender
//   - Max N retries per missing sequence number (configurable)
//   - Checks every 5ms on a background timer
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <vector>
#include <map>
#include <set>
#include <mutex>
#include <thread>
#include <atomic>
#include <functional>

namespace cs {

class NackSender {
public:
    NackSender();
    ~NackSender();

    // Non-copyable
    NackSender(const NackSender&) = delete;
    NackSender& operator=(const NackSender&) = delete;

    /// Initialize with a socket and peer address for sending NACKs.
    bool initialize(int socket_fd, const ::sockaddr* peer, int peer_len);

    /// Notify that a packet with the given sequence number was received.
    void onPacketReceived(uint16_t seq);

    /// Start the background gap-check timer thread.
    void start();

    /// Stop the background thread.
    void stop();

    /// Set maximum number of retransmission requests per sequence number.
    void setMaxRetries(int n);

    /// Get the list of currently missing (NACKed) sequence numbers.
    /// Used by the stats reporter to include in QoS feedback.
    std::vector<uint16_t> getMissingSequences() const;

    /// Get total NACKs sent.
    uint64_t getNacksSent() const;

private:
    /// Background thread function: check for gaps every 5ms.
    void timerFunc();

    /// Detect gaps in the sequence number window and send NACKs.
    void checkForGaps();

    /// Build and send a NACK packet for the given missing sequences.
    void sendNackPacket(const std::vector<uint16_t>& missing_seqs);

    // Socket
    int socket_fd_ = -1;
    std::vector<uint8_t> peer_addr_;
    int peer_addr_len_ = 0;

    // Sequence tracking
    // We track a sliding window of received sequence numbers
    std::set<uint16_t> received_seqs_;
    uint16_t highest_seq_      = 0;
    bool     first_packet_     = true;

    // NACK tracking: seq -> retry count
    std::map<uint16_t, int> nack_retries_;

    // Configuration
    int max_retries_        = 3;
    int max_nacks_per_check_ = 10;

    // Thread
    std::thread timer_thread_;
    std::atomic<bool> running_{false};

    // Stats
    std::atomic<uint64_t> nacks_sent_{0};

    mutable std::mutex mutex_;
};

} // namespace cs
