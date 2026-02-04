// database.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.db');

db.serialize(() => {
    // 1. สร้างตาราง users ถ้ายังไม่มี
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    // 2. เพิ่ม User เริ่มต้น (ถ้ายังไม่มี)
    // Username: admin, Password: 1234
    db.get("SELECT * FROM users WHERE username = ?", ['admin'], (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', '1234']);
            console.log("Default user created: admin / 1234");
        }
    });
});

module.exports = db;