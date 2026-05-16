let tickets = [];
let offlineQueue = [];
let isOnline = navigator.onLine;

const ticketsList = document.getElementById('ticketsList');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const syncBtn = document.getElementById('syncBtn');
const addTicketBtn = document.getElementById('addTicketBtn');
const modal = document.getElementById('ticketModal');
const ticketForm = document.getElementById('ticketForm');
const modalTitle = document.getElementById('modalTitle');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const statusIndicator = document.getElementById('statusIndicator');

const API_URL = 'http://localhost:3001/api';

async function init() {
    await loadFromLocalStorage();
    await loadFromServer();
    setupEventListeners();
    setupNetworkListeners();
    updateUI();
    checkPendingSync();
}

async function loadFromLocalStorage() {
    const savedTickets = localStorage.getItem('tickets');
    const savedQueue = localStorage.getItem('offlineQueue');
    
    if (savedTickets) {
        tickets = JSON.parse(savedTickets);
        console.log('Загружено из localStorage:', tickets.length, 'заявок');
    }
    
    if (savedQueue) {
        offlineQueue = JSON.parse(savedQueue);
    }
}

function saveToLocalStorage() {
    localStorage.setItem('tickets', JSON.stringify(tickets));
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
}

async function loadFromServer() {
    if (!isOnline) return;
    
    try {
        console.log('Загрузка с сервера...');
        const response = await fetch(`${API_URL}/tickets`);
        if (response.ok) {
            const serverTickets = await response.json();
            console.log('Загружено с сервера:', serverTickets.length, 'заявок');
            
            const mergedTickets = mergeTickets(tickets, serverTickets);
            tickets = mergedTickets;
            saveToLocalStorage();
            updateUI();
        }
    } catch (error) {
        console.log('Не удалось загрузить с сервера:', error);
    }
}

function mergeTickets(localTickets, serverTickets) {
    const merged = [...serverTickets];
    
    for (const localTicket of localTickets) {
        const existingIndex = merged.findIndex(t => t.id === localTicket.id);
        
        if (existingIndex === -1 && !localTicket.synced) {
            merged.push(localTicket);
        } else if (existingIndex !== -1 && !localTicket.synced) {
            if (localTicket.updatedAt > merged[existingIndex].updatedAt) {
                merged[existingIndex] = localTicket;
            }
        }
    }
    
    return merged;
}

