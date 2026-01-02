const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'db', 'reservations.sqlite');
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const seedPath = path.join(__dirname, '..', 'db', 'seed.sql');

const db = new sqlite3.Database(dbPath);

const schemaSql = fs.readFileSync(schemaPath, 'utf8');
const seedSql = fs.readFileSync(seedPath, 'utf8');

db.serialize(() => {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schemaSql);
  db.exec(seedSql);
});

db.close();

console.log('Database initialized at', dbPath);
