// Application State
let appState = {
    plexIp: null,
    plexToken: null,
    selectedSections: [1, 2], // Movies (1), TV Shows (2)
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
const setupError = document.getElementById('setup-error');

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
        const parsed = JSON.parse(savedSections);
        // Filter out invalid sections (only allow 1 and 2)
        appState.selectedSections = parsed.filter(s => s === 1 || s === 2);
        // If no valid sections, use default
        if (appState.selectedSections.length === 0) {
            appState.selectedSections = [1, 2];
        }
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
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to fetch items');
        }
        const data = await response.json();
        console.log(`Fetched ${data.items?.length || 0} items from API`);
        return data.items || [];
    } catch (error) {
        console.error('Error fetching items:', error);
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
    let targetError = null;
    
    // Show error in the appropriate screen
    if (setupScreen && !setupScreen.classList.contains('hidden')) {
        // We're on the setup screen
        targetError = setupError;
    } else {
        // We're on the main screen
        targetError = errorMessage;
    }
    
    if (targetError) {
        targetError.textContent = message;
        targetError.classList.remove('hidden');
        // Auto-hide after 5 seconds
        setTimeout(() => {
            targetError.classList.add('hidden');
        }, 5000);
    }
}

function hideError() {
    if (errorMessage) {
        errorMessage.classList.add('hidden');
    }
    if (setupError) {
        setupError.classList.add('hidden');
    }
}

// Slot Machine Animation
let animationId = null;
let animationStartTime = null;
let animationDuration = 0;
let startPosition = 0;
let targetPosition = 0;
let selectedItemIndex = 0;
let currentItemsList = []; // Store the items being displayed

function createSlotMachine(items) {
    slotMachine.innerHTML = '';
    
    // Items are already filtered in startSlotMachineAnimation
    console.log(`Creating slot machine with ${items.length} items`);
    
    // Duplicate items for seamless scrolling
    const duplicatedItems = [...items, ...items, ...items];
    
    duplicatedItems.forEach((item, index) => {
        const slotItem = document.createElement('div');
        slotItem.className = 'slot-item';
        slotItem.dataset.index = index;
        slotItem.title = item.title || 'Unknown';
        
        const img = document.createElement('img');
        img.src = item.posterUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="%23ccc"/><text x="150" y="225" text-anchor="middle" font-size="20" fill="%23999">' + (item.title || 'No Poster') + '</text></svg>';
        img.alt = item.title || 'Poster';
        img.onerror = function() {
            this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="%23ccc"/><text x="150" y="225" text-anchor="middle" font-size="20" fill="%23999">' + (item.title || 'No Poster') + '</text></svg>';
        };
        
        slotItem.appendChild(img);
        slotMachine.appendChild(slotItem);
    });
}

