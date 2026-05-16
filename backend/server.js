const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const dataDir = path.join(__dirname, 'data');
const dataPath = path.join(dataDir, 'tickets.json');

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
        console.error('Ошибка чтения файла:', error.message);
        return [];
    }
};

const writeTickets = (tickets) => {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(tickets, null, 2));
        return true;
    } catch (error) {
        console.error('Ошибка записи файла:', error.message);
        return false;
    }
};

app.get('/api/tickets', (req, res) => {
    try {
        const tickets = readTickets();
        console.log(`GET /api/tickets - возвращено ${tickets.length} заявок`);
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
        
        console.log(`GET /api/tickets/${req.params.id} - найдено`);
        res.json(ticket);
    } catch (error) {
        console.error('GET by id error:', error);
        res.status(500).json({ error: 'Ошибка при чтении заявки' });
    }
});

app.post('/api/tickets', (req, res) => {
    try {
        const { id, title, description, priority } = req.body;
        
        console.log('POST запрос:', { id, title: title?.substring(0, 30), priority });
        
        if (!title || title.trim().length < 3) {
            return res.status(400).json({ error: 'Название должно содержать минимум 3 символа' });
        }
        
        if (!description || description.trim().length < 10) {
            return res.status(400).json({ error: 'Описание должно содержать минимум 10 символов' });
        }
        
        const validPriorities = ['low', 'medium', 'high'];
        if (!priority || !validPriorities.includes(priority)) {
            return res.status(400).json({ error: 'Неверный приоритет' });
        }
        
        const tickets = readTickets();
        const existingIndex = tickets.findIndex(t => t.id === id);
        
        let newTicket;
        
        if (existingIndex !== -1 && id) {
            newTicket = {
                ...tickets[existingIndex],
                title: title.trim(),
                description: description.trim(),
                priority: priority,
                updatedAt: new Date().toISOString(),
                synced: true
            };
            tickets[existingIndex] = newTicket;
            writeTickets(tickets);
            console.log(`Обновлена существующая заявка: ${id}`);
            return res.status(200).json(newTicket);
        } else {
            const newId = id || Date.now().toString();
            newTicket = {
                id: newId,
                title: title.trim(),
                description: description.trim(),
                priority: priority,
                status: 'new',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                synced: true
            };
            tickets.push(newTicket);
            writeTickets(tickets);
            console.log(`Создана новая заявка: ${newId}`);
            return res.status(201).json(newTicket);
        }
        
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
        
        console.log(`PATCH /api/tickets/${req.params.id} - обновлено`);
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
        console.log(`DELETE /api/tickets/${req.params.id} - удалено`);
        res.status(204).send();
    } catch (error) {
        console.error('DELETE error:', error);
        res.status(500).json({ error: 'Ошибка при удалении заявки' });
    }
});

app.post('/api/sync', (req, res) => {
    try {
        const { tickets: ticketsToSync } = req.body;
        
        console.log(`Sync запрос, получено ${ticketsToSync?.length || 0} заявок`);
        
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
                console.log(`Добавлена новая заявка: ${localTicket.id}`);
            } else if (localTicket.updatedAt > existingTickets[existingIndex].updatedAt) {
                existingTickets[existingIndex] = {
                    ...localTicket,
                    synced: true,
                    updatedAt: new Date().toISOString()
                };
                console.log(`Обновлена заявка: ${localTicket.id}`);
            } else {
                console.log(`Пропущена (сервер новее): ${localTicket.id}`);
            }
        }
        
        const success = writeTickets(existingTickets);
        
        if (!success) {
            return res.status(500).json({ error: 'Ошибка при сохранении данных' });
        }
        
        console.log(`Синхронизация завершена, всего заявок: ${existingTickets.length}`);
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
    res.status(200).send();
});

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Сервер заявок работает',
        endpoints: [
            'GET  /api/tickets',
            'GET  /api/tickets/:id',
            'POST /api/tickets',
            'PATCH /api/tickets/:id',
            'DELETE /api/tickets/:id',
            'POST /api/sync'
        ]
    });
});

app.listen(PORT, () => {
    console.log('');
    console.log('СЕРВЕР ЗАЯВОК ЗАПУЩЕН');
    console.log('');
    console.log(`Порт: ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api/tickets`);
    console.log(`Данные: ${dataPath}`);
    console.log('');
    
    const tickets = readTickets();
    console.log(`Текущее количество заявок: ${tickets.length}`);
    console.log('');
});