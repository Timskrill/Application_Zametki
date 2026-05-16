const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8000', 'http://127.0.0.1:8000'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const dataPath = path.join(__dirname, 'data', 'tickets.json');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Папка data создана');
}

if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify([], null, 2));
    console.log('Файл tickets.json создан');
}

const readTickets = () => {
    try {
        const data = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка чтения файла:', error);
        return [];
    }
};

const writeTickets = (tickets) => {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(tickets, null, 2));
        return true;
    } catch (error) {
        console.error('Ошибка записи файла:', error);
        return false;
    }
};

app.get('/api/tickets', (req, res) => {
    try {
        const tickets = readTickets();
        res.json(tickets);
    } catch (error) {
        console.error('GET error:', error);
        res.status(500).json({ error: 'Ошибка при чтении заявок' });
    }
});

app.get('/api/tickets/:id', (req, res) => {
    try {
        const tickets = readTickets();
        const ticket = tickets.find(t => t.id === req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        res.json(ticket);
    } catch (error) {
        console.error('GET by id error:', error);
        res.status(500).json({ error: 'Ошибка при чтении заявки' });
    }
});

app.post('/api/tickets', (req, res) => {
    try {
        const { title, description, priority } = req.body;
        
        console.log('POST запрос:', { title, description, priority });
        
        if (!title || title.trim().length < 3) {
            return res.status(400).json({ error: 'Название должно содержать минимум 3 символа' });
        }
        
        if (!description || description.trim().length < 10) {
            return res.status(400).json({ error: 'Описание должно содержать минимум 10 символов' });
        }
        
        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({ error: 'Неверный приоритет' });
        }
        
        const tickets = readTickets();
        
        const newTicket = {
            id: Date.now().toString(),
            title: title.trim(),
            description: description.trim(),
            priority,
            status: 'new',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            synced: true
        };
        
        tickets.push(newTicket);
        writeTickets(tickets);
        
        console.log('Создана заявка:', newTicket.id);
        res.status(201).json(newTicket);
    } catch (error) {
        console.error('POST error:', error);
        res.status(500).json({ error: 'Ошибка при создании заявки' });
    }
});

app.patch('/api/tickets/:id', (req, res) => {
    try {
        const tickets = readTickets();
        const index = tickets.findIndex(t => t.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        const { status, title, description, priority } = req.body;
        
        const validStatuses = ['new', 'in_progress', 'completed'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Неверный статус' });
        }
        
        if (title && title.trim().length < 3) {
            return res.status(400).json({ error: 'Название должно содержать минимум 3 символа' });
        }
        
        const updatedTicket = {
            ...tickets[index],
            ...(title && { title: title.trim() }),
            ...(description && { description: description.trim() }),
            ...(priority && { priority }),
            ...(status && { status }),
            updatedAt: new Date().toISOString(),
            synced: true
        };
        
        tickets[index] = updatedTicket;
        writeTickets(tickets);
        
        console.log('Обновлена заявка:', req.params.id);
        res.json(updatedTicket);
    } catch (error) {
        console.error('PATCH error:', error);
        res.status(500).json({ error: 'Ошибка при обновлении заявки' });
    }
});

app.delete('/api/tickets/:id', (req, res) => {
    try {
        const tickets = readTickets();
        const filtered = tickets.filter(t => t.id !== req.params.id);
        
        if (filtered.length === tickets.length) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        writeTickets(filtered);
        console.log('Удалена заявка:', req.params.id);
        res.status(204).send();
    } catch (error) {
        console.error('DELETE error:', error);
        res.status(500).json({ error: 'Ошибка при удалении заявки' });
    }
});

app.post('/api/sync', (req, res) => {
    try {
        const { tickets: ticketsToSync } = req.body;
        
        console.log('Sync запрос, заявок:', ticketsToSync?.length || 0);
        
        if (!Array.isArray(ticketsToSync)) {
            return res.status(400).json({ error: 'Неверный формат данных' });
        }
        
        const existingTickets = readTickets();
        
        for (const localTicket of ticketsToSync) {
            const existingIndex = existingTickets.findIndex(t => t.id === localTicket.id);
            
            if (existingIndex === -1) {
                existingTickets.push({
                    ...localTicket,
                    synced: true,
                    updatedAt: new Date().toISOString()
                });
                console.log('Добавлена новая заявка при синхронизации:', localTicket.id);
            } else if (localTicket.updatedAt > existingTickets[existingIndex].updatedAt) {
                existingTickets[existingIndex] = {
                    ...localTicket,
                    synced: true,
                    updatedAt: new Date().toISOString()
                };
                console.log('Обновлена заявка при синхронизации:', localTicket.id);
            }
        }
        
        writeTickets(existingTickets);
        
        res.json(existingTickets);
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Ошибка при синхронизации' });
    }
});

app.options('/api/*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`API доступно по адресу: http://localhost:${PORT}/api/tickets`);
});