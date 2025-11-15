// Application State
let appState = {
    plexIp: null,
    plexToken: null,
    selectedSections: [1, 2],
    theme: 'dark',
    accentColor: '#3b82f6',
    allItems: [],
    currentResult: null
};

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const mainScreen = document.getElementById('main-screen');
const setupForm = document.getElementById('setup-form');
const settingsPanel = document.getElementById('settings-panel');
const settingsBtn = document.getElementById('settings-btn');
const closeSettings = document.getElementById('close-settings');
const editCredentialsBtn = document.getElementById('edit-credentials-btn');
const sectionToggles = document.querySelectorAll('.toggle-label input[type="checkbox"]');
const slotMachineContainer = document.getElementById('slot-machine-container');
const slotMachine = document.getElementById('slot-machine');
const resultContainer = document.getElementById('result-container');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');

// Cookie Management
function setCookie(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

// Load state from cookies
function loadStateFromCookies() {
    appState.plexIp = getCookie('plexIp');
    appState.plexToken = getCookie('plexToken');
    appState.theme = getCookie('theme') || 'dark';
    appState.accentColor = getCookie('accentColor') || '#3b82f6';
    
    const savedSections = getCookie('selectedSections');
    if (savedSections) {
        appState.selectedSections = JSON.parse(savedSections);
    }
}

// Save state to cookies
function saveStateToCookies() {
    if (appState.plexIp) setCookie('plexIp', appState.plexIp);
    if (appState.plexToken) setCookie('plexToken', appState.plexToken);
    setCookie('theme', appState.theme);
    setCookie('accentColor', appState.accentColor);
    setCookie('selectedSections', JSON.stringify(appState.selectedSections));
}

// Theme Management
function applyTheme() {
    document.documentElement.setAttribute('data-theme', appState.theme);
    document.documentElement.style.setProperty('--accent-color', appState.accentColor);
    
    // Calculate hover color (lighter version)
    const hoverColor = adjustBrightness(appState.accentColor, 20);
    document.documentElement.style.setProperty('--accent-hover', hoverColor);
}

function adjustBrightness(color, amount) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// API Functions
async function validateCredentials(plexIp, plexToken) {
    try {
        const response = await fetch('/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plexIp, plexToken })
        });
        const data = await response.json();
        return { success: response.ok, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function fetchSections() {
    try {
        const params = new URLSearchParams({
            plexIp: appState.plexIp,
            plexToken: appState.plexToken
        });
        const response = await fetch(`/api/sections?${params}`);
        if (!response.ok) throw new Error('Failed to fetch sections');
        return await response.json();
    } catch (error) {
        showError('Failed to load library sections: ' + error.message);
        return null;
    }
}

async function fetchAllItems() {
    try {
        const params = new URLSearchParams({
            plexIp: appState.plexIp,
            plexToken: appState.plexToken,
            sections: appState.selectedSections.join(',')
        });
        const response = await fetch(`/api/items?${params}`);
        if (!response.ok) throw new Error('Failed to fetch items');
        const data = await response.json();
        return data.items || [];
    } catch (error) {
        showError('Failed to load items: ' + error.message);
        return [];
    }
}

async function fetchRandomItem() {
    try {
        const params = new URLSearchParams({
            plexIp: appState.plexIp,
            plexToken: appState.plexToken,
            sections: appState.selectedSections.join(',')
        });
        const response = await fetch(`/api/random?${params}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch random item');
        }
        return await response.json();
    } catch (error) {
        showError('Failed to get random item: ' + error.message);
        return null;
    }
}

// Error Handling
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

function hideError() {
    errorMessage.classList.add('hidden');
}

// Slot Machine Animation
let animationId = null;
let animationStartTime = null;
let animationDuration = 0;
let startPosition = 0;
let targetPosition = 0;
let selectedItemIndex = 0;

function createSlotMachine(items) {
    slotMachine.innerHTML = '';
    
    // Duplicate items for seamless scrolling
    const duplicatedItems = [...items, ...items, ...items];
    
    duplicatedItems.forEach((item, index) => {
        const slotItem = document.createElement('div');
        slotItem.className = 'slot-item';
        slotItem.dataset.index = index;
        
        const img = document.createElement('img');
        img.src = item.posterUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="%23ccc"/></svg>';
        img.alt = item.title || 'Poster';
        img.onerror = function() {
            this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="%23ccc"/></svg>';
        };
        
        slotItem.appendChild(img);
        slotMachine.appendChild(slotItem);
    });
}

function startSlotMachineAnimation(items) {
    if (items.length === 0) {
        showError('No items available in selected sections');
        return;
    }
    
    // Hide result, show slot machine
    resultContainer.classList.add('hidden');
    slotMachineContainer.classList.remove('hidden');
    
    createSlotMachine(items);
    
    // Calculate positions
    const itemWidth = 320; // 300px width + 20px margin
    const totalItems = items.length * 3; // We duplicated items 3 times
    const totalWidth = totalItems * itemWidth;
    const containerWidth = slotMachineContainer.offsetWidth;
    
    // Select random item (from first set of items)
    selectedItemIndex = Math.floor(Math.random() * items.length);
    
    // Calculate target position to center selected item
    // We want to center an item from the middle set (items.length to items.length * 2)
    const middleSetStart = items.length;
    const targetIndex = middleSetStart + selectedItemIndex;
    targetPosition = (targetIndex * itemWidth) - (containerWidth / 2) + (itemWidth / 2);
    
    // Start from a random position in the first set
    startPosition = Math.random() * (items.length * itemWidth);
    
    // Random duration: 4-6 seconds (5s ± 1s)
    animationDuration = 4000 + Math.random() * 2000; // 4000-6000ms
    
    // Set initial position
    slotMachine.style.transform = `translateX(-${startPosition}px)`;
    
    // Start animation
    animationStartTime = performance.now();
    animateSlotMachine();
}

function animateSlotMachine() {
    const currentTime = performance.now();
    const elapsed = currentTime - animationStartTime;
    const progress = Math.min(elapsed / animationDuration, 1);
    
    // Easing function (ease-out cubic)
    const easeOutCubic = 1 - Math.pow(1 - progress, 3);
    
    // Calculate current position
    const currentPosition = startPosition + (targetPosition - startPosition) * easeOutCubic;
    slotMachine.style.transform = `translateX(-${currentPosition}px)`;
    
    if (progress < 1) {
        animationId = requestAnimationFrame(animateSlotMachine);
    } else {
        // Animation complete
        animationId = null;
        onSlotMachineComplete();
    }
}

async function onSlotMachineComplete() {
    // Fetch the selected item details
    const result = await fetchRandomItem();
    if (result) {
        appState.currentResult = result;
        displayResult(result);
    } else {
        showError('Failed to get movie details');
    }
}

// Result Display
function displayResult(result) {
    const item = result.item;
    
    // Hide slot machine, show result
    slotMachineContainer.classList.add('hidden');
    resultContainer.classList.remove('hidden');
    
    // Set poster
    const posterImg = document.getElementById('result-poster-img');
    posterImg.src = result.posterUrl || '';
    posterImg.alt = item.title || 'Poster';
    
    // Set title
    document.getElementById('result-title').textContent = item.title || 'Unknown Title';
    
    // Build metadata
    const metaContainer = document.getElementById('result-meta');
    metaContainer.innerHTML = '';
    
    if (item.year) {
        const yearBubble = createBubble(item.year);
        metaContainer.appendChild(yearBubble);
    }
    
    if (item.leafCount) {
        const episodesBubble = createBubble(`${item.leafCount} episodes`);
        metaContainer.appendChild(episodesBubble);
    }
    
    if (item.contentRating) {
        const ratingBubble = createBubble(item.contentRating);
        metaContainer.appendChild(ratingBubble);
    }
    
    if (item.rating) {
        const rating = parseFloat(item.rating);
        const icon = rating > 5 ? 'rt' : 'bt';
        const ratingBubble = createBubble(`${Math.round(rating * 10)}%`, icon);
        metaContainer.appendChild(ratingBubble);
    }
    
    if (item.audienceRating) {
        const audienceRating = parseFloat(item.audienceRating);
        const icon = audienceRating > 5 ? 'gg' : 'ew';
        const ratingBubble = createBubble(`${Math.round(audienceRating * 10)}%`, icon);
        metaContainer.appendChild(ratingBubble);
    }
    
    if (item.duration) {
        const duration = formatDuration(item.duration);
        const durationBubble = createBubble(duration);
        metaContainer.appendChild(durationBubble);
    }
    
    // Set summary
    document.getElementById('result-summary').textContent = item.summary || 'No summary available.';
    
    // Build details
    const detailsContainer = document.getElementById('result-details');
    detailsContainer.innerHTML = '';
    
    if (item.directors && item.directors.length > 0) {
        const directorsP = document.createElement('p');
        directorsP.innerHTML = `<strong>Director:</strong> ${item.directors.join(', ')}`;
        detailsContainer.appendChild(directorsP);
    }
    
    if (item.roles && item.roles.length > 0) {
        const castP = document.createElement('p');
        castP.innerHTML = `<strong>Starring:</strong> ${item.roles.join(', ')}`;
        detailsContainer.appendChild(castP);
    }
    
    // Build genres
    const genresContainer = document.getElementById('result-genres');
    genresContainer.innerHTML = '';
    
    if (item.genres && item.genres.length > 0) {
        item.genres.forEach(genre => {
            const genreBubble = createBubble(genre);
            genresContainer.appendChild(genreBubble);
        });
    }
    
    // Set watch link
    const watchLink = document.getElementById('watch-link');
    watchLink.href = result.directPlayUrl;
    watchLink.onclick = async (e) => {
        // Try direct play first, fallback to web app
        try {
            const testResponse = await fetch(result.directPlayUrl, { method: 'HEAD', mode: 'no-cors' });
            // If we get here, link should work
        } catch (error) {
            // Fallback to web app
            e.preventDefault();
            window.open(result.webAppUrl, '_blank');
        }
    };
}

function createBubble(text, iconId = null) {
    const bubble = document.createElement('span');
    bubble.className = 'bubble';
    
    if (iconId) {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 48 48');
        icon.setAttribute('fill', 'currentColor');
        icon.style.width = '16px';
        icon.style.height = '16px';
        
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${iconId}`);
        icon.appendChild(use);
        
        bubble.appendChild(icon);
    }
    
    bubble.appendChild(document.createTextNode(text));
    return bubble;
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// Event Handlers
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    
    const formData = new FormData(setupForm);
    const plexIp = formData.get('plexIp');
    const plexToken = formData.get('plexToken');
    const saveCredentials = document.getElementById('save-credentials').checked;
    
    loading.classList.remove('hidden');
    
    const validation = await validateCredentials(plexIp, plexToken);
    
    if (validation.success) {
        appState.plexIp = plexIp;
        appState.plexToken = plexToken;
        
        if (saveCredentials) {
            setCookie('plexIp', plexIp);
            setCookie('plexToken', plexToken);
        } else {
            deleteCookie('plexIp');
            deleteCookie('plexToken');
        }
        
        setupScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
        
        await initializeApp();
    } else {
        showError(validation.data?.error || 'Invalid credentials. Please check your Plex IP and token.');
    }
    
    loading.classList.add('hidden');
});

editCredentialsBtn.addEventListener('click', () => {
    if (confirm('This will clear your current credentials. Continue?')) {
        deleteCookie('plexIp');
        deleteCookie('plexToken');
        appState.plexIp = null;
        appState.plexToken = null;
        mainScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
        setupForm.reset();
    }
});

settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
});

closeSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
});

// Theme controls
document.getElementById('theme-light').addEventListener('click', () => {
    appState.theme = 'light';
    applyTheme();
    saveStateToCookies();
    updateThemeButtons();
});

document.getElementById('theme-dark').addEventListener('click', () => {
    appState.theme = 'dark';
    applyTheme();
    saveStateToCookies();
    updateThemeButtons();
});

function updateThemeButtons() {
    document.getElementById('theme-light').classList.toggle('active', appState.theme === 'light');
    document.getElementById('theme-dark').classList.toggle('active', appState.theme === 'dark');
}

// Accent color controls
document.querySelectorAll('.accent-color').forEach(btn => {
    btn.addEventListener('click', () => {
        appState.accentColor = btn.dataset.color;
        applyTheme();
        saveStateToCookies();
    });
});

document.getElementById('custom-color').addEventListener('change', (e) => {
    appState.accentColor = e.target.value;
    applyTheme();
    saveStateToCookies();
});

// Section toggles
sectionToggles.forEach(toggle => {
    toggle.addEventListener('change', async () => {
        const sectionId = parseInt(toggle.dataset.section);
        
        if (toggle.checked) {
            if (!appState.selectedSections.includes(sectionId)) {
                appState.selectedSections.push(sectionId);
            }
        } else {
            appState.selectedSections = appState.selectedSections.filter(id => id !== sectionId);
        }
        
        // Ensure at least one section is selected
        if (appState.selectedSections.length === 0) {
            toggle.checked = true;
            appState.selectedSections.push(sectionId);
        }
        
        saveStateToCookies();
        await updateSectionCounts();
    });
});

