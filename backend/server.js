const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, '..', 'frontend');

if (!fs.existsSync(frontendPath)) {
    console.error('Frontend folder not found:', frontendPath);
} else {
    app.use(express.static(frontendPath));
}

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'tickets.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const readTickets = () => {
    try {
        if (!fs.existsSync(dataFile)) {
            fs.writeFileSync(dataFile, JSON.stringify([], null, 2));
            return [];
        }
        
        const data = fs.readFileSync(dataFile, 'utf8');
        
        if (!data || data.trim() === '') {
            fs.writeFileSync(dataFile, JSON.stringify([], null, 2));
            return [];
        }
        
        return JSON.parse(data);
    } catch (error) {
        console.error('Read error:', error.message);
        fs.writeFileSync(dataFile, JSON.stringify([], null, 2));
        return [];
    }
};

const writeTickets = (tickets) => {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(tickets, null, 2));
        return true;
    } catch (error) {
        console.error('Write error:', error.message);
        return false;
    }
};

app.get('/api/tickets', (req, res) => {
    try {
        const tickets = readTickets();
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/tickets/:id', (req, res) => {
    try {
        const tickets = readTickets();
        const ticket = tickets.find(t => t.id === req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tickets', (req, res) => {
    try {
        const { title, description, priority } = req.body;
        
        if (!title || title.trim().length < 3) {
            return res.status(400).json({ error: 'Title must be at least 3 characters' });
        }
        
        if (!description || description.trim().length < 10) {
            return res.status(400).json({ error: 'Description must be at least 10 characters' });
        }
        
        if (!priority || !['low', 'medium', 'high'].includes(priority)) {
            return res.status(400).json({ error: 'Invalid priority' });
        }
        
        const tickets = readTickets();
        
        const newTicket = {
            id: Date.now().toString(),
            title: title.trim(),
            description: description.trim(),
            priority,
            status: 'new',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        tickets.push(newTicket);
        writeTickets(tickets);
        
        res.status(201).json(newTicket);
    } catch (error) {
        res.status(500).json({ error: 'Error creating ticket' });
    }
});

app.patch('/api/tickets/:id', (req, res) => {
    try {
        const { status, title, description, priority } = req.body;
        const tickets = readTickets();
        const index = tickets.findIndex(t => t.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        if (status && !['new', 'in_progress', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        if (title && title.trim().length >= 3) tickets[index].title = title.trim();
        if (description && description.trim().length >= 10) tickets[index].description = description.trim();
        if (priority && ['low', 'medium', 'high'].includes(priority)) tickets[index].priority = priority;
        if (status) tickets[index].status = status;
        
        tickets[index].updatedAt = new Date().toISOString();
        
        writeTickets(tickets);
        res.json(tickets[index]);
    } catch (error) {
        res.status(500).json({ error: 'Error updating ticket' });
    }
});

app.delete('/api/tickets/:id', (req, res) => {
    try {
        const tickets = readTickets();
        const filtered = tickets.filter(t => t.id !== req.params.id);
        
        if (filtered.length === tickets.length) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        writeTickets(filtered);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Error deleting ticket' });
    }
});

app.head('/api/tickets', (req, res) => {
    res.status(200).end();
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    const indexPath = path.join(frontendPath, 'index.html');
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});