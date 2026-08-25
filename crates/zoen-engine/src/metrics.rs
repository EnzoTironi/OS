use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

const LATENCY_BOUNDS_SECONDS: &[f64] = &[
    0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0,
];
const BUCKET_COUNT: usize = LATENCY_BOUNDS_SECONDS.len() + 1;
const _: () = assert!(BUCKET_COUNT == 12);

static JCS_MISMATCH_TOTAL: AtomicU64 = AtomicU64::new(0);
static ADMIT_COUNT: AtomicU64 = AtomicU64::new(0);
static ADMIT_SUM_MICROS: AtomicU64 = AtomicU64::new(0);

static ADMIT_BUCKETS: [AtomicU64; BUCKET_COUNT] = [
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
];

/// Count one RFC 8785 admission mismatch. Fail-closed stays with the caller.
pub fn record_jcs_mismatch() {
    JCS_MISMATCH_TOTAL.fetch_add(1, Ordering::Relaxed);
}

pub fn jcs_mismatch_total() -> u64 {
    JCS_MISMATCH_TOTAL.load(Ordering::Relaxed)
}

/// Record how long `admit` took. Buckets are cumulative Prometheus histograms.
pub fn record_admit_latency(started: Instant) {
    let micros = u64::try_from(started.elapsed().as_micros()).unwrap_or(u64::MAX);
    ADMIT_COUNT.fetch_add(1, Ordering::Relaxed);
    ADMIT_SUM_MICROS.fetch_add(micros, Ordering::Relaxed);
    let seconds = micros as f64 / 1_000_000.0;
    for (index, bound) in LATENCY_BOUNDS_SECONDS.iter().enumerate() {
        if seconds <= *bound {
            ADMIT_BUCKETS[index].fetch_add(1, Ordering::Relaxed);
        }
    }
    ADMIT_BUCKETS[LATENCY_BOUNDS_SECONDS.len()].fetch_add(1, Ordering::Relaxed);
}

/// Prometheus 0.0.4 text. Process-local. No tenant or document bytes.
pub fn prometheus_text() -> String {
    let mut text = String::from(
        "# HELP zoen_jcs_mismatch_total RFC 8785 JCS admission mismatches\n\
         # TYPE zoen_jcs_mismatch_total counter\n",
    );
    text.push_str(&format!(
        "zoen_jcs_mismatch_total {}\n",
        jcs_mismatch_total()
    ));
    text.push_str(
        "# HELP zoen_admit_duration_seconds Definition admission latency\n\
         # TYPE zoen_admit_duration_seconds histogram\n",
    );
    for (index, bound) in LATENCY_BOUNDS_SECONDS.iter().enumerate() {
        text.push_str(&format!(
            "zoen_admit_duration_seconds_bucket{{le=\"{bound}\"}} {}\n",
            ADMIT_BUCKETS[index].load(Ordering::Relaxed)
        ));
    }
    text.push_str(&format!(
        "zoen_admit_duration_seconds_bucket{{le=\"+Inf\"}} {}\n",
        ADMIT_BUCKETS[LATENCY_BOUNDS_SECONDS.len()].load(Ordering::Relaxed)
    ));
    text.push_str(&format!(
        "zoen_admit_duration_seconds_sum {}\n",
        ADMIT_SUM_MICROS.load(Ordering::Relaxed) as f64 / 1_000_000.0
    ));
    text.push_str(&format!(
        "zoen_admit_duration_seconds_count {}\n",
        ADMIT_COUNT.load(Ordering::Relaxed)
    ));
    text
}

#[cfg(test)]
mod tests {
    use super::{jcs_mismatch_total, prometheus_text, record_admit_latency, record_jcs_mismatch};
    use std::time::Instant;

    #[test]
    fn mismatch_counter_and_histogram_render() {
        let before = jcs_mismatch_total();
        record_jcs_mismatch();
        record_admit_latency(Instant::now());
        let text = prometheus_text();
        assert!(jcs_mismatch_total() > before);
        assert!(text.contains("zoen_jcs_mismatch_total"));
        assert!(text.contains("zoen_admit_duration_seconds_count"));
        assert!(text.contains("le=\"+Inf\""));
    }
}
