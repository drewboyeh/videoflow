// server.js
const USERS_FILE = 'users.json';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');;

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });

const DB_FILE = 'videos.json';

const COMMENTS_FILE = 'comments.json';

// Helper to read/write users
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE));
}
function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// Helper to read/write video metadata
function readDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// List all videos
app.get('/api/videos', (req, res) => {
  res.json(readDB());
});

// User signup (firstName/lastName only)
app.post('/api/signup', (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: 'Please enter your first and last name.' });
  const users = readUsers();
  if (users.find(u => u.firstName.toLowerCase() === firstName.toLowerCase() && u.lastName.toLowerCase() === lastName.toLowerCase()))
    return res.status(409).json({ error: 'A user with that first and last name already exists.' });
  const user = { id: uuidv4(), firstName, lastName };
  users.push(user);
  writeUsers(users);
  res.json({ success: true, userId: user.id, firstName, lastName });
});

// User login (firstName/lastName only)
app.post('/api/login', (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: 'Please enter your first and last name.' });
  const users = readUsers();
  const user = users.find(u => u.firstName.toLowerCase() === firstName.toLowerCase() && u.lastName.toLowerCase() === lastName.toLowerCase());
  if (!user) return res.status(401).json({ error: 'No user found with that first and last name.' });
  res.json({ success: true, userId: user.id, firstName: user.firstName, lastName: user.lastName });
});

// Upload a video
app.post('/api/upload', upload.single('video'), (req, res) => {
  const { title, firstName, lastName, uploaderId } = req.body;
  const id = uuidv4();
  const ext = path.extname(req.file.originalname);
  const newPath = `uploads/${id}${ext}`;
  fs.renameSync(req.file.path, newPath);

  const author = `${firstName} ${lastName}`;
  const video = {
    id,
    title,
    author,
    url: `http://localhost:${PORT}/${newPath}`,
    uploaderId,
    uploadTime: new Date().toISOString()
  };
  const db = readDB();
  db.unshift(video);
  writeDB(db);
  res.json(video);
});

// Helper to read/write comments
function readComments() {
  if (!fs.existsSync(COMMENTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(COMMENTS_FILE));
}
function writeComments(data) {
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(data, null, 2));
}

// Delete a video (only by uploader)
app.delete('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const { uploaderId } = req.body;
  let db = readDB();
  const video = db.find(v => v.id === id);
  if (!video) return res.status(404).json({ error: 'Not found' });
  if (video.uploaderId !== uploaderId) return res.status(403).json({ error: 'Forbidden' });

  // Delete file
  try { fs.unlinkSync(path.join(__dirname, 'uploads', path.basename(video.url))); } catch {}
  db = db.filter(v => v.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// Get comments for a video
app.get('/api/comments/:videoId', (req, res) => {
  const { videoId } = req.params;
  const comments = readComments().filter(c => c.videoId === videoId);
  res.json(comments);
});

// Post a new comment
app.post('/api/comments/:videoId', (req, res) => {
  const { videoId } = req.params;
  const { text, firstName, lastName, commenterId } = req.body;
  if (!text || !firstName || !lastName || !commenterId) return res.status(400).json({ error: 'Missing fields' });
  const author = `${firstName} ${lastName}`;
  const comment = {
    id: uuidv4(),
    videoId,
    text,
    author,
    commenterId,
    time: new Date().toISOString()
  };
  const comments = readComments();
  comments.push(comment);
  writeComments(comments);
  res.json(comment);
});

// Delete a comment (only by commenter)
app.delete('/api/comments/:commentId', (req, res) => {
  const { commentId } = req.params;
  const { commenterId } = req.body;
  let comments = readComments();
  const comment = comments.find(c => c.id === commentId);
  if (!comment) return res.status(404).json({ error: 'Not found' });
  if (comment.commenterId !== commenterId) return res.status(403).json({ error: 'Forbidden' });
  comments = comments.filter(c => c.id !== commentId);
  writeComments(comments);
  res.json({ success: true });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

