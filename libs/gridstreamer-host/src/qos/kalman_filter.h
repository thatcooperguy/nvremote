///////////////////////////////////////////////////////////////////////////////
// kalman_filter.h -- Simple 1D Kalman filter for delay gradient estimation
//
// Used by the QoS controller to smooth one-way delay gradient measurements
// and detect congestion trends.  The filter tracks a single state variable
// (the delay gradient) and provides a noise-filtered estimate.
///////////////////////////////////////////////////////////////////////////////
#pragma once

namespace cs::host {

class KalmanFilter {
public:
    /// Construct with process noise (Q) and measurement noise (R).
    /// Smaller Q = trust the model more (smoother output).
    /// Smaller R = trust measurements more (faster response).
    explicit KalmanFilter(double process_noise = 1e-3, double measurement_noise = 0.1)
        : estimate_(0.0)
        , variance_(1.0)
        , process_noise_(process_noise)
        , measurement_noise_(measurement_noise)
    {}

    /// Update the filter with a new measurement.
    /// Returns the updated estimate.
    double update(double measurement) {
        // Prediction step (constant model: state doesn't change).
        double predicted_variance = variance_ + process_noise_;

        // Update step.
        double kalman_gain = predicted_variance / (predicted_variance + measurement_noise_);
        estimate_ = estimate_ + kalman_gain * (measurement - estimate_);
        variance_ = (1.0 - kalman_gain) * predicted_variance;

        return estimate_;
    }

    /// Get the current filtered estimate.
    double getEstimate() const { return estimate_; }

    /// Get the current estimation variance (uncertainty).
    double getVariance() const { return variance_; }

    /// Reset the filter state.
    void reset() {
        estimate_ = 0.0;
        variance_ = 1.0;
    }

private:
    double estimate_;
    double variance_;
    double process_noise_;
    double measurement_noise_;
};

} // namespace cs::host
