-- Test venue for trying the back office outreach button (10 Nov 2026).
-- Its booking email is Chase's own inbox, so "Send outreach email" can be tried end to end without emailing a real
-- owner. It never shows on the site (active = 0, consent = 0) and can't be enquired about.
-- Find it in Back office → Outreach by searching "test". Safe to delete later: DELETE FROM outreach_log WHERE stay_id = 'TEST-001'; DELETE FROM outreach WHERE stay_id = 'TEST-001'; DELETE FROM stays WHERE id = 'TEST-001';
INSERT INTO stays (id, name, operator, op_key, kind, mode, beds, price_pp, booking_email, contact_name, active, consent, consent_note) VALUES ('TEST-001', 'Trailscape Test Venue', 'Test', 'pv', 'Test', 'enquiry', 2, 0, 'chasepeers1@gmail.com', 'Chase', 0, 0, 'Test profile for the outreach button: never shown on the site');