// Re-roll button
document.getElementById('reroll-btn').addEventListener('click', async () => {
    await startRandomPick();
});

// Initialize App
async function initializeApp() {
    loading.classList.remove('hidden');
    hideError();
    
    // Update section checkboxes
    sectionToggles.forEach(toggle => {
        const sectionId = parseInt(toggle.dataset.section);
        toggle.checked = appState.selectedSections.includes(sectionId);
    });
    
    await updateSectionCounts();
    
    // Load all items for slot machine
    appState.allItems = await fetchAllItems();
    
    loading.classList.add('hidden');
    
    // Auto-start first pick
    if (appState.allItems.length > 0) {
        await startRandomPick();
    }
}

async function updateSectionCounts() {
    const sections = await fetchSections();
    if (sections) {
        document.getElementById('section-1-count').textContent = sections[1]?.count || 0;
        document.getElementById('section-2-count').textContent = sections[2]?.count || 0;
        document.getElementById('section-5-count').textContent = sections[5]?.count || 0;
    }
}

async function startRandomPick() {
    if (appState.selectedSections.length === 0) {
        showError('Please select at least one library section');
        return;
    }
    
    loading.classList.remove('hidden');
    hideError();
    
    // Reload items if sections changed
    appState.allItems = await fetchAllItems();
    
    if (appState.allItems.length === 0) {
        showError('No items found in selected sections');
        loading.classList.add('hidden');
        return;
    }
    
    loading.classList.add('hidden');
    
    // Start slot machine animation
    startSlotMachineAnimation(appState.allItems);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromCookies();
    applyTheme();
    updateThemeButtons();
    
    // Set custom color picker value
    document.getElementById('custom-color').value = appState.accentColor;
    
    if (appState.plexIp && appState.plexToken) {
        setupScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
        initializeApp();
    } else {
        setupScreen.classList.remove('hidden');
        mainScreen.classList.add('hidden');
    }
});

