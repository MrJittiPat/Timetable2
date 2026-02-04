const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { runScheduler, OUTPUT_FILE } = require('./scheduler');

const app = express();
const PORT = 80;

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'contest_secret_key_2026',
    resave: false,
    saveUninitialized: true
}));

// --- MIDDLEWARE ---
function isAuthenticated(req, res, next) {
    if (req.session.loggedin) return next();
    res.redirect('/login');
}

function parseCSV(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split(/\r?\n/);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).filter(l => l.trim()).map(line => {
            const values = line.split(',').map(v => v.trim());
            let obj = {};
            headers.forEach((h, i) => obj[h] = values[i] || '');
            return obj;
        });
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        return [];
    }
}

// --- ROUTES ---

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) {
            req.session.loggedin = true;
            req.session.username = username;
            res.redirect('/dashboard');
        } else {
            res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }
    });
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    runScheduler();

    const rawSchedule = parseCSV(OUTPUT_FILE);
    const timeslots = parseCSV(path.join(__dirname, 'data', 'timeslot.csv'));
    const subjects = parseCSV(path.join(__dirname, 'data', 'subject.csv'));
    const teachersList = parseCSV(path.join(__dirname, 'data', 'teacher.csv'));
    const roomsList = parseCSV(path.join(__dirname, 'data', 'room.csv'));
    const groupsList = parseCSV(path.join(__dirname, 'data', 'student_group.csv'));

    // 1. Teacher Map
    const teacherMap = {};
    teachersList.forEach(t => {
        teacherMap[t.teacher_id] = t.teacher_name || t.teacher_id;
    });

    // 2. Room Map
    const roomMap = {};
    roomsList.forEach(r => {
        roomMap[r.room_id] = r.room_name || r.room_id;
    });

    // 3. Group Map (★ แก้ไขตรงนี้: ใช้ g.advisor ตามที่แจ้ง ★)
    const groupMap = {};
    groupsList.forEach(g => {
        // ใช้ g.advisor แทน advisor_id
        const advisorKey = g.advisor || '-';
        // พยายามหาชื่อครูจาก teacherMap ถ้าไม่เจอให้ใช้ค่าเดิมใน CSV
        const advisorName = teacherMap[advisorKey] || advisorKey;
        
        groupMap[g.group_id] = {
            name: g.group_name || g.group_id,
            advisor: advisorName
        };
    });

    // Subject Map
    const subjectMap = {};
    subjects.forEach(s => {
        subjectMap[s.subject_id] = {
            name: s.subject_name,
            theory: s.theory || 0,
            practice: s.practice || 0,
            credit: s.credit || 0
        };
    });

    // Timeslot Map
    const timeslotMap = {};
    timeslots.forEach(ts => timeslotMap[ts.timeslot_id] = ts);

    // จัดกลุ่มข้อมูล
    const dataByGroup = {};
    const dataByTeacher = {};
    const dataByRoom = {};

    rawSchedule.forEach(item => {
        const tsInfo = timeslotMap[item.timeslot_id];
        if (!tsInfo) return;

        const day = tsInfo.day;
        const period = parseInt(tsInfo.period);
        const cellData = {
            subject_id: item.subject_id,
            group_id: item.group_id,
            teacher_id: item.teacher_id,
            room_id: item.room_id
        };

        if (!dataByGroup[item.group_id]) dataByGroup[item.group_id] = {};
        if (!dataByGroup[item.group_id][day]) dataByGroup[item.group_id][day] = {};
        dataByGroup[item.group_id][day][period] = cellData;

        if (!dataByTeacher[item.teacher_id]) dataByTeacher[item.teacher_id] = {};
        if (!dataByTeacher[item.teacher_id][day]) dataByTeacher[item.teacher_id][day] = {};
        dataByTeacher[item.teacher_id][day][period] = cellData;

        if (!dataByRoom[item.room_id]) dataByRoom[item.room_id] = {};
        if (!dataByRoom[item.room_id][day]) dataByRoom[item.room_id][day] = {};
        dataByRoom[item.room_id][day][period] = cellData;
    });

    res.render('dashboard', { 
        user: req.session.username,
        dataByGroup, dataByTeacher, dataByRoom,
        groupMap, teacherMap, roomMap, subjectMap,
        groups: Object.keys(dataByGroup).sort(),
        teachers: Object.keys(dataByTeacher).sort(),
        rooms: Object.keys(dataByRoom).sort(),
        daysOrder: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        periodsOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] 
    });
});

app.get('/download', isAuthenticated, (req, res) => {
    if (fs.existsSync(OUTPUT_FILE)) res.download(OUTPUT_FILE, 'output.csv');
    else res.send("File not found.");
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
});