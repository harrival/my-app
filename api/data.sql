DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS GamePlayers;
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL
);

INSERT INTO users (name, type) VALUES ('Juanita', 'admin');
INSERT INTO users (name, type) VALUES ('Jenny', 'staff');
INSERT INTO users (name, type) VALUES ('Jeff', 'user');

CREATE TABLE IF NOT EXISTS customers_table (
    id SERIAL,
    customer_guid VARCHAR(50) PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100),
    phone_number VARCHAR(15),
    address VARCHAR(255),
    permission_group VARCHAR(20) DEFAULT 'Customer',
    is_admin BOOLEAN DEFAULT false,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events_table (
    id SERIAL,
    event_guid VARCHAR(50) PRIMARY KEY,
    event_type VARCHAR(100),
    event_location VARCHAR(100),
    event_first_date DATE,
    event_last_date DATE,
    event_created_by VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS puzzles_type (
    id SERIAL,
    puzzle_type_guid VARCHAR(10) PRIMARY KEY,
    puzzle_name VARCHAR(10),
    is_archived BOOLEAN,
    puzzle_type_created_by VARCHAR(50),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (puzzle_type_created_by) REFERENCES customers_table(customer_guid)
);

CREATE TABLE IF NOT EXISTS reps_table (
    id SERIAL,
    rep_guid VARCHAR(50) PRIMARY KEY,
    rep VARCHAR(50),
    event_id VARCHAR(50),
    is_active BOOLEAN,
    FOREIGN KEY (rep) REFERENCES customers_table(customer_guid),
    FOREIGN KEY (event_id) REFERENCES events_table(event_guid)
);

CREATE TABLE IF NOT EXISTS game_players_table (
    id SERIAL,
    player_guid VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50),
    email VARCHAR(100),
    phone_number VARCHAR(15),
    puzzle_type VARCHAR(20),
    game_status VARCHAR(20) DEFAULT 'Created',
    time_used TIME,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP,
    rep_id VARCHAR(50),
    event_id VARCHAR(50),
    played_date DATE,
    FOREIGN KEY (rep_id) REFERENCES reps_table(rep_guid),
    FOREIGN KEY (event_id) REFERENCES events_table(event_guid)
);

INSERT INTO customers_table (customer_guid, first_name, last_name, email, phone_number, address, permission_group, is_admin) VALUES
('GUID1000', 'Uche', 'Nwosu', 'uchenwosu@gmail.com', '1111111111', '123 street city state, usa 12345', 'Admin', true),
('GUID1001', 'Obinna', 'Agu', 'obinnaagu@gmail.com', '1111111112', '456 street city state, usa 12345', 'Rep', false),
('GUID1002', 'Onyi', 'Okeke', 'onyiokeke@gmail.com', '1111111113', '789 street city state, usa 12345', 'Customer', false);

INSERT INTO events_table (event_guid, event_type, event_location, event_first_date, event_last_date) VALUES
('GUID2000', 'Peoria Fair', 'Peoria Illinios', '2025-06-30', '2025-07-07'),
('GUID3000', 'Illinios State Fair', 'Spring Illinios', '2025-07-09', '2025-07-16'),
('GUID4000', 'Indiana State Fair', 'Indianapolis Indiana', '2025-07-18', '2025-07-25');

INSERT INTO puzzles_type (puzzle_type_guid, puzzle_name, is_archived, puzzle_type_created_by) VALUES
('GUID20001', 'CAT', false, 'GUID1000'),
('GUID30001', 'DOG', false, 'GUID1000'),
('GUID40001', 'BIRD', true, 'GUID1000');

INSERT INTO reps_table (rep_guid, rep, event_id, is_active) VALUES
('GUID10001', 'GUID1001', 'GUID2000', true);

INSERT INTO game_players_table (username, email, puzzle_type, rep_id, event_id, player_guid) VALUES
('harri', 'harri@gmail.com', 'CAT', 'GUID10001', 'GUID2000', 'GUID100001'),
('val', 'val@gmail.com', 'DOG', 'GUID10001', 'GUID2000', 'GUID100002');

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
