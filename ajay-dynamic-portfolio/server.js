const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4000;

const adminApp = express();
const ADMIN_PORT = 4001;

// Multer setup for handling video uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Database helper functions
const getDatabase = () => {
    const data = fs.readFileSync('database.json', 'utf8');
    return JSON.parse(data);
};

const saveDatabase = (data) => {
    fs.writeFileSync('database.json', JSON.stringify(data, null, 2));
};

// Create a Shared API Router
const apiRouter = express.Router();

// GET /api/content
apiRouter.get('/content', (req, res) => {
    try {
        const data = getDatabase();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read database' });
    }
});

// PUT /api/content (Full CMS Update)
apiRouter.put('/content', (req, res) => {
    try {
        const updatedData = req.body;
        const db = getDatabase();
        if (!updatedData.videos) {
            updatedData.videos = db.videos;
        }
        saveDatabase(updatedData);
        res.json({ message: 'Content updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during update' });
    }
});

// POST /api/upload-video
apiRouter.post('/upload-video', upload.single('video'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }
        const title = req.body.title || 'Untitled Achievement';
        const description = req.body.description || '';
        const db = getDatabase();
        const newVideo = {
            id: Date.now().toString(),
            title: title,
            description: description,
            filename: req.file.filename,
            url: `/uploads/${req.file.filename}`
        };
        db.videos.push(newVideo);
        saveDatabase(db);
        res.status(201).json({ message: 'Video uploaded successfully', video: newVideo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during upload' });
    }
});

// --- Main Portfolio App (Port 4000) ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // Serves index.html, style.css, script.js
app.use('/uploads', express.static('uploads'));
app.use('/api', apiRouter);

// --- Admin CMS App (Port 4001) ---
adminApp.use(cors());
adminApp.use(express.json({ limit: '10mb' }));
adminApp.use(express.static('admin')); // Serves admin/index.html
adminApp.use('/uploads', express.static('uploads')); // Just in case admin needs to view uploads
adminApp.use('/api', apiRouter);

app.listen(PORT, () => {
    console.log(`Portfolio is running on http://localhost:${PORT}`);
});

adminApp.listen(ADMIN_PORT, () => {
    console.log(`Admin CMS is running on http://localhost:${ADMIN_PORT}`);
});
