-- Two booking types (8 Nov 2026).
-- Instant booking: CapeNature, SANParks and NightsBridge stays (we book straight into the provider's calendar; the guest
-- pays when booking, in full or as a deposit). Easy enquire ('enquiry'): everything else (we email the stay; the guest
-- pays once availability is confirmed). Same rule as bookMode() in app-core.js.
UPDATE stays SET mode = 'instant', engine = 'CapeNature portal', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE op_key = 'cn';
UPDATE stays SET mode = 'instant', engine = 'SANParks reservations', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE op_key = 'sp';
UPDATE stays SET mode = 'instant', engine = 'NightsBridge', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id IN ('WC-056', 'WC-064', 'WC-065', 'WC-070', 'WC-072');
UPDATE stays SET mode = 'enquiry', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE op_key NOT IN ('cn', 'sp') AND id NOT IN ('WC-056', 'WC-064', 'WC-065', 'WC-070', 'WC-072');
