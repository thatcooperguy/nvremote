///////////////////////////////////////////////////////////////////////////////
// nack_sender.cpp -- Selective retransmission (NACK) requester
//
// Tracks incoming sequence numbers and sends NACK packets for detected
// gaps. Runs a 5ms timer to periodically check for missing packets.
///////////////////////////////////////////////////////////////////////////////

#include "nack_sender.h"

#include <cs/common.h>
#include <cs/transport/packet.h>

#include <chrono>
#include <cstring>
#include <algorithm>

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

NackSender::NackSender() = default;

NackSender::~NackSender() {
    stop();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool NackSender::initialize(int socket_fd, const ::sockaddr* peer, int peer_len) {
    std::lock_guard<std::mutex> lock(mutex_);

    socket_fd_ = socket_fd;

    if (peer && peer_len > 0) {
        peer_addr_.assign(reinterpret_cast<const uint8_t*>(peer),
                          reinterpret_cast<const uint8_t*>(peer) + peer_len);
        peer_addr_len_ = peer_len;
    }

    CS_LOG(INFO, "NackSender: initialized");
    return true;
}

// ---------------------------------------------------------------------------
// onPacketReceived
// ---------------------------------------------------------------------------

void NackSender::onPacketReceived(uint16_t seq) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (first_packet_) {
        highest_seq_ = seq;
        first_packet_ = false;
    }

    received_seqs_.insert(seq);

    // Update highest sequence number seen (handling wraparound)
    int16_t delta = static_cast<int16_t>(seq - highest_seq_);
    if (delta > 0) {
        highest_seq_ = seq;
    }

    // Remove from NACK tracking (it arrived, possibly via retransmit)
    nack_retries_.erase(seq);

    // Trim the received set to keep it bounded (only keep recent window)
    // Keep last ~1000 sequence numbers
    while (received_seqs_.size() > 1000) {
        received_seqs_.erase(received_seqs_.begin());
    }
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

void NackSender::start() {
    if (running_.load()) return;

    running_.store(true);
    timer_thread_ = std::thread(&NackSender::timerFunc, this);

    CS_LOG(INFO, "NackSender: started");
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

void NackSender::stop() {
    running_.store(false);

    if (timer_thread_.joinable()) {
        timer_thread_.join();
    }

    CS_LOG(INFO, "NackSender: stopped (total NACKs sent: %llu)",
           static_cast<unsigned long long>(nacks_sent_.load()));
}

// ---------------------------------------------------------------------------
// setMaxRetries
// ---------------------------------------------------------------------------

void NackSender::setMaxRetries(int n) {
    std::lock_guard<std::mutex> lock(mutex_);
    max_retries_ = n;
}

// ---------------------------------------------------------------------------
// getMissingSequences
// ---------------------------------------------------------------------------

std::vector<uint16_t> NackSender::getMissingSequences() const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<uint16_t> missing;
    for (const auto& pair : nack_retries_) {
        missing.push_back(pair.first);
    }
    return missing;
}

// ---------------------------------------------------------------------------
// getNacksSent
// ---------------------------------------------------------------------------

uint64_t NackSender::getNacksSent() const {
    return nacks_sent_.load();
}

// ---------------------------------------------------------------------------
// timerFunc
// ---------------------------------------------------------------------------

void NackSender::timerFunc() {
    while (running_.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(5));

        if (!running_.load()) break;

        checkForGaps();
    }
}

// ---------------------------------------------------------------------------
// checkForGaps
// ---------------------------------------------------------------------------

void NackSender::checkForGaps() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (first_packet_ || received_seqs_.empty()) {
        return;
    }

    // Find the lowest sequence number in our window
    uint16_t lowest = *received_seqs_.begin();

    // Scan from lowest to highest_seq_ for missing sequences
    std::vector<uint16_t> missing;

    // Only look at a reasonable window (don't scan the entire 16-bit space)
    int16_t range = static_cast<int16_t>(highest_seq_ - lowest);
    if (range < 0) range = 0;
    if (range > 500) {
        // Window too large, trim it
        lowest = highest_seq_ - 500;
    }

    for (uint16_t seq = lowest; seq != highest_seq_; seq++) {
        if (received_seqs_.find(seq) == received_seqs_.end()) {
            // This sequence is missing

            // Check if we've already NACKed it too many times
            auto retry_it = nack_retries_.find(seq);
            if (retry_it != nack_retries_.end()) {
                if (retry_it->second >= max_retries_) {
                    // Give up on this sequence
                    nack_retries_.erase(retry_it);
                    continue;
                }
            }

            missing.push_back(seq);

            // Limit NACKs per check cycle
            if (missing.size() >= static_cast<size_t>(max_nacks_per_check_)) {
                break;
            }
        }
    }

    if (missing.empty()) {
        return;
    }

    // Update retry counts
    for (uint16_t seq : missing) {
        nack_retries_[seq]++;
    }

    // Send NACK packet
    sendNackPacket(missing);

    // Clean up stale NACK entries (very old sequences)
    auto it = nack_retries_.begin();
    while (it != nack_retries_.end()) {
        int16_t age = static_cast<int16_t>(highest_seq_ - it->first);
        if (age > 500) {
            it = nack_retries_.erase(it);
        } else {
            ++it;
        }
    }
}

// ---------------------------------------------------------------------------
// sendNackPacket
// ---------------------------------------------------------------------------

void NackSender::sendNackPacket(const std::vector<uint16_t>& missing_seqs) {
    if (socket_fd_ < 0 || peer_addr_.empty() || missing_seqs.empty()) {
        return;
    }

    // NACK packet format:
    //   [0]    type = 0xFD
    //   [1]    count (number of missing sequences, max 255)
    //   [2..n] missing sequence numbers (2 bytes each, network order)

    size_t count = std::min(missing_seqs.size(), static_cast<size_t>(255));
    size_t packet_size = 2 + count * 2;

    std::vector<uint8_t> packet(packet_size);
    packet[0] = static_cast<uint8_t>(PacketType::NACK);
    packet[1] = static_cast<uint8_t>(count);

    for (size_t i = 0; i < count; i++) {
        uint16_t seq_net = htons(missing_seqs[i]);
        std::memcpy(&packet[2 + i * 2], &seq_net, 2);
    }

    int sent = ::sendto(socket_fd_,
                         reinterpret_cast<const char*>(packet.data()),
                         static_cast<int>(packet.size()),
                         0,
                         reinterpret_cast<const ::sockaddr*>(peer_addr_.data()),
                         peer_addr_len_);

    if (sent > 0) {
        nacks_sent_.fetch_add(count);
        CS_LOG(TRACE, "NackSender: sent NACK for %zu sequences (first=%u)",
               count, missing_seqs[0]);
    } else {
        CS_LOG(WARN, "NackSender: sendto failed: %d", cs_socket_error());
    }
}

} // namespace cs
