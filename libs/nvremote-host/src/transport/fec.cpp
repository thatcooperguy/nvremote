///////////////////////////////////////////////////////////////////////////////
// fec.cpp -- XOR-based Forward Error Correction implementation
//
// For the MVP we use a simple XOR scheme:
//   - Data packets are grouped (default 5 per group).
//   - FEC packet[i] = data[i*2] XOR data[i*2 + 1]  (pair-wise XOR).
//   - Shorter packets are zero-padded to the length of the longest in the pair.
//   - The number of FEC packets is determined by the redundancy ratio.
//
// This allows recovery of one lost packet per pair, which is adequate for
// low-loss networks.  A future upgrade path is Reed-Solomon coding.
///////////////////////////////////////////////////////////////////////////////

#include "fec.h"
#include <cs/common.h>

#include <algorithm>
#include <cstring>

namespace cs::host {

FecEncoder::FecEncoder() = default;

// ---------------------------------------------------------------------------
// encode -- generate FEC packets for a set of data packets
// ---------------------------------------------------------------------------

std::vector<std::vector<uint8_t>> FecEncoder::encode(
    const std::vector<std::vector<uint8_t>>& data_packets,
    int redundancy_count)
{
    std::vector<std::vector<uint8_t>> fec_packets;

    if (data_packets.empty()) return fec_packets;

    // Determine how many FEC packets to generate.
    int num_fec;
    if (redundancy_count > 0) {
        num_fec = redundancy_count;
    } else {
        num_fec = std::max(1, static_cast<int>(data_packets.size() * redundancy_ratio_));
    }

    // We generate FEC packets by XOR-ing consecutive pairs.
    // If we have N data packets, we can make at most N/2 FEC packets via pairing.
    int max_pairs = static_cast<int>(data_packets.size()) / 2;
    if (max_pairs == 0) {
        // Only one data packet -- XOR with itself is useless, just duplicate.
        fec_packets.push_back(data_packets[0]);
        group_id_++;
        return fec_packets;
    }

    num_fec = std::min(num_fec, max_pairs);

    for (int i = 0; i < num_fec; ++i) {
        size_t idx_a = static_cast<size_t>(i * 2) % data_packets.size();
        size_t idx_b = static_cast<size_t>(i * 2 + 1) % data_packets.size();

        const auto& pkt_a = data_packets[idx_a];
        const auto& pkt_b = data_packets[idx_b];

        // FEC packet length = max of the two source packets.
        size_t fec_len = std::max(pkt_a.size(), pkt_b.size());
        std::vector<uint8_t> fec(fec_len, 0);

        // XOR the two packets together.
        for (size_t j = 0; j < pkt_a.size(); ++j) {
            fec[j] ^= pkt_a[j];
        }
        for (size_t j = 0; j < pkt_b.size(); ++j) {
            fec[j] ^= pkt_b[j];
        }

        fec_packets.push_back(std::move(fec));
    }

    group_id_++;
    CS_LOG(TRACE, "FEC: generated %d packets from %zu data packets (group=%u)",
           num_fec, data_packets.size(), group_id_ - 1);

    return fec_packets;
}

// ---------------------------------------------------------------------------
// setRedundancyRatio
// ---------------------------------------------------------------------------

void FecEncoder::setRedundancyRatio(float ratio) {
    redundancy_ratio_ = std::clamp(ratio, 0.0f, 1.0f);
    CS_LOG(DEBUG, "FEC: redundancy ratio set to %.2f", redundancy_ratio_);
}

// ---------------------------------------------------------------------------
// setGroupSize
// ---------------------------------------------------------------------------

void FecEncoder::setGroupSize(int size) {
    if (size < 2) size = 2;
    if (size > 48) size = 48;
    group_size_ = size;
    CS_LOG(DEBUG, "FEC: group size set to %d", group_size_);
}

} // namespace cs::host