function startSlotMachineAnimation(items) {
    // Filter valid items first
    const validItems = items.filter(item => item.title || item.key);
    
    if (validItems.length === 0) {
        showError('No items available in selected sections');
        return;
    }
    
    // Store items for later use
    currentItemsList = validItems;
    
    // Hide result, show slot machine
    resultContainer.classList.add('hidden');
    slotMachineContainer.classList.remove('hidden');
    
    // Hide roll button during animation
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) rollBtn.style.display = 'none';
    
    createSlotMachine(validItems);
    
    // Wait for layout to calculate actual item dimensions
    requestAnimationFrame(() => {
        // Calculate positions using validItems
        // Get actual item width from first item (includes margin)
        const firstItem = slotMachine.querySelector('.slot-item');
        if (!firstItem) {
            showError('Failed to create slot machine items');
            return;
        }
        
        const itemRect = firstItem.getBoundingClientRect();
        const itemStyle = getComputedStyle(firstItem);
        const marginLeft = parseFloat(itemStyle.marginLeft) || 0;
        const marginRight = parseFloat(itemStyle.marginRight) || 0;
        const itemWidth = itemRect.width + marginLeft + marginRight;
        
        const containerWidth = slotMachineContainer.offsetWidth;
        const containerCenter = containerWidth / 2;
        
        // Select random item (from first set of validItems)
        selectedItemIndex = Math.floor(Math.random() * validItems.length);
        
        // Calculate target position to center selected item
        // We want to center an item from the middle set (validItems.length to validItems.length * 2)
        const middleSetStart = validItems.length;
        const targetItemIndex = middleSetStart + selectedItemIndex;
        
        // Calculate the position where the center of the target item should be
        // Position of item's left edge + half item width = center of item
        const targetItemLeft = targetItemIndex * itemWidth;
        const targetItemCenter = targetItemLeft + (itemWidth / 2);
        
        // We need to translate the slot machine so the target item's center aligns with container center
        targetPosition = targetItemCenter - containerCenter;
        
        // Start from a random position in the first set
        startPosition = Math.random() * (validItems.length * itemWidth);
        
        // Random duration: 4-6 seconds (5s ± 1s)
        animationDuration = 4000 + Math.random() * 2000; // 4000-6000ms
        
        // Set initial position
        slotMachine.style.transform = `translateX(-${startPosition}px)`;
        
        // Start animation
        animationStartTime = performance.now();
        animateSlotMachine();
    });
    
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
    // Determine which item is actually centered by checking DOM positions
    const slotMachineWrapper = document.querySelector('.slot-machine-wrapper');
    if (!slotMachineWrapper) {
        showError('Slot machine wrapper not found');
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) rollBtn.style.display = 'block';
        return;
    }
    
    const containerRect = slotMachineWrapper.getBoundingClientRect();
    const containerCenterX = containerRect.left + (containerRect.width / 2);
    
    // Find the item closest to the center
    const slotItems = slotMachine.querySelectorAll('.slot-item');
    let closestItem = null;
    let closestDistance = Infinity;
    let actualSelectedIndex = -1;
    
    slotItems.forEach((item, index) => {
        const itemRect = item.getBoundingClientRect();
        const itemCenterX = itemRect.left + (itemRect.width / 2);
        const distance = Math.abs(itemCenterX - containerCenterX);
        
        if (distance < closestDistance) {
            closestDistance = distance;
            closestItem = item;
            actualSelectedIndex = index;
        }
    });
    
    // Map the DOM index back to the original item index
    // Items are duplicated 3 times, so we need to find which set we're in
    const itemsPerSet = currentItemsList.length;
    const actualItemIndex = actualSelectedIndex % itemsPerSet;
    
    if (currentItemsList.length === 0 || actualItemIndex >= currentItemsList.length) {
        showError('No item selected');
        // Show roll button again
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) rollBtn.style.display = 'block';
        return;
    }
    
    const selectedItem = currentItemsList[actualItemIndex];
    
    // Get the key/ratingKey for URL construction
    const itemKey = selectedItem.key || selectedItem.ratingKey;
    if (!itemKey) {
        showError('Item missing key information');
        // Show roll button again
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) rollBtn.style.display = 'block';
        return;
    }
    
    // Extract the numeric ID from the key (e.g., "/library/metadata/8508" -> "8508")
    const keyMatch = itemKey.match(/\/(\d+)$/);
    const itemId = keyMatch ? keyMatch[1] : itemKey;
    
    // Construct URLs using the selected item
    const directPlayUrl = `http://${appState.plexIp}:32400/library/metadata/${itemId}`;
    const webAppUrl = `http://${appState.plexIp}:32400/web/index.html#!/server/details?key=${encodeURIComponent(itemKey)}`;
    
    // Get poster URL - use existing posterUrl or construct from thumb
    let posterUrl = selectedItem.posterUrl;
    if (!posterUrl && selectedItem.thumb) {
        posterUrl = `http://${appState.plexIp}:32400/photo/:/transcode?width=648&height=972&url=${encodeURIComponent(selectedItem.thumb)}&X-Plex-Token=${appState.plexToken}`;
    }
    
    // Construct result object from the selected item
    const itemResult = {
        item: selectedItem,
        directPlayUrl: directPlayUrl,
        webAppUrl: webAppUrl,
        posterUrl: posterUrl,
        plexIp: appState.plexIp
    };
    
    appState.currentResult = itemResult;
    displayResult(itemResult);
}

// Result Display
function displayResult(result) {
    const item = result.item;
    
    // Hide slot machine, show result
    slotMachineContainer.classList.add('hidden');
    resultContainer.classList.remove('hidden');
    
    // Show roll button again (it will be visible when slot machine is shown next time)
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) rollBtn.style.display = 'block';
    
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

// Roll button (starts the slot machine animation)
document.getElementById('roll-btn').addEventListener('click', async () => {
    if (appState.allItems.length === 0) {
        // Reload items if needed
        appState.allItems = await fetchAllItems();
    }
    if (appState.allItems.length > 0) {
        await startRandomPick();
    } else {
        showError('No items available in selected sections');
    }
});

// Re-roll button
document.getElementById('reroll-btn').addEventListener('click', async () => {
    // Hide result, show slot machine with roll button
    resultContainer.classList.add('hidden');
    slotMachineContainer.classList.remove('hidden');
    
    // Ensure roll button is visible
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) rollBtn.style.display = 'block';
    
    // Start the animation immediately
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
    
    // Show slot machine container with roll button (don't auto-start)
    if (appState.allItems.length > 0) {
        resultContainer.classList.add('hidden');
        slotMachineContainer.classList.remove('hidden');
        // Create slot machine but don't start animation yet
        const validItems = appState.allItems.filter(item => item.title || item.key);
        if (validItems.length > 0) {
            currentItemsList = validItems;
            createSlotMachine(validItems);
        }
    }
}

async function updateSectionCounts() {
    const sections = await fetchSections();
    if (sections) {
        document.getElementById('section-1-count').textContent = sections[1]?.count || 0;
        document.getElementById('section-2-count').textContent = sections[2]?.count || 0;
    }
}

async function startRandomPick() {
    if (appState.selectedSections.length === 0) {
        showError('Please select at least one library section');
        return;
    }
    
    // Show loading only if we need to fetch items
    if (appState.allItems.length === 0) {
        loading.classList.remove('hidden');
    }
    hideError();
    
    // Reload items if sections changed or if we don't have any
    if (appState.allItems.length === 0) {
        appState.allItems = await fetchAllItems();
        loading.classList.add('hidden');
    }
    
    if (appState.allItems.length === 0) {
        showError('No items found in selected sections');
        return;
    }
    
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

