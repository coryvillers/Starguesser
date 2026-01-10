// --- 1. CONFIGURATION & STATE ---
const supabaseUrl = 'https://njsjdwpmwuaucvlwgvgh.supabase.co';
const supabaseKey = 'sb_publishable_pgcFtK52mII4q7dA2Sx2gQ_3Sq4SUvF';


// Wait for Supabase library to load
let supabaseClient;
function initSupabase() {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}

// --- 2. GAME STATE ---
let starsData = [];
let shownStarsIndices = new Set();
let currentStar = null;
let players = [];
let sessionHistory = [];
let gameMode = 'normal';
let isAnswered = false;
let pointValue = 10;
let timerInterval = null;
let timeLeft = 0;
let currentCategory = 'global';
let localUsername = "";

// --- 3. MULTIPLAYER STATE ---
let lobbyCode = null;
let isHost = false;
let isOnline = false;
let lobbySubscription = null;

// --- 4. SETUP STATE ---
let selectedGameType = 'local';
let selectedDifficulty = null;

// --- 5. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    handleUsername();
    generateNameInputs();
    if (localStorage.getItem('starGuess_players')) {
        document.getElementById('resume-btn').style.display = 'block';
    }
});

function handleUsername() {
    localUsername = sessionStorage.getItem('sg_user');
    if (!localUsername) {
        localUsername = prompt("Enter username:", "StarPlayer_" + Math.floor(Math.random()*999)) || "Guest";
        sessionStorage.setItem('sg_user', localUsername);
    }
    document.getElementById('user-display').innerText = `Logged in as: ${localUsername}`;
}

function generateNameInputs() {
    const count = parseInt(document.getElementById('player-count').value) || 1;
    const container = document.getElementById('name-inputs-container');
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `<input type="text" class="name-input" id="setup-name-${i}" placeholder="Player ${i} Name">`;
    }
}

function setMode(mode) {
    gameMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mode-${mode}`).classList.add('active');
    document.getElementById('time-limit').style.display = mode === 'timed' ? 'block' : 'none';
}

function setCategory(cat) {
    currentCategory = cat;
    document.getElementById('cat-global').classList.toggle('active', cat === 'global');
    document.getElementById('cat-jav').classList.toggle('active', cat === 'jav');
}

function showJoinInput() {
    document.getElementById('join-input-area').style.display = 'block';
}

// --- 5. SETUP FLOW FUNCTIONS ---
function selectGameType(type) {
    selectedGameType = type;
    document.getElementById('type-local').classList.toggle('active', type === 'local');
    document.getElementById('type-online').classList.toggle('active', type === 'online');
    
    if (type === 'local') {
        document.getElementById('local-setup').style.display = 'block';
        document.getElementById('online-setup').style.display = 'none';
    } else {
        document.getElementById('local-setup').style.display = 'none';
        document.getElementById('online-setup').style.display = 'block';
    }
}

function proceedToOptions() {
    // Hide step 1, show step 2
    document.getElementById('step-1-container').style.display = 'none';
    document.getElementById('step-2-container').style.display = 'block';
}

function goBackToStep1() {
    document.getElementById('step-1-container').style.display = 'block';
    document.getElementById('step-2-container').style.display = 'none';
    selectedDifficulty = null;
}

function selectDifficulty(difficulty) {
    selectedDifficulty = difficulty;
    document.getElementById('diff-easy').classList.toggle('active', difficulty === 'easy');
    document.getElementById('diff-medium').classList.toggle('active', difficulty === 'medium');
    document.getElementById('diff-hard').classList.toggle('active', difficulty === 'hard');
}

function startSelectedGame() {
    if (!selectedDifficulty) {
        alert('Please select a difficulty level');
        return;
    }
    
    // If online and host, create lobby first
    if (isOnline && isHost) {
        createLobbyInSupabase();
    } else if (isOnline && !isHost) {
        // Guest already joined, just start
        startGame(selectedDifficulty);
    } else {
        // Local game
        startGame(selectedDifficulty);
    }
}

// --- 6. LOBBY LOGIC (ONLINE MULTIPLAYER) ---
function createLobby() {
    // Set game type to online and show step 2
    selectedGameType = 'online';
    isHost = true;
    isOnline = true;
    
    // Hide step 1, show step 2
    document.getElementById('step-1-container').style.display = 'none';
    document.getElementById('step-2-container').style.display = 'block';
}

async function createLobbyInSupabase() {
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const { error } = await supabaseClient.from('lobbies').insert([{
            id: code,
            p1_name: localUsername,
            status: 'waiting',
            category: currentCategory,
            difficulty: selectedDifficulty,
            current_star_id: 0,
            round_start_at: new Date().toISOString()
        }]);

        if (error) {
            alert("Error creating lobby: " + error.message);
            return;
        }

        lobbyCode = code;
        alert(`Host Code: ${code}\nWaiting for opponent...`);
        
        // Hide setup and show waiting state
        document.getElementById('setup-container').style.display = 'none';
        document.getElementById('game-view').style.display = 'flex';
        document.getElementById('game-container').innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <h2>Waiting for opponent...</h2>
                <p>Share code: <strong>${code}</strong></p>
                <p>Category: ${currentCategory}</p>
            </div>
        `;
        
        subscribeToLobby(code);
    } catch (err) {
        console.error("Create lobby error:", err);
        alert("Failed to create lobby");
    }
}

