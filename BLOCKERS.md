# Blockers

## Open
- B1. Outage sweep: 3 of 5 windows exceed the 10% drift target (17.6%, 18.7%,
  35.2%). Diagnosis: heading drift after missed turns dominates; the combined-
  score map matcher (route distance + odometry consistency) fixed re-lock
  teleporting but cannot recover a heading that already turned wrong.
  Next lever: proper HMM/Newson-Krumm transition (heading+odometry likelihood
  over a candidate window) instead of the greedy score. Not blocking app work.

## Resolved this session
- Gyro sign convention (IO-VNBD left-handed vs engine CW): negated at the
  sensor adapter; verified against GNSS heading deltas.
- Speed-integration runaway: window-mean bias subtraction cancelled dynamics;
  replaced by stationary-tracked bias + model-innovation feedback (sign fixed
  after a positive-feedback runaway produced 102 km drift).
- ZUPT at smooth cruise: CAN-smoothed channels look like standstill; ZUPT now
  requires zeroMotion detection (all channels quiet incl. yaw) or low speed.
- Map-matching deadlock: local search window outrun by drift; expanding window
  + periodic full rescan re-engages matching.
