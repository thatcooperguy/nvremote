///////////////////////////////////////////////////////////////////////////////
// fec.h -- XOR-based Forward Error Correction encoder
//
// Provides a simple XOR-based FEC scheme for the MVP.  Data packets are
// grouped (default group size = 5), and one or more FEC packets are
// generated per group by XOR-ing pairs of data packets together.
//
// Each FEC packet can recover one lost data packet from its group,
// provided all other data packets in the pair are received.
//
// The redundancy ratio controls how many FEC packets are generated
// relative to data packets.  A ratio of 0.2 means ~20% overhead.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <vector>

namespace cs::host {

class FecEncoder {
public:
    FecEncoder();
    ~FecEncoder() = default;

    /// Generate FEC packets from a group of data packets.
    /// Each FEC packet is the XOR of consecutive pairs in the group.
    /// |redundancy_count| overrides the auto-calculated count if > 0.
    std::vector<std::vector<uint8_t>> encode(
        const std::vector<std::vector<uint8_t>>& data_packets,
        int redundancy_count = 0);

    /// Set the FEC redundancy ratio (0.0 to 1.0).
    /// 0.2 = 20% overhead = 1 FEC packet per 5 data packets.
    void setRedundancyRatio(float ratio);

    /// Get the current redundancy ratio.
    float getRedundancyRatio() const { return redundancy_ratio_; }

    /// Set the group size (number of data packets per FEC group).
    void setGroupSize(int size);

    /// Get the current group size.
    int getGroupSize() const { return group_size_; }

    /// Get the running group ID (incremented per encode() call).
    uint8_t currentGroupId() const { return group_id_; }

private:
    float    redundancy_ratio_ = 0.2f;
    int      group_size_       = 5;
    uint8_t  group_id_         = 0;
};

} // namespace cs::host
