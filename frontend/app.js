let tickets = [];
let isOnline = false;
let syncInProgress = false;
let onlineCheckInterval = null;

const ticketsList = document.getElementById('ticketsList');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const syncBtn = document.getElementById('syncBtn');
const addTicketBtn = document.getElementById('addTicketBtn');
const ticketsCount = document.getElementById('ticketsCount');
const modal = document.getElementById('ticketModal');
const ticketForm = document.getElementById('ticketForm');
const modalTitle = document.getElementById('modalTitle');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const API_URL = '/api';

async function init() {
    loadFromLocalStorage();
    await loadFromServer();
    setupEventListeners();
    setupNetworkListeners();
    updateUI();
    await checkAndUpdateOnlineStatus();
    startPeriodicOnlineCheck();
}

async function checkRealOnlineStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${API_URL}/tickets`, {
            method: 'HEAD',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return response.ok || response.status < 500;
    } catch (error) {
        return false;
    }
}

async function checkAndUpdateOnlineStatus() {
    const nowOnline = await checkRealOnlineStatus();
    
    if (isOnline !== nowOnline) {
        isOnline = nowOnline;
        updateOnlineStatusUI();
        
        if (isOnline) {
            showNotification('Интернет появился', 'success');
            await loadFromServer();
            updateUI();
        } else {
            showNotification('Интернет пропал. Работаем офлайн', 'warning');
        }
    }
    return isOnline;
}

function startPeriodicOnlineCheck() {
    if (onlineCheckInterval) clearInterval(onlineCheckInterval);
    onlineCheckInterval = setInterval(async () => {
        await checkAndUpdateOnlineStatus();
    }, 5000);
}

function updateOnlineStatusUI() {
    if (statusDot && statusText) {
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
}

function setupNetworkListeners() {
    window.addEventListener('online', async () => {
        await checkAndUpdateOnlineStatus();
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        updateOnlineStatusUI();
        showNotification('Интернет пропал', 'warning');
    });
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('tickets');
    if (saved) {
        try {
            tickets = JSON.parse(saved);
        } catch (e) {
            tickets = [];
        }
    }
}

function saveToLocalStorage() {
    localStorage.setItem('tickets', JSON.stringify(tickets));
}

async function loadFromServer() {
    if (!isOnline) return;
    
    try {
        const response = await fetch(`${API_URL}/tickets`);
        
        if (response.ok) {
            const serverTickets = await response.json();
            
            const mergedTickets = [];
            const processedIds = new Set();
            
            for (const serverTicket of serverTickets) {
                mergedTickets.push({
                    ...serverTicket,
                    synced: true
                });
                processedIds.add(serverTicket.id);
            }
            
            for (const localTicket of tickets) {
                if (localTicket.synced) continue;
                if (processedIds.has(localTicket.id)) continue;
                
                mergedTickets.push({
                    ...localTicket,
                    synced: false
                });
            }
            
            mergedTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            tickets = mergedTickets;
            saveToLocalStorage();
            updateUI();
        }
    } catch (error) {
        console.error('Load error:', error);
    }
}

async function syncWithServer() {
    if (!isOnline) {
        showNotification('Нет соединения с интернетом', 'error');
        return;
    }
    
    if (syncInProgress) {
        showNotification('Синхронизация уже выполняется', 'info');
        return;
    }
    
    const unsyncedTickets = tickets.filter(t => !t.synced && t.id.startsWith('local_'));
    
    if (unsyncedTickets.length === 0) {
        showNotification('Нет заявок для синхронизации', 'info');
        return;
    }
    
    syncInProgress = true;
    syncBtn.disabled = true;
    syncBtn.textContent = 'Синхронизация...';
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const localTicket of unsyncedTickets) {
        try {
            const response = await fetch(`${API_URL}/tickets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: localTicket.title,
                    description: localTicket.description,
                    priority: localTicket.priority
                })
            });
            
            if (response.ok) {
                const serverTicket = await response.json();
                
                const localIndex = tickets.findIndex(t => t.id === localTicket.id);
                if (localIndex !== -1) {
                    tickets[localIndex] = {
                        ...serverTicket,
                        synced: true
                    };
                }
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
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
    
    syncInProgress = false;
    syncBtn.disabled = false;
    syncBtn.textContent = 'Синхронизация';
    
    await loadFromServer();
}

async function createTicket(data) {
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newTicket = {
        id: localId,
        title: data.title.trim(),
        description: data.description.trim(),
        priority: data.priority,
        status: 'new',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        synced: false
    };
    
    tickets.unshift(newTicket);
    saveToLocalStorage();
    updateUI();
    showNotification('Заявка сохранена локально', 'success');
    
    if (isOnline) {
        await syncWithServer();
    }
}