async function syncWithServer() {
    if (!isOnline) {
        showNotification('Нет соединения с интернетом. Заявки будут синхронизированы позже.', 'warning');
        return;
    }
    
    syncBtn.disabled = true;
    syncBtn.textContent = 'Синхронизация...';
    
    try {
        const unsyncedTickets = tickets.filter(t => !t.synced);
        
        if (unsyncedTickets.length === 0) {
            showNotification('Нет данных для синхронизации', 'info');
            return;
        }
        
        console.log('Начинаем синхронизацию:', unsyncedTickets.length, 'заявок');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const ticket of unsyncedTickets) {
            try {
                console.log(`Синхронизация заявки ${ticket.id}: ${ticket.title}`);
                
                const response = await fetch(`${API_URL}/tickets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: ticket.title,
                        description: ticket.description,
                        priority: ticket.priority
                    })
                });
                
                if (response.ok) {
                    const updatedTicket = await response.json();
                    const index = tickets.findIndex(t => t.id === ticket.id);
                    if (index !== -1) {
                        tickets[index] = { ...updatedTicket, synced: true };
                    }
                    successCount++;
                    console.log(`Заявка ${ticket.id} синхронизирована`);
                } else {
                    const error = await response.json();
                    console.error(`Ошибка ${ticket.id}:`, error);
                    errorCount++;
                }
            } catch (err) {
                console.error(`Ошибка при синхронизации ${ticket.id}:`, err);
                errorCount++;
            }
        }
        
        saveToLocalStorage();
        updateUI();
        
        if (errorCount === 0) {
            showNotification(`Синхронизировано ${successCount} заявок`, 'success');
        } else {
            showNotification(`Синхронизировано ${successCount}, ошибок: ${errorCount}`, 'warning');
        }
        
    } catch (error) {
        console.error('Критическая ошибка синхронизации:', error);
        showNotification('Ошибка синхронизации: ' + error.message, 'error');
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Синхронизация';
    }
}

async function createTicket(ticketData) {
    const newTicket = {
        id: Date.now().toString(),
        ...ticketData,
        status: 'new',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        synced: false
    };
    
    tickets.unshift(newTicket);
    saveToLocalStorage();
    updateUI();
    
    if (isOnline) {
        await syncWithServer();
    } else {
        showNotification('Заявка сохранена локально. Будет синхронизирована при появлении интернета.', 'info');
    }
}

async function updateTicket(id, updates) {
    const index = tickets.findIndex(t => t.id === id);
    if (index === -1) return;
    
    tickets[index] = {
        ...tickets[index],
        ...updates,
        updatedAt: new Date().toISOString(),
        synced: false
    };
    
    saveToLocalStorage();
    updateUI();
    
    if (isOnline) {
        await syncWithServer();
    }
}

async function deleteTicket(id) {
    if (!confirm('Вы уверены, что хотите удалить заявку?')) return;
    
    tickets = tickets.filter(t => t.id !== id);
    saveToLocalStorage();
    updateUI();
    
    if (isOnline) {
        try {
            await fetch(`${API_URL}/tickets/${id}`, { method: 'DELETE' });
            showNotification('Заявка удалена', 'success');
        } catch (error) {
            console.error('Ошибка удаления на сервере:', error);
        }
    }
}

function getFilteredTickets() {
    const statusValue = statusFilter.value;
    const priorityValue = priorityFilter.value;
    
    return tickets.filter(ticket => {
        const statusMatch = statusValue === 'all' || ticket.status === statusValue;
        const priorityMatch = priorityValue === 'all' || ticket.priority === priorityValue;
        return statusMatch && priorityMatch;
    });
}

function updateUI() {
    const filtered = getFilteredTickets();
    
    if (filtered.length === 0) {
        ticketsList.innerHTML = `
            <div class="empty-state">
                <p>Нет заявок</p>
                <button class="btn-primary" onclick="document.getElementById('addTicketBtn').click()">
                    Создать первую заявку
                </button>
            </div>
        `;
        return;
    }
    
    ticketsList.innerHTML = filtered.map(ticket => `
        <div class="ticket-card ${!ticket.synced ? 'unsynced' : ''}">
            <div class="ticket-header">
                <h3 class="ticket-title">${escapeHtml(ticket.title)}</h3>
                <div class="ticket-badges">
                    <span class="badge badge-priority-${ticket.priority}">
                        ${getPriorityText(ticket.priority)}
                    </span>
                    <span class="badge badge-status-${ticket.status}">
                        ${getStatusText(ticket.status)}
                    </span>
                    ${!ticket.synced ? '<span class="badge" style="background:#FEF3C7;color:#D97706;">Локально</span>' : ''}
                </div>
            </div>
            <div class="ticket-description">
                ${escapeHtml(ticket.description)}
            </div>
            <div class="ticket-meta">
                <div class="ticket-date">
                    ${new Date(ticket.createdAt).toLocaleString('ru-RU')}
                </div>
                <div class="ticket-actions">
                    <button class="btn-secondary" onclick="editTicket('${ticket.id}')">Редактировать</button>
                    <button class="btn-danger" onclick="deleteTicket('${ticket.id}')">Удалить</button>
                </div>
            </div>
        </div>
    `).join('');
}

function getPriorityText(priority) {
    const map = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
    return map[priority] || priority;
}

function getStatusText(status) {
    const map = { new: 'Новая', in_progress: 'В работе', completed: 'Завершена' };
    return map[status] || status;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function editTicket(id) {
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return;
    
    document.getElementById('ticketId').value = ticket.id;
    document.getElementById('title').value = ticket.title;
    document.getElementById('description').value = ticket.description;
    document.getElementById('priority').value = ticket.priority;
    document.getElementById('status').value = ticket.status;
    modalTitle.textContent = 'Редактирование заявки';
    modal.classList.add('active');
}

function addTicket() {
    document.getElementById('ticketId').value = '';
    document.getElementById('title').value = '';
    document.getElementById('description').value = '';
    document.getElementById('priority').value = 'medium';
    document.getElementById('status').value = 'new';
    modalTitle.textContent = 'Создание заявки';
    modal.classList.add('active');
}

ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('ticketId').value;
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;
    const priority = document.getElementById('priority').value;
    const status = document.getElementById('status').value;
    
    if (!title || title.length < 3) {
        alert('Название должно содержать минимум 3 символа');
        return;
    }
    
    if (!description || description.length < 10) {
        alert('Описание должно содержать минимум 10 символов');
        return;
    }
    
    if (id) {
        await updateTicket(id, { title, description, priority, status });
    } else {
        await createTicket({ title, description, priority });
    }
    
    modal.classList.remove('active');
});

function closeModal() {
    modal.classList.remove('active');
}

if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
const modalClose = document.querySelector('.modal-close');
if (modalClose) modalClose.addEventListener('click', closeModal);
if (modal) modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

function setupEventListeners() {
    if (statusFilter) statusFilter.addEventListener('change', updateUI);
    if (priorityFilter) priorityFilter.addEventListener('change', updateUI);
    if (addTicketBtn) addTicketBtn.addEventListener('click', addTicket);
    if (syncBtn) syncBtn.addEventListener('click', syncWithServer);
}

function setupNetworkListeners() {
    window.addEventListener('online', () => {
        isOnline = true;
        updateOnlineStatus();
        checkPendingSync();
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        updateOnlineStatus();
    });
}

function updateOnlineStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (!statusDot || !statusText) return;
    
    if (isOnline) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Онлайн';
        if (syncBtn) syncBtn.disabled = false;
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Офлайн';
        if (syncBtn) syncBtn.disabled = true;
    }
}

async function checkPendingSync() {
    if (isOnline && tickets.some(t => !t.synced)) {
        console.log('Обнаружены несинхронизированные заявки, запускаем синхронизацию...');
        await syncWithServer();
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.textContent = message;
    const bgColor = type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : type === 'warning' ? '#F59E0B' : '#3B82F6';
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${bgColor};
        color: white;
        border-radius: 8px;
        z-index: 2000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        font-size: 14px;
        font-weight: 500;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

updateOnlineStatus();

init();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(registration => {
            console.log('Service Worker зарегистрирован:', registration);
        })
        .catch(error => {
            console.log('Ошибка регистрации Service Worker:', error);
        });
}