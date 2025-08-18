DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS GamePlayers;
DROP TABLE IF EXISTS PuzzleType;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL
);

INSERT INTO users (name, type) VALUES ('Juanita', 'admin');
INSERT INTO users (name, type) VALUES ('Jenny', 'staff');
INSERT INTO users (name, type) VALUES ('Jeff', 'user');

CREATE TABLE IF NOT EXISTS CustomersTable (
    ID SERIAL,
    CustomerGUID VARCHAR(50) PRIMARY KEY,
    FirstName VARCHAR(50),
    LastName VARCHAR(50),
    Email VARCHAR(100),
    PhoneNumber VARCHAR(15),
    Address VARCHAR(255),
    PermissionGroup VARCHAR(20),
    IsAdmin BOOLEAN
);

CREATE TABLE IF NOT EXISTS EventTable (
    ID SERIAL,
    EventGUID VARCHAR(50) PRIMARY KEY,
    EventType VARCHAR(100),
    EventLocation VARCHAR(100),
    EventFirstDate DATE,
    EventLastDate DATE
);

CREATE TABLE IF NOT EXISTS PuzzleType (
    ID SERIAL,
    PuzzleTypeGUID VARCHAR(10) PRIMARY KEY,
    PuzzleName VARCHAR(10),
    IsArchived BOOLEAN,
    PuzzleTypeCreatedBy VARCHAR(50),
    TimeCreated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TimeModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (PuzzleTypeCreatedBy) REFERENCES CustomersTable(CustomerGUID)
);

CREATE TABLE IF NOT EXISTS RepTable (
    ID SERIAL,
    RepGUID VARCHAR(50) PRIMARY KEY,
    Rep VARCHAR(10),
    EventID VARCHAR(10),
    IsActive BOOLEAN,
    FOREIGN KEY (Rep) REFERENCES CustomersTable(CustomerGUID),
    FOREIGN KEY (EventID) REFERENCES EventTable(EventGUID)
);

CREATE TABLE IF NOT EXISTS GamePlayers (
    ID SERIAL,
    PlayerGUID VARCHAR(50) PRIMARY KEY,
    Username VARCHAR(50),
    Email VARCHAR(100),
    PhoneNo VARCHAR(15),
    PuzzleType VARCHAR(20),
    TimeUsed TIME,
    TimeCreated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    RepID VARCHAR(10),
    EventID VARCHAR(10),
    EventDate DATE,
    FOREIGN KEY (RepID) REFERENCES RepTable(RepGUID),
    FOREIGN KEY (EventID) REFERENCES EventTable(EventGUID)
);


INSERT INTO CustomersTable (CustomerGUID, FirstName, LastName, Email, PhoneNumber, Address, PermissionGroup, IsAdmin) VALUES
('GUID1000', 'Uche', 'Nwosu', 'uchenwosu@gmail.com', '1111111111', '123 street city state, usa 12345', 'Admin', true),
('GUID1001', 'Obinna', 'Agu', 'obinnaagu@gmail.com', '1111111112', '456 street city state, usa 12345', 'Rep', false),
('GUID1002', 'Onyi', 'Okeke', 'onyiokeke@gmail.com', '1111111113', '789 street city state, usa 12345', 'Customer', false);


INSERT INTO EventTable (EventGUID, EventType, EventLocation, EventFirstDate, EventLastDate) VALUES
('GUID2000', 'Peoria Fair', 'Peoria Illinios', '2025-06-30', '2025-07-07'),
('GUID3000', 'Illinios State Fair', 'Spring Illinios', '2025-07-09', '2025-07-16'),
('GUID4000', 'Indiana State Fair', 'Indianapolis Indiana', '2025-07-18', '2025-07-25');

INSERT INTO PuzzleType (PuzzleTypeGUID, PuzzleName, IsArchived, PuzzleTypeCreatedBy) VALUES
('GUID20001', 'CAT', false, 'GUID1000'),
('GUID30001', 'DOG', false, 'GUID1000'),
('GUID40001', 'BIRD', true, 'GUID1000');

INSERT INTO RepTable (RepGUID, Rep, EventID, IsActive) VALUES
('GUID10001', 'GUID1001', 'GUID2000', true);

INSERT INTO GamePlayers (Username, Email, PuzzleType, RepID, EventID, PlayerGUID) VALUES
('harri', 'harri@gmail.com', 'CAT', 'GUID10001', 'GUID2000', 'GUID100001'),
('val', 'val@gmail.com', 'DOG', 'GUID10001', 'GUID2000', 'GUID100002');