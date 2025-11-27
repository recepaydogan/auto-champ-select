import fs from 'fs';

const queues = JSON.parse(fs.readFileSync('queues.json', 'utf8'));
const practiceQueue = queues.find(q => q.name === 'Practice Tool' || (q.description && q.description.includes('Practice')) || q.gameMode === 'PRACTICETOOL');
if (practiceQueue) {
    console.log(practiceQueue.id);
} else {
    console.log('Not found');
}
