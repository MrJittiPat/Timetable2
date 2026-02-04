const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(__dirname, 'output.csv');

function readCSV(fileName) {
    const filePath = path.join(DATA_DIR, fileName);
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.trim().split(/\r?\n/);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).filter(l => l.trim()).map(line => {
            const values = line.split(',').map(v => v.trim());
            let obj = {};
            headers.forEach((h, i) => obj[h] = values[i] || '');
            return obj;
        });
    } catch (error) {
        console.error(`Error reading ${fileName}:`, error.message);
        return [];
    }
}

function runScheduler() {
    console.log("Scheduler: Processing started...");

    const teachers = readCSV('teacher.csv');
    const rooms = readCSV('room.csv');
    const studentGroups = readCSV('student_group.csv');
    const subjects = readCSV('subject.csv');
    const teachMap = readCSV('teach.csv');
    const timeslots = readCSV('timeslot.csv');
    const registers = readCSV('register.csv');

    // --- LOGIC ใหม่: จัดเรียงลำดับ Timeslot ---
    // แยกคาบปกติ (1-10) และคาบดึก (11-12)
    const normalSlots = timeslots.filter(t => parseInt(t.period) <= 10);
    const lateSlots = timeslots.filter(t => parseInt(t.period) > 10);
    
    // เอามารวมกัน โดยให้ Normal ขึ้นก่อนเสมอ
    // ผลลัพธ์: ระบบจะวนลูปหาที่ว่างในคาบ 1-10 ของทุกวันให้หมดก่อน แล้วค่อยไปดู 11-12
    const sortedTimeslots = [...normalSlots, ...lateSlots];

    const subjectDetails = {};
    subjects.forEach(s => {
        const theory = parseInt(s.theory) || 0;
        const practice = parseInt(s.practice) || 0;
        subjectDetails[s.subject_id] = { total_periods: theory + practice };
    });

    const subjectTeachers = {};
    teachMap.forEach(t => {
        if (!subjectTeachers[t.subject_id]) subjectTeachers[t.subject_id] = [];
        subjectTeachers[t.subject_id].push(t.teacher_id);
    });

    const schedule = [];
    const booked = { teachers: {}, rooms: {}, groups: {} };

    function isSlotFree(tsId, tId, rId, gId) {
        if (booked.teachers[tId]?.[tsId]) return false;
        if (booked.rooms[rId]?.[tsId]) return false;
        if (booked.groups[gId]?.[tsId]) return false;
        return true;
    }

    function bookSlot(tsId, tId, rId, gId) {
        if (!booked.teachers[tId]) booked.teachers[tId] = {}; booked.teachers[tId][tsId] = true;
        if (!booked.rooms[rId]) booked.rooms[rId] = {}; booked.rooms[rId][tsId] = true;
        if (!booked.groups[gId]) booked.groups[gId] = {}; booked.groups[gId][tsId] = true;
    }

    registers.forEach(reg => {
        const groupId = reg.group_id;
        const subjectId = reg.subject_id;
        const subj = subjectDetails[subjectId];
        
        if (!subj) return;
        
        let periodsNeeded = subj.total_periods;
        const possibleTeachers = subjectTeachers[subjectId];
        
        if (!possibleTeachers || possibleTeachers.length === 0) return;
        
        let selectedTeacher = possibleTeachers[0];
        let assignedCount = 0;

        // ใช้ sortedTimeslots แทน timeslots เดิม
        for (const slot of sortedTimeslots) {
            if (assignedCount >= periodsNeeded) break;
            
            const tsId = slot.timeslot_id;
            const period = parseInt(slot.period);

            // พักเที่ยงคาบ 5 เหมือนเดิม
            if (period === 5) continue; 

            let selectedRoom = null;
            for (const r of rooms) {
                if (isSlotFree(tsId, selectedTeacher, r.room_id, groupId)) {
                    selectedRoom = r.room_id;
                    break;
                }
            }

            if (selectedRoom) {
                schedule.push({
                    group_id: groupId,
                    timeslot_id: tsId,
                    subject_id: subjectId,
                    teacher_id: selectedTeacher,
                    room_id: selectedRoom
                });
                bookSlot(tsId, selectedTeacher, selectedRoom, groupId);
                assignedCount++;
            }
        }
    });

    const csvHeader = 'group_id,timeslot_id,subject_id,teacher_id,room_id\n';
    const csvRows = schedule.map(s => 
        `${s.group_id},${s.timeslot_id},${s.subject_id},${s.teacher_id},${s.room_id}`
    ).join('\n');

    try {
        fs.writeFileSync(OUTPUT_FILE, csvHeader + csvRows);
        console.log(`Scheduler: Saved ${schedule.length} records (Priority 1-10 enforced).`);
    } catch (err) {
        console.error("Scheduler Error:", err);
    }
}

module.exports = { runScheduler, OUTPUT_FILE };