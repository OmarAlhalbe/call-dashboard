const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const dataFile = path.join(dataDir, 'data.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify([]));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname)); // Serve frontend files

// Setup Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fieldSize: 50 * 1024 * 1024 } // Increase field size limit to 50MB
});


// API: Get all data
app.get('/api/data', (req, res) => {
    try {
        const rawData = fs.readFileSync(dataFile, 'utf8');
        res.json(JSON.parse(rawData));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// API: Upload files and append data
app.post('/api/upload', upload.array('files'), (req, res) => {
    try {
        const newDataString = req.body.parsedData;
        if (newDataString) {
            const newData = JSON.parse(newDataString);
            const currentDataRaw = fs.readFileSync(dataFile, 'utf8');
            let currentData = JSON.parse(currentDataRaw);
            
            // Append new data
            currentData = currentData.concat(newData);
            
            // Save back to file
            fs.writeFileSync(dataFile, JSON.stringify(currentData));
        }
        res.json({ message: 'Upload successful', files: req.files });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to process upload' });
    }
});

// API: Clear data
app.post('/api/clear', (req, res) => {
    try {
        // Empty the data.json file
        fs.writeFileSync(dataFile, JSON.stringify([]));
        
        // Clear uploads directory
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
            fs.unlinkSync(path.join(uploadsDir, file));
        }
        
        res.json({ message: 'Data cleared successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to clear data' });
    }
});
// API: Edit records for a specific upload
app.post('/api/edit-upload', (req, res) => {
    try {
        const { sourceFile, uploadTime, newSector, newBranch } = req.body;
        const currentDataRaw = fs.readFileSync(dataFile, 'utf8');
        let currentData = JSON.parse(currentDataRaw);
        
        currentData = currentData.map(r => {
            if (r.sourceFile === sourceFile && r.uploadTime === uploadTime) {
                r.sector = newSector;
                r.branch = newBranch;
                r.id = `${r.branch}_${r['Date Time']}_${r['From Number']}_${r['To Number']}_${r['Duration']}_${r['Type']}_${r.uploadTime}`;
            }
            return r;
        });
        
        fs.writeFileSync(dataFile, JSON.stringify(currentData));
        res.json({ message: 'Records updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update records' });
    }
});

// API: Delete records for a specific upload
app.post('/api/delete-upload', (req, res) => {
    try {
        const { sourceFile, uploadTime } = req.body;
        const currentDataRaw = fs.readFileSync(dataFile, 'utf8');
        let currentData = JSON.parse(currentDataRaw);
        
        const initialLength = currentData.length;
        currentData = currentData.filter(r => !(r.sourceFile === sourceFile && r.uploadTime === uploadTime));
        
        if (currentData.length === initialLength) {
            return res.status(404).json({ message: 'No records found to delete' });
        }
        
        fs.writeFileSync(dataFile, JSON.stringify(currentData));
        res.json({ message: 'Records deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete records' });
    }
});
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