async function joinLobby() {
    try {
        const code = document.getElementById('lobby-code-input').value.toUpperCase().trim();
        
        if (!code || code.length !== 6) {
            alert("Please enter a valid 6-character code");
            return;
        }

        const { data, error } = await supabaseClient
            .from('lobbies')
            .update({ p2_name: localUsername })
            .eq('id', code)
            .select();

        if (error) {
            alert("Error joining lobby: " + error.message);
            return;
        }

        if (data && data.length > 0) {
            isHost = false;
            isOnline = true;
            lobbyCode = code;
            currentCategory = data[0].category;
            
            // Hide setup and show waiting state
            document.getElementById('setup-container').style.display = 'none';
            document.getElementById('game-view').style.display = 'flex';
            document.getElementById('game-container').innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <h2>Connected!</h2>
                    <p>Waiting for host to start...</p>
                </div>
            `;
            
            alert("Connected! Waiting for host to start game...");
            subscribeToLobby(code);
        } else {
            alert("Lobby not found. Check the code and try again.");
        }
    } catch (err) {
        console.error("Join lobby error:", err);
        alert("Failed to join lobby");
    }
}

let lastSyncedStarId = -1; // Track last synced star to avoid duplicate syncs

function subscribeToLobby(code) {
    // Poll the lobby every 500ms for faster sync
    const pollInterval = setInterval(async () => {
        try {
            const { data, error } = await supabaseClient
                .from('lobbies')
                .select('*')
                .eq('id', code)
                .single();
            
            if (error) {
                console.error('Poll error:', error);
                return;
            }
            
            if (!data) return;
            
            // Host starts game when guest joins
            if (data.p2_name && data.status === 'waiting' && isHost) {
                console.log('Host detected guest joined, starting game');
                clearInterval(pollInterval);
                startMPGame();
                return;
            }
            
            // Guest waits for host to change status to 'playing'
            if (data.status === 'playing' && !isHost) {
                if (!currentStar) {
                    // Game hasn't loaded yet, load it
                    console.log('Guest loading game data with difficulty:', data.difficulty);
                    clearInterval(pollInterval);
                    await loadGameData(data.difficulty);
                    // Restart polling after game loads
                    subscribeToLobby(code);
                    return;
                }
                
                // Game is loaded, check if star needs syncing
                if (data.current_star_id !== null && data.current_star_id !== undefined) {
                    if (lastSyncedStarId !== data.current_star_id) {
                        console.log('Guest syncing to star index:', data.current_star_id, 'from:', lastSyncedStarId);
                        lastSyncedStarId = data.current_star_id;
                        syncRemoteRound(data.current_star_id);
                    }
                }
            }
        } catch (err) {
            console.error('Subscription poll error:', err);
        }
    }, 500); // Poll every 500ms instead of 1000ms
    
    // Store interval ID so we can clear it later if needed
    window.lobbyPollInterval = pollInterval;
}

async function startMPGame() {
    try {
        // First update status to 'playing'
        await supabaseClient.from('lobbies').update({ status: 'playing' }).eq('id', lobbyCode);
        console.log('Lobby status updated to playing');
        
        // Then load and start the game
        await loadGameData(selectedDifficulty);
        
        // Wait a moment for both to be ready, then start
        setTimeout(() => {
            console.log('Host calling nextRound after delay');
            nextRound();
        }, 500);
    } catch (err) {
        console.error("Start MP game error:", err);
        alert("Failed to start game");
    }
}

async function syncRemoteRound(starIndex) {
    if (isAnswered) return; // Don't interrupt current answer
    
    console.log('Syncing remote round for star index:', starIndex);
    
    if (!starsData[starIndex]) {
        console.error('Star not found at index:', starIndex);
        return;
    }
    
    currentStar = starsData[starIndex];
    shownStarsIndices.add(starIndex);
    
    const starImage = document.getElementById('star-image');
    if (starImage) {
        console.log('Setting image URL:', currentStar.image);
        starImage.src = currentStar.image;
    } else {
        console.error('star-image element not found');
    }
    
    const feedback = document.getElementById('feedback');
    if (feedback) feedback.textContent = '';
    
    const hintText = document.getElementById('hint-text');
    if (hintText) hintText.textContent = '';
    
    const input = document.getElementById('guess-input');
    if (input) {
        input.value = '';
        input.disabled = false;
        input.focus();
    }
    
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) nextBtn.style.display = 'none';
    
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.style.display = 'block';
    
    if (gameMode === 'timed') startTimer();
}

// --- 7. CORE GAMEPLAY ---
async function startGame(difficulty) {
    const count = parseInt(document.getElementById('player-count').value) || 1;
    players = [];
    
    if (isOnline) {
        // Online: 2 players (Host & Guest)
        players = [
            { id: 1, name: "Host", score: 0, streak: 0, selected: false },
            { id: 2, name: "Guest", score: 0, streak: 0, selected: false }
        ];
    } else {
        // Local: multiple players
        for (let i = 1; i <= count; i++) {
            const customName = document.getElementById(`setup-name-${i}`).value.trim();
            players.push({ id: i, name: customName || `Player ${i}`, score: 0, streak: 0, selected: false });
        }
    }
    
    await loadGameData(difficulty);
}

async function resumeSession() {
    players = JSON.parse(localStorage.getItem('starGuess_players'));
    sessionHistory = JSON.parse(localStorage.getItem('starGuess_history')) || [];
    shownStarsIndices = new Set(JSON.parse(localStorage.getItem('starGuess_used')) || []);
    isOnline = false;
    await loadGameData('easy');
}

async function loadGameData(difficulty) {
    try {
        const fileName = currentCategory === 'jav' ? 'jav_stars_updated.json' : 'stars_updated.json';
        console.log('Loading file:', fileName);
        
        const response = await fetch(fileName);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const all = await response.json();
        console.log('Data loaded successfully, total stars:', all.length);

        if (currentCategory === 'jav') {
            if (difficulty === 'easy') starsData = all.slice(0, 100);
            else if (difficulty === 'medium') starsData = all.slice(100, 300);
            else starsData = all.slice(300, 400);
        } else {
            if (difficulty === 'easy') starsData = all.slice(0, 200);
            else if (difficulty === 'medium') starsData = all.slice(200, 400);
            else starsData = all.slice(400);
        }

        console.log('Stars data filtered for', difficulty, ':', starsData.length);

        document.getElementById('setup-container').style.display = 'none';
        document.getElementById('game-view').style.display = 'flex';
        
        // Rebuild game container (in case it was replaced with waiting message)
        document.getElementById('game-container').innerHTML = `
            <div id="timer-bar-container" style="display: none;">
                <div id="timer-bar"></div>
            </div>
            
            <div class="image-frame">
                <img id="star-image" src="" alt="Loading...">
            </div>

            <div class="input-section">
                <input type="text" id="guess-input" placeholder="Who is this?" autocomplete="off" oninput="toggleSelectionUI()">
                
                <div id="quick-select-zone" style="display:none;">
                    <p style="font-size: 0.7rem; color: #666; margin: 5px 0;">Select Winners (Shortcuts: 1, 2, 3...)</p>
                    <div id="selection-pills"></div>
                </div>

                <div id="feedback"></div>
                <div id="hint-text"></div>
                
                <div class="button-group">
                    <button id="submit-btn" onclick="checkGuess()">Submit</button>
                    <button id="hint-btn" onclick="revealHint()">Hint (H)</button>
                    <button id="reveal-btn" onclick="revealName()">Reveal (R)</button>
                    <button id="next-btn" onclick="nextRound()" style="display: none;">Next (Space) ➔</button>
                </div>
            </div>
        `;
        
        renderSidebar();
        renderSelectionZone();
        
        // Only call nextRound if it's local game or guest
        // Host's nextRound will be called by startMPGame after delay
        if (!isOnline || !isHost) {
            nextRound();
        }
    } catch (e) { 
        console.error('Error loading game data:', e);
        alert(`Error loading ${currentCategory} data! Check console for details.\n\nMake sure ${fileName} exists in your project folder.`); 
    }
}

function renderSelectionZone() {
    const container = document.getElementById('selection-pills');
    if (players.length <= 1) return;
    container.innerHTML = players.map(p => `
        <div class="pill" id="pill-${p.id}" onclick="togglePlayerPill(${p.id})">${p.name} <small>(${p.id})</small></div>
    `).join('');
}

function toggleSelectionUI() {
    const input = document.getElementById('guess-input');
    const zone = document.getElementById('quick-select-zone');
    if (players.length > 1 && input.value.length > 0) {
        zone.style.display = 'block';
    }
}

function togglePlayerPill(id) {
    const p = players.find(x => x.id === id);
    if (p) {
        p.selected = !p.selected;
        document.getElementById(`pill-${id}`).classList.toggle('active', p.selected);
    }
}

function renderSidebar() {
    players.sort((a, b) => b.score - a.score);
    const list = document.getElementById('player-list');
    list.innerHTML = players.map(p => `
        <div class="player-score-card">
            <span contenteditable="true" class="editable-name" onblur="updateName(${p.id}, this.textContent)">${p.name}</span>
            <div>
                ${p.streak >= 3 ? `<span class="streak-badge">🔥 ${p.streak}</span>` : ''}
                <b>${p.score}</b>
            </div>
        </div>
    `).join('');
    
    if (!isOnline) saveSession();
}

function nextRound() {
    isAnswered = false;
    pointValue = 10;
    clearInterval(timerInterval);
    
    players.forEach(p => {
        p.selected = false;
        const pill = document.getElementById(`pill-${p.id}`);
        if (pill) pill.classList.remove('active');
    });

    document.getElementById('feedback').textContent = '';
    document.getElementById('hint-text').textContent = '';
    document.getElementById('guess-input').value = '';
    document.getElementById('guess-input').disabled = false;
    document.getElementById('guess-input').focus();
    document.getElementById('quick-select-zone').style.display = 'none';
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('submit-btn').style.display = 'block';

    const available = starsData.filter((_, index) => !shownStarsIndices.has(index));
    if (available.length === 0) {
        alert("Session Complete! All stars in this mode shown.");
        showEndGame();
        return;
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    currentStar = available[randomIndex];
    const globalIdx = starsData.indexOf(currentStar);
    shownStarsIndices.add(globalIdx);

    document.getElementById('star-image').src = currentStar.image;
    
    // If online and host, sync to other player
    if (isOnline && isHost) {
        console.log('Host updating database with new star index:', globalIdx);
        updateLobbyGameState(globalIdx);
    }
    
    if (gameMode === 'timed') startTimer();
    
    if (!isOnline) saveSession();
}

async function updateLobbyGameState(starIndex) {
    try {
        console.log('Updating lobby with star index:', starIndex);
        const { error } = await supabaseClient.from('lobbies').update({ current_star_id: starIndex }).eq('id', lobbyCode);
        if (error) {
            console.error('Update star error:', error);
        } else {
            console.log('Successfully updated lobby, star index:', starIndex);
        }
    } catch (err) {
        console.error("Update star error:", err);
    }
}

function checkGuess() {
    if (isAnswered) return;
    const guess = document.getElementById('guess-input').value.trim().toLowerCase();
    if (guess === currentStar.name.toLowerCase()) {
        clearInterval(timerInterval);
        document.getElementById('feedback').textContent = `CORRECT! (+${pointValue})`;
        document.getElementById('feedback').className = "correct";
        updateScores(true);
        addToHistory(true);
        endTurn();
    } else {
        document.getElementById('feedback').textContent = "WRONG!";
        document.getElementById('feedback').className = "wrong";
    }
}

function updateScores(correct) {
    if (players.length === 1) {
        const p = players[0];
        if (correct) { p.score += pointValue; p.streak++; } 
        else { p.streak = 0; }
    } else {
        players.forEach(p => {
            if (p.selected && correct) { p.score += pointValue; p.streak++; } 
            else if (p.selected && !correct) { p.streak = 0; }
        });
    }
    renderSidebar();
}

function endTurn() {
    isAnswered = true;
    document.getElementById('guess-input').disabled = true;
    document.getElementById('submit-btn').style.display = 'none';
    document.getElementById('next-btn').style.display = 'block';
}

function saveSession() {
    localStorage.setItem('starGuess_players', JSON.stringify(players));
    localStorage.setItem('starGuess_history', JSON.stringify(sessionHistory));
    localStorage.setItem('starGuess_used', JSON.stringify([...shownStarsIndices]));
}

function startTimer() {
    timeLeft = parseInt(document.getElementById('time-limit').value);
    document.getElementById('timer-bar-container').style.display = 'block';
    const totalTime = timeLeft;
    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        document.getElementById('timer-bar').style.width = (timeLeft / totalTime) * 100 + "%";
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            revealName();
            document.getElementById('feedback').textContent = "TIMEOUT!";
        }
    }, 100);
}

function revealHint() {
    if (isAnswered) return;
    pointValue = 5;
    const n = currentStar.name;
    document.getElementById('hint-text').textContent = n[0] + n.slice(1, -1).replace(/[^\s]/g, '_') + n.slice(-1);
}

function revealName() {
    if (isAnswered) return;
    clearInterval(timerInterval);
    document.getElementById('feedback').textContent = `Answer: ${currentStar.name}`;
    updateScores(false);
    addToHistory(false);
    endTurn();
}

function addToHistory(correct) {
    sessionHistory.unshift({ name: currentStar.name, correct });
    renderHistory();
    if (!isOnline) saveSession();
}

function renderHistory() {
    const histDiv = document.getElementById('history-list');
    histDiv.innerHTML = sessionHistory.slice(0, 10).map(h => `
        <div class="history-item ${h.correct ? 'hist-correct' : 'hist-wrong'}">
            <span>${h.name}</span>
            <span>${h.correct ? '✓' : '✕'}</span>
        </div>
    `).join('');
}

function showEndGame() {
    clearInterval(timerInterval);
    if (window.lobbyPollInterval) {
        clearInterval(window.lobbyPollInterval);
    }
    document.getElementById('end-game-overlay').style.display = 'flex';
    players.sort((a, b) => b.score - a.score);
    document.getElementById('podium-container').innerHTML = players.slice(0, 3).map((p, i) => `
        <div class="podium-item rank-${i+1}">${i + 1} - ${p.name}: ${p.score} pts</div>
    `).join('');
}

function resetSession() {
    if (confirm("Reset everything?")) { 
        localStorage.clear();
        if (isOnline && lobbySubscription) {
            lobbySubscription.unsubscribe();
        }
        location.reload(); 
    }
}

function toggleHistory() {
    const el = document.getElementById('history-list');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function updateName(id, newName) {
    const p = players.find(x => x.id === id);
    if (p) { p.name = newName.trim() || `Player ${id}`; if (!isOnline) saveSession(); }
}

// --- 8. KEYBOARD SHORTCUTS ---
window.addEventListener('keydown', (e) => {
    if (document.getElementById('game-view').style.display === 'none') return;
    
    const isTyping = e.target.tagName === 'INPUT' || e.target.isContentEditable;

    // Number Keys 1-9 to toggle player selection
    if (!isAnswered && e.key >= '1' && e.key <= '9') {
        const id = parseInt(e.key);
        if (id <= players.length) {
            togglePlayerPill(id);
        }
    }

    if (e.key === 'Enter' && !isAnswered) { checkGuess(); return; }
    if (e.code === 'Space' && isAnswered) { e.preventDefault(); nextRound(); return; }

    if (!isTyping) {
        if (e.key.toLowerCase() === 'h' && !isAnswered) revealHint();
        if (e.key.toLowerCase() === 'r' && !isAnswered) revealName();
    }
});