async function updateTicket(id, data) {
    const index = tickets.findIndex(t => t.id === id);
    if (index === -1) return;
    
    const isLocalTicket = id.startsWith('local_');
    
    if (isLocalTicket) {
        tickets[index] = {
            ...tickets[index],
            title: data.title.trim(),
            description: data.description.trim(),
            priority: data.priority,
            status: data.status,
            updatedAt: new Date().toISOString(),
            synced: false
        };
        saveToLocalStorage();
        updateUI();
        showNotification('Локальная заявка обновлена', 'success');
        
        if (isOnline) {
            await syncWithServer();
        }
    } else {
        if (isOnline) {
            try {
                const response = await fetch(`${API_URL}/tickets/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    const updatedTicket = await response.json();
                    tickets[index] = { ...updatedTicket, synced: true };
                    saveToLocalStorage();
                    updateUI();
                    showNotification('Заявка обновлена', 'success');
                } else {
                    showNotification('Ошибка обновления', 'error');
                }
            } catch (error) {
                tickets[index] = {
                    ...tickets[index],
                    ...data,
                    updatedAt: new Date().toISOString(),
                    synced: false
                };
                saveToLocalStorage();
                updateUI();
                showNotification('Изменения сохранены локально', 'info');
            }
        } else {
            tickets[index] = {
                ...tickets[index],
                ...data,
                updatedAt: new Date().toISOString(),
                synced: false
            };
            saveToLocalStorage();
            updateUI();
            showNotification('Изменения сохранены локально', 'info');
        }
    }
}

async function deleteTicket(id) {
    if (!confirm('Вы уверены, что хотите удалить заявку?')) return;
    
    const index = tickets.findIndex(t => t.id === id);
    if (index === -1) return;
    
    const isLocalTicket = id.startsWith('local_');
    
    if (!isLocalTicket && isOnline) {
        try {
            await fetch(`${API_URL}/tickets/${id}`, { method: 'DELETE' });
            tickets.splice(index, 1);
            saveToLocalStorage();
            updateUI();
            showNotification('Заявка удалена', 'success');
        } catch (error) {
            showNotification('Ошибка удаления', 'error');
        }
    } else {
        tickets.splice(index, 1);
        saveToLocalStorage();
        updateUI();
        showNotification('Заявка удалена', 'success');
    }
}

function updateUI() {
    const filtered = getFilteredTickets();
    ticketsCount.textContent = filtered.length;
    
    if (filtered.length === 0) {
        ticketsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"></div>
                <p>У вас пока нет заявок</p>
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
                    ${!ticket.synced ? '<span class="badge badge-offline">Офлайн</span>' : ''}
                </div>
            </div>
            <div class="ticket-description">
                ${escapeHtml(ticket.description)}
            </div>
            <div class="ticket-meta">
                <div class="ticket-date">
                    ${formatDate(ticket.createdAt)}
                </div>
                <div class="ticket-actions">
                    <button class="btn-secondary" onclick="editTicket('${ticket.id}')">Редактировать</button>
                    <button class="btn-secondary" onclick="deleteTicket('${ticket.id}')">Удалить</button>
                </div>
            </div>
        </div>
    `).join('');
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

function getPriorityText(priority) {
    const map = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
    return map[priority] || priority;
}

function getStatusText(status) {
    const map = { new: 'Новая', in_progress: 'В работе', completed: 'Завершена' };
    return map[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function openModal(ticketId = null) {
    if (ticketId) {
        const ticket = tickets.find(t => t.id === ticketId);
        if (ticket) {
            document.getElementById('ticketId').value = ticket.id;
            document.getElementById('title').value = ticket.title;
            document.getElementById('description').value = ticket.description;
            document.getElementById('priority').value = ticket.priority;
            document.getElementById('status').value = ticket.status;
            modalTitle.textContent = 'Редактирование заявки';
        }
    } else {
        document.getElementById('ticketId').value = '';
        document.getElementById('title').value = '';
        document.getElementById('description').value = '';
        document.getElementById('priority').value = 'medium';
        document.getElementById('status').value = 'new';
        modalTitle.textContent = 'Новая заявка';
    }
    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
}

function editTicket(id) {
    openModal(id);
}

function addTicket() {
    openModal();
}

ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('ticketId').value;
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;
    const priority = document.getElementById('priority').value;
    const status = document.getElementById('status').value;
    
    if (!title || title.length < 3) {
        showNotification('Название должно содержать минимум 3 символа', 'error');
        return;
    }
    
    if (!description || description.length < 10) {
        showNotification('Описание должно содержать минимум 10 символов', 'error');
        return;
    }
    
    if (id) {
        await updateTicket(id, { title, description, priority, status });
    } else {
        await createTicket({ title, description, priority });
    }
    
    closeModal();
});

function setupEventListeners() {
    statusFilter.addEventListener('change', updateUI);
    priorityFilter.addEventListener('change', updateUI);
    addTicketBtn.addEventListener('click', addTicket);
    syncBtn.addEventListener('click', syncWithServer);
    cancelModalBtn.addEventListener('click', closeModal);
    modalCloseBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        info: '#6366F1'
    };
    
    notification.style.background = colors[type] || colors.info;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.error('SW error:', err));
}

init();