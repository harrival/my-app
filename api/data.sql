DROP TABLE IF EXISTS game_players_table CASCADE;
DROP TABLE IF EXISTS que_number_table CASCADE;
DROP TABLE IF EXISTS reps_table CASCADE;
DROP TABLE IF EXISTS puzzles_type CASCADE;
DROP TABLE IF EXISTS events_table CASCADE;
DROP TABLE IF EXISTS users_table CASCADE;

CREATE TABLE IF NOT EXISTS users_table (
    id SERIAL,
    user_guid VARCHAR(50) PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100),
    phone_number VARCHAR(15),
    address VARCHAR(255),
    permission_group VARCHAR(20) DEFAULT 'Customer',
    is_admin BOOLEAN DEFAULT false,
    business VARCHAR(100),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events_table (
    id SERIAL,
    event_guid VARCHAR(50) PRIMARY KEY,
    event_type VARCHAR(100),
    event_location VARCHAR(100),
    event_first_date DATE,
    event_last_date DATE,
    is_active BOOLEAN DEFAULT true,
    event_type_created_by VARCHAR(50),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    business VARCHAR(100),
    FOREIGN KEY (event_type_created_by) REFERENCES users_table(user_guid)
);

CREATE TABLE IF NOT EXISTS puzzles_type (
    id SERIAL,
    puzzle_type_guid VARCHAR(10) PRIMARY KEY,
    puzzle_name VARCHAR(10),
    is_archived BOOLEAN,
    puzzle_type_created_by VARCHAR(50),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    business VARCHAR(100),
    FOREIGN KEY (puzzle_type_created_by) REFERENCES users_table(user_guid)
);

CREATE TABLE IF NOT EXISTS reps_table (
    id SERIAL,
    rep_guid VARCHAR(50) PRIMARY KEY,
    rep VARCHAR(50),
    event_id VARCHAR(50),
    is_active BOOLEAN,
    business VARCHAR(100),
    FOREIGN KEY (rep) REFERENCES users_table(user_guid),
    FOREIGN KEY (event_id) REFERENCES events_table(event_guid)
);

CREATE TABLE IF NOT EXISTS game_players_table (
    id SERIAL,
    player_guid VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50),
    email VARCHAR(100),
    phone_number VARCHAR(15),
    puzzle_type VARCHAR(20),
    game_status VARCHAR(20),
    time_started TIME,
    time_ended TIME,
    time_used TIME,
    time_used_in_sec INTEGER,
    player_que_number INTEGER,
    time_created TIMESTAMP,
    time_modified TIMESTAMP,
    rep_id VARCHAR(50),
    event_id VARCHAR(50),
    played_date DATE,
    business VARCHAR(100),
    FOREIGN KEY (rep_id) REFERENCES reps_table(rep_guid),
    FOREIGN KEY (event_id) REFERENCES events_table(event_guid)
);

CREATE TABLE IF NOT EXISTS que_number_table (
    id SERIAL,
    last_number INTEGER,
    event_id VARCHAR(50),
    business VARCHAR(100),
    FOREIGN KEY (event_id) REFERENCES events_table(event_guid)
);

INSERT INTO users_table (user_guid, first_name, last_name, email, phone_number, address, permission_group, is_admin) VALUES
('GUID1000', 'Uche', 'Nwosu', 'uchenwosu@gmail.com', '1111111111', '123 street city state, usa 12345', 'Admin', true),
('GUID1001', 'Obinna', 'Agu', 'obinnaagu@gmail.com', '1111111112', '456 street city state, usa 12345', 'Rep', false),
('GUID1002', 'Onyi', 'Okeke', 'onyiokeke@gmail.com', '1111111113', '789 street city state, usa 12345', 'Customer', false);

INSERT INTO events_table (event_guid, event_type, event_location, event_first_date, event_last_date, event_type_created_by) VALUES
('GUID2000', 'Peoria Fair', 'Peoria Illinios', '2025-06-30', '2025-07-07', 'GUID1000'),
('GUID3000', 'Illinios State Fair', 'Spring Illinios', '2025-07-09', '2025-07-16', 'GUID1000'),
('GUID4000', 'Indiana State Fair', 'Indianapolis Indiana', '2025-07-18', '2025-07-25', 'GUID1000');

INSERT INTO puzzles_type (puzzle_type_guid, puzzle_name, is_archived, puzzle_type_created_by) VALUES
('GUID20001', 'CAT', false, 'GUID1000'),
('GUID30001', 'DOG', false, 'GUID1000'),
('GUID40001', 'BIRD', true, 'GUID1000');

INSERT INTO reps_table (rep_guid, rep, event_id, is_active) VALUES
('GUID10001', 'GUID1001', 'GUID2000', true);

-- 1. Create the notification function
CREATE OR REPLACE FUNCTION notify_game_players_changes() RETURNS trigger AS $$
BEGIN
  -- This sends the signal 'game_players_changes'
  PERFORM pg_notify('game_players_changes', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach it to the table for all modifications
DROP TRIGGER IF EXISTS game_players_changes_trigger ON game_players_table;
CREATE TRIGGER game_players_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON game_players_table
FOR EACH ROW EXECUTE FUNCTION notify_game_players_changes();
