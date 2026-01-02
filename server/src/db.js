const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'db', 'reservations.sqlite');
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

const db = new sqlite3.Database(dbPath);

db.exec(fs.readFileSync(schemaPath, 'utf8'));

db.run('PRAGMA foreign_keys = ON');

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

module.exports = {
  db,
  run,
  get,
  all,
  dbPath
};
