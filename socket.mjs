import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(express.json());

// IMPORTANT: Only serve the HTML test file, not all files
// This prevents index.tsx and other TS files from being loaded as modules
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'webrtc-test.html'));
});

// Optional: Serve public assets (images, etc) but NOT source files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Improved signaling store: Keep offer/answer "sticky" (not cleared on read)
// ICE candidates are queued and consumed (shift) since they're one-time messages
const signalStore = {
  offer: null,
  answer: null,
  candidatesToInitiator: [],  // Queue of candidates meant for the initiator
  candidatesToResponder: []   // Queue of candidates meant for the responder
};

// POST - Peer (Initiator) sends offer
app.post('/api/offer', (req, res) => {
  console.log('📤 [Server] Received OFFER from initiator');
  signalStore.offer = req.body;
  res.json({ status: 'offer_stored' });
});

// GET - Peer (Responder) polls for offer
// Keep the offer stored so if the responder polls again, it still gets it
app.get('/api/offer', (req, res) => {
  if (signalStore.offer) {
    console.log('📥 [Server] Sending OFFER to responder');
    res.json(signalStore.offer);
  } else {
    console.log('⏳ [Server] No offer yet, responder waiting...');
    res.json({ waiting: true });
  }
});

// POST - Peer (Responder) sends answer
app.post('/api/answer', (req, res) => {
  console.log('📤 [Server] Received ANSWER from responder');
  signalStore.answer = req.body;
  res.json({ status: 'answer_stored' });
});

// GET - Peer (Initiator) polls for answer
// Keep the answer stored so if the initiator polls again, it still gets it
app.get('/api/answer', (req, res) => {
  if (signalStore.answer) {
    console.log('📥 [Server] Sending ANSWER to initiator');
    res.json(signalStore.answer);
  } else {
    console.log('⏳ [Server] No answer yet, initiator waiting...');
    res.json({ waiting: true });
  }
});

// POST - ICE candidates from either peer
// from: 'initiator' or 'responder' (indicates WHO is sending)
app.post('/api/ice', (req, res) => {
  const { from, candidate } = req.body;
  
  if (from === 'initiator') {
    // Initiator is sending candidates to responder
    signalStore.candidatesToResponder.push(candidate);
    console.log(`🧊 [Server] ICE candidate from initiator -> responder (queue: ${signalStore.candidatesToResponder.length})`);
  } else if (from === 'responder') {
    // Responder is sending candidates to initiator
    signalStore.candidatesToInitiator.push(candidate);
    console.log(`🧊 [Server] ICE candidate from responder -> initiator (queue: ${signalStore.candidatesToInitiator.length})`);
  }
  
  res.json({ status: 'candidate_stored' });
});

// GET - Poll for ICE candidates
// role: 'initiator' or 'responder' (indicates WHICH peer is asking)
app.get('/api/ice/:role', (req, res) => {
  const role = req.params.role;
  
  // If asking role is 'initiator', give them candidates meant for initiator (from responder)
  // If asking role is 'responder', give them candidates meant for responder (from initiator)
  const queue = (role === 'initiator') ? signalStore.candidatesToInitiator : signalStore.candidatesToResponder;
  
  if (queue.length > 0) {
    const candidate = queue.shift(); // Consume one candidate
    console.log(`🧊 [Server] Sending ICE to ${role} (remaining in queue: ${queue.length})`);
    res.json({ candidate });
  } else {
    res.json({ waiting: true });
  }
});

// Reset for new test
app.post('/api/reset', (req, res) => {
  console.log('🔄 [Server] Resetting all peers and signaling data');
  signalStore.offer = null;
  signalStore.answer = null;
  signalStore.candidatesToInitiator = [];
  signalStore.candidatesToResponder = [];
  res.json({ status: 'reset' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ WebRTC Test Server running at http://localhost:${PORT}`);
  console.log(`📌 For two-device testing, use: http://<your-local-ip>:${PORT}`);
  console.log(`   (NOT localhost - use your actual machine IP like 192.168.1.x)\n`);
  console.log(`📱 Open http://localhost:${PORT} in TWO browser windows`);
  console.log(`\nFlow:`);
  console.log(`  1. Left browser (PORT 3000) - Click "ROLE: INITIATOR (Sends Offer)"`);
  console.log(`  2. Right browser (PORT 3000) - Click "ROLE: RESPONDER (Answers)"`);
  console.log(`  3. Both - Click "START WEBRTC")`);
  console.log(`  4. Wait for signaling and connection`);
  console.log(`  5. Test "SEND TEST AUDIO"\n`);
});
