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
let timerDuration = 20; // Default timer duration in seconds
let currentCategory = 'global';
let localUsername = "";

// --- 3. MULTIPLAYER STATE ---
let lobbyCode = null;
let isHost = false;
let isOnline = false;
let lobbySubscription = null;
let lastSyncedStarId = -1;
let gracePeriodTimer = null;
let pendingSyncStarIndex = null;
let inGracePeriod = false;
let gracePeriodTimeLeft = 0;
let showingScoreReview = false;
let lastScoreReviewStarId = -1; // Track which star we showed review for

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
    const timeLimitEl = document.getElementById('time-limit');
    if (timeLimitEl) {
        timeLimitEl.style.display = mode === 'timed' ? 'block' : 'none';
        if (mode === 'timed') {
            timerDuration = parseInt(timeLimitEl.value) || 20;
        }
    }
}

function setCategory(cat) {
    currentCategory = cat;
    document.getElementById('cat-global').classList.toggle('active', cat === 'Global');
    document.getElementById('cat-jav').classList.toggle('active', cat === 'JAV');
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
    
    if (isOnline && isHost) {
        createLobbyInSupabase();
    } else if (isOnline && !isHost) {
        startGame(selectedDifficulty);
    } else {
        startGame(selectedDifficulty);
    }
}

// --- 6. LOBBY LOGIC ---
function createLobby() {
    selectedGameType = 'online';
    isHost = true;
    isOnline = true;
    
    document.getElementById('step-1-container').style.display = 'none';
    document.getElementById('step-2-container').style.display = 'block';
}

async function createLobbyInSupabase() {
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // Update timer duration from dropdown if in timed mode
        if (gameMode === 'timed') {
            const timeLimitEl = document.getElementById('time-limit');
            if (timeLimitEl) {
                timerDuration = parseInt(timeLimitEl.value) || 20;
            }
        }
        
        const { error } = await supabaseClient.from('lobbies').insert([{
            id: code,
            p1_name: localUsername,
            status: 'waiting',
            category: currentCategory,
            difficulty: selectedDifficulty,
            game_mode: gameMode,
            timer_duration: timerDuration,
            current_star_id: 0,
            round_start_at: new Date().toISOString(),
            p1_score: 0,
            p2_score: 0,
            p1_answered: false,
            p2_answered: false
        }]);

        if (error) {
            alert("Error creating lobby: " + error.message);
            return;
        }

        lobbyCode = code;
        alert(`Host Code: ${code}\nWaiting for opponent...`);
        
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

// FIXED #2: Enhanced polling with grace period and auto-sync
function subscribeToLobby(code) {
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
            
            // Detect when host ends the game
            if (data.status === 'ended' && !isHost) {
                clearInterval(pollInterval);
                showEndGame();
                return;
            }
            
            // Host starts game when guest joins
            if (data.p2_name && data.status === 'waiting' && isHost) {
                // DON'T clear interval - host needs to keep polling for score updates!
                startMPGame();
                return;
            }
            
            // Guest waits for host to change status to 'playing'
            if (data.status === 'playing' && !isHost) {
                // Sync game mode and timer duration from host
                if (data.game_mode) {
                    gameMode = data.game_mode;
                }
                if (data.timer_duration) {
                    timerDuration = data.timer_duration;
                }
                
                if (!currentStar && !starsData.length) {
                    clearInterval(pollInterval);
                    // Call startGame to fetch player names before loading data
                    await startGame(data.difficulty);
                    subscribeToLobby(code);
                    return;
                }
                
                // Game is loaded, check if star needs syncing
                if (data.current_star_id !== null && data.current_star_id !== undefined) {
                    if (lastSyncedStarId !== data.current_star_id) {
                        lastSyncedStarId = data.current_star_id;
                        syncRemoteRound(data.current_star_id);
                    }
                }
            }
            
            // Always sync BOTH scores AND names for BOTH players
            if (data.status === 'playing' && isOnline && players && players.length >= 2) {
                players[0].score = data.p1_score || 0;
                players[1].score = data.p2_score || 0;
                
                // Also update names if they were generic defaults
                if (data.p1_name && (players[0].name === 'Host' || players[0].name === 'Player 1')) {
                    players[0].name = data.p1_name;
                }
                if (data.p2_name && (players[1].name === 'Guest' || players[1].name === 'Player 2')) {
                    players[1].name = data.p2_name;
                }
                
                renderSidebar();
            }

            // Show opponent status for BOTH host and guest
            if (data.status === 'playing' && isOnline && players && players.length >= 2) {
                const hostAnswered = data.p1_answered;
                const guestAnswered = data.p2_answered;
                
                if (isHost) {
                    // Host shows guest's status
                    updateOpponentStatus(guestAnswered, players[1].name, hostAnswered);
                    
                    // Start grace period ONLY in normal mode (not timed mode)
                    if (gameMode === 'normal' && guestAnswered && !hostAnswered && !isAnswered && !inGracePeriod) {
                        startGracePeriod();
                    }
                } else {
                    // Guest shows host's status
                    updateOpponentStatus(hostAnswered, players[0].name, guestAnswered);
                    
                    // Start grace period ONLY in normal mode (not timed mode)
                    if (gameMode === 'normal' && hostAnswered && !guestAnswered && !isAnswered && !inGracePeriod) {
                        startGracePeriod();
                    }
                }
            }

            // When both have answered (or timed out), show score review and proceed
            if (data.status === 'playing' && data.p1_answered && data.p2_answered && isAnswered) {
                // Check if we already showed review for this star
                if (lastScoreReviewStarId === data.current_star_id) {
                    return; // Already showed review for this star
                }
                
                // Also check the flag as secondary protection
                if (showingScoreReview) {
                    return; // Already showing
                }
                
                // Cancel grace period if running (only in normal mode)
                if (inGracePeriod) {
                    cancelGracePeriod();
                }
                
                // Set both protections
                showingScoreReview = true;
                lastScoreReviewStarId = data.current_star_id;
                
                if (isHost) {
                    showScoreReviewPopup(() => {
                        showingScoreReview = false;
                        nextRound();
                    });
                } else {
                    // Guest just watches the score review, doesn't trigger next round
                    showScoreReviewPopup(() => {
                        showingScoreReview = false;
                    });
                }
            }
        } catch (err) {
            console.error('Subscription poll error:', err);
        }
    }, 500);
    
    window.lobbyPollInterval = pollInterval;
}

// Function to update opponent status UI - works for both host and guest
function updateOpponentStatus(opponentAnswered, opponentName, myAnswered) {
    let statusDiv = document.getElementById('opponent-status');
    
    if (!statusDiv) {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;
        
        statusDiv = document.createElement('div');
        statusDiv.id = 'opponent-status';
        statusDiv.style.cssText = `
            text-align: center;
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            transition: all 0.3s ease;
        `;
        gameContainer.insertBefore(statusDiv, gameContainer.firstChild);
    }
    
    if (opponentAnswered) {
        // Opponent has answered
        statusDiv.innerHTML = `🟢 <strong>${opponentName}</strong> has answered!`;
        statusDiv.style.background = 'rgba(46, 204, 113, 0.2)';
        statusDiv.style.color = '#2ecc71';
        statusDiv.style.border = '1px solid rgba(46, 204, 113, 0.4)';
    } else if (myAnswered) {
        // I answered but opponent hasn't
        statusDiv.innerHTML = `⏳ Waiting for <strong>${opponentName}</strong>...`;
        statusDiv.style.background = 'rgba(241, 196, 15, 0.2)';
        statusDiv.style.color = '#f1c40f';
        statusDiv.style.border = '1px solid rgba(241, 196, 15, 0.4)';
    } else {
        // Neither has answered
        statusDiv.innerHTML = `🔵 Both players answering...`;
        statusDiv.style.background = 'rgba(100, 100, 100, 0.2)';
        statusDiv.style.color = '#888';
        statusDiv.style.border = '1px solid rgba(100, 100, 100, 0.4)';
    }
}

async function startMPGame() {
    try {
        await supabaseClient.from('lobbies').update({ status: 'playing' }).eq('id', lobbyCode);
        
        // Call startGame which will fetch player names and then load game data
        await startGame(selectedDifficulty);
        
        setTimeout(() => {
            nextRound();
        }, 1000);
    } catch (err) {
        console.error("Start MP game error:", err);
        alert("Failed to start game");
    }
}

function syncRemoteRound(starIndex) {
    if (!starsData || !starsData[starIndex]) {
        console.error('Star not found at index:', starIndex);
        return;
    }
    
    // If already on this star, don't reload
    if (currentStar && starsData.indexOf(currentStar) === starIndex && !isAnswered) {
        return;
    }
    
    currentStar = starsData[starIndex];
    shownStarsIndices.add(starIndex);
    lastSyncedStarId = starIndex;
    
    isAnswered = false;
    pointValue = 10;
    clearInterval(timerInterval);
    
    // Reset score review flag for new round
    showingScoreReview = false;
    
    const starImage = document.getElementById('star-image');
    if (starImage) {
        starImage.src = currentStar.image;
        starImage.onerror = () => console.error('Failed to load image:', currentStar.image);
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
    
    players.forEach(p => {
        p.selected = false;
        const pill = document.getElementById(`pill-${p.id}`);
        if (pill) pill.classList.remove('active');
    });
    
    document.getElementById('quick-select-zone').style.display = 'none';
    
    if (gameMode === 'timed') startTimer();
}

// Update revealName to mark player as answered

// Grace Period Management - applies to BOTH host and guest
function startGracePeriod() {
    if (inGracePeriod) return; // Already in grace period
    
    inGracePeriod = true;
    gracePeriodTimeLeft = 7;
    
    const feedback = document.getElementById('feedback');
    if (feedback && !isAnswered) {
        feedback.textContent = `⏰ Opponent answered! You have ${gracePeriodTimeLeft}s...`;
        feedback.className = '';
        feedback.style.color = '#f39c12';
    }
    
    gracePeriodTimer = setInterval(() => {
        gracePeriodTimeLeft--;
        
        if (feedback && !isAnswered) {
            feedback.textContent = `⏰ Opponent answered! You have ${gracePeriodTimeLeft}s...`;
        }
        
        if (gracePeriodTimeLeft <= 0) {
            clearInterval(gracePeriodTimer);
            gracePeriodTimer = null;
            inGracePeriod = false;
            
            if (!isAnswered) {
                // Force reveal if time's up
                revealName();
            }
        }
    }, 1000);
}

function cancelGracePeriod() {
    if (gracePeriodTimer) {
        clearInterval(gracePeriodTimer);
        gracePeriodTimer = null;
    }
    inGracePeriod = false;
    gracePeriodTimeLeft = 0;
    
    const feedback = document.getElementById('feedback');
    if (feedback && feedback.textContent.includes('Opponent answered')) {
        feedback.textContent = '';
    }
}

// Score Review Popup - shows briefly before next round
function showScoreReviewPopup(callback) {
    // Double-check: if already showing, don't create another
    if (showingScoreReview && document.getElementById('score-review-overlay')) {
        console.warn('Score review already showing, skipping duplicate call');
        return;
    }
    
    // Safety check for players
    if (!players || players.length < 2) {
        console.error('Players not initialized for score review');
        if (callback) callback();
        return;
    }
    
    // Remove any stale overlay (shouldn't happen with flag, but just in case)
    let existingOverlay = document.getElementById('score-review-overlay');
    if (existingOverlay) {
        console.warn('Removing stale overlay');
        existingOverlay.remove();
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'score-review-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        animation: fadeIn 0.3s ease;
    `;
    
    const card = document.createElement('div');
    card.style.cssText = `
        background: var(--card-bg);
        padding: 30px 40px;
        border-radius: 20px;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    `;
    
    const hostScore = players[0] ? players[0].score : 0;
    const guestScore = players[1] ? players[1].score : 0;
    const hostName = players[0] ? players[0].name : 'Host';
    const guestName = players[1] ? players[1].name : 'Guest';
    
    card.innerHTML = `
        <h2 style="margin: 0 0 20px 0; color: var(--primary);">Round Complete!</h2>
        <div style="display: flex; justify-content: space-around; margin-bottom: 25px;">
            <div>
                <div style="font-size: 0.9rem; color: #888; margin-bottom: 5px;">${hostName}</div>
                <div style="font-size: 2rem; font-weight: bold; color: ${isHost ? 'var(--success)' : 'white'};">${hostScore}</div>
            </div>
            <div style="font-size: 2rem; color: #666; align-self: center;">-</div>
            <div>
                <div style="font-size: 0.9rem; color: #888; margin-bottom: 5px;">${guestName}</div>
                <div style="font-size: 2rem; font-weight: bold; color: ${!isHost ? 'var(--success)' : 'white'};">${guestScore}</div>
            </div>
        </div>
        <div id="countdown-display" style="font-size: 1.2rem; color: var(--primary); font-weight: bold;">3</div>
    `;
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    let countdown = 3;
    const countdownInterval = setInterval(() => {
        countdown--;
        const countdownEl = document.getElementById('countdown-display');
        if (countdownEl) {
            countdownEl.textContent = countdown > 0 ? countdown : '▶';
        }
        
        if (countdown === 0) {
            clearInterval(countdownInterval);
            overlay.remove();
            if (callback) callback();
        }
    }, 1000);
}

// FIXED #2: Cancel grace period if guest answers in time
function cancelGuestGracePeriod() {
    // This is now handled by the unified cancelGracePeriod function
    cancelGracePeriod();
}

// Helper function to force-sync guest when host skips ahead
function forceSyncToNewRound(starIndex) {
    if (!starsData || !starsData[starIndex]) {
        console.error('Cannot force sync - invalid star index:', starIndex);
        return;
    }
    
    console.log('Force-syncing to star index:', starIndex);
    
    isAnswered = false;
    pointValue = 10;
    clearInterval(timerInterval);
    
    currentStar = starsData[starIndex];
    shownStarsIndices.add(starIndex);
    lastSyncedStarId = starIndex;
    
    console.log('Force-synced to new star:', currentStar.name);
    
    const starImage = document.getElementById('star-image');
    if (starImage) {
        starImage.src = currentStar.image;
        starImage.onerror = () => console.error('Failed to load image:', currentStar.image);
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
    
    players.forEach(p => {
        p.selected = false;
        const pill = document.getElementById(`pill-${p.id}`);
        if (pill) pill.classList.remove('active');
    });
    
    document.getElementById('quick-select-zone').style.display = 'none';
    
    if (gameMode === 'timed') startTimer();
    
    console.log('Force-sync completed');
}

// --- 7. CORE GAMEPLAY ---
async function startGame(difficulty) {
    const count = parseInt(document.getElementById('player-count').value) || 1;
    players = [];
    
    console.log('startGame called with difficulty:', difficulty, 'isOnline:', isOnline);
    
    if (isOnline) {
        const { data, error } = await supabaseClient
            .from('lobbies')
            .select('p1_name, p2_name, p1_score, p2_score')
            .eq('id', lobbyCode)
            .single();
        
        if (error) {
            console.error('Error fetching lobby data:', error);
            players = [
                { id: 1, name: "Host", score: 0, streak: 0, selected: false },
                { id: 2, name: "Guest", score: 0, streak: 0, selected: false }
            ];
        } else {
            players = [
                { id: 1, name: data?.p1_name || "Host", score: data?.p1_score || 0, streak: 0, selected: false },
                { id: 2, name: data?.p2_name || "Guest", score: data?.p2_score || 0, streak: 0, selected: false }
            ];
        }
    } else {
        for (let i = 1; i <= count; i++) {
            const customName = document.getElementById(`setup-name-${i}`)?.value.trim();
            players.push({ id: i, name: customName || `Player ${i}`, score: 0, streak: 0, selected: false });
        }
    }
    
    console.log('Players initialized:', players);
    
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
        
        // Initialize players array if not already done (for online games)
        if (!players || players.length === 0) {
            console.log('Players not initialized yet, initializing with defaults...');
            if (isOnline) {
                players = [
                    { id: 1, name: "Host", score: 0, streak: 0, selected: false },
                    { id: 2, name: "Guest", score: 0, streak: 0, selected: false }
                ];
            } else {
                players = [
                    { id: 1, name: "Player 1", score: 0, streak: 0, selected: false }
                ];
            }
        }
        
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
                    <button id="next-btn" onclick="nextRound()" style="display: none;">Next (Space) ➜</button>
                </div>
            </div>
        `;
        
        renderSidebar();
        
        if (!isOnline || isHost) {
            nextRound();
        }
    } catch (error) {
        console.error('Error loading game data:', error);
        alert('Failed to load game data. Please refresh the page.');
    }
}

function renderSidebar() {
    const container = document.getElementById('player-list');
    if (!container) return;
    
    // Safety check
    if (!players || players.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 0.9rem;">Loading players...</p>';
        return;
    }
    
    const sorted = [...players].sort((a, b) => b.score - a.score);
    
    container.innerHTML = sorted.map(p => {
        const streak = p.streak >= 3 ? `<span class="streak-badge">🔥${p.streak}</span>` : '';
        const nameHtml = isOnline 
            ? `<strong>${p.name}</strong>`
            : `<span class="editable-name" ondblclick="editPlayerName(${p.id})">${p.name}</span>`;
        
        return `
            <div class="player-score-card">
                <div>${streak}${nameHtml}</div>
                <div><strong>${p.score}</strong> pts</div>
            </div>
        `;
    }).join('');
}

function editPlayerName(id) {
    if (isOnline) return;
    const newName = prompt("New name:");
    if (newName) updateName(id, newName);
}

function toggleSelectionUI() {
    const val = document.getElementById('guess-input').value.trim();
    const zone = document.getElementById('quick-select-zone');
    
    if (isOnline || players.length <= 1) {
        zone.style.display = 'none';
        return;
    }
    
    zone.style.display = val.length > 0 ? 'block' : 'none';
    
    const pillsDiv = document.getElementById('selection-pills');
    if (!pillsDiv.hasChildNodes()) {
        players.forEach(p => {
            const pill = document.createElement('div');
            pill.className = 'pill';
            pill.id = `pill-${p.id}`;
            pill.textContent = p.name;
            pill.onclick = () => togglePlayerPill(p.id);
            pillsDiv.appendChild(pill);
        });
    }
}

function togglePlayerPill(id) {
    const p = players.find(x => x.id === id);
    if (!p) return;
    p.selected = !p.selected;
    const pill = document.getElementById(`pill-${p.id}`);
    if (pill) pill.classList.toggle('active', p.selected);
}

// Block guest from calling nextRound
function nextRound() {
    if (isOnline && !isHost) {
        console.log('Guest cannot call nextRound - host controls progression');
        return;
    }
    
    // Block next round if grace period is active
    if (isOnline && inGracePeriod) {
        console.log('Cannot proceed to next round - grace period still active');
        return;
    }
    
    // Reset score review flag for new round
    showingScoreReview = false;
    
    if (starsData.length === 0) {
        console.error('No stars data available');
        return;
    }
    
    const availableIndices = starsData
        .map((_, i) => i)
        .filter(i => !shownStarsIndices.has(i));
    
    if (availableIndices.length === 0) {
        alert("All stars shown! Restarting pool...");
        shownStarsIndices.clear();
        if (!isOnline) saveSession();
        return nextRound();
    }
    
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const globalIdx = randomIndex;
    
    currentStar = starsData[randomIndex];
    shownStarsIndices.add(randomIndex);
    
    isAnswered = false;
    pointValue = 10;
    clearInterval(timerInterval);
    
    // Remove score review popup if it exists
    const reviewOverlay = document.getElementById('score-review-overlay');
    if (reviewOverlay) {
        reviewOverlay.remove();
    }
    
    document.getElementById('star-image').src = currentStar.image;
    document.getElementById('feedback').textContent = '';
    document.getElementById('hint-text').textContent = '';
    document.getElementById('guess-input').value = '';
    document.getElementById('guess-input').disabled = false;
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('submit-btn').style.display = 'block';
    
    // Reset opponent status display
    const opponentStatus = document.getElementById('opponent-status');
    if (opponentStatus) {
        opponentStatus.innerHTML = `🔵 Both players answering...`;
        opponentStatus.style.background = 'rgba(100, 100, 100, 0.2)';
        opponentStatus.style.color = '#888';
        opponentStatus.style.border = '1px solid rgba(100, 100, 100, 0.4)';
    }
    
    players.forEach(p => {
        p.selected = false;
        const pill = document.getElementById(`pill-${p.id}`);
        if (pill) pill.classList.remove('active');
    });
    
    document.getElementById('quick-select-zone').style.display = 'none';
    
    if (gameMode === 'timed') startTimer();
    
    // Host updates database with new star index and resets answer flags
    if (isOnline && isHost) {
        updateLobbyGameState(globalIdx);
    }
    
    if (!isOnline) saveSession();
}

// FIXED #1: Update database with new round and reset answer flags
async function updateLobbyGameState(starIndex) {
    try {
        const { error } = await supabaseClient.from('lobbies').update({ 
            current_star_id: starIndex,
            round_start_at: new Date().toISOString(),
            p1_answered: false,
            p2_answered: false
        }).eq('id', lobbyCode);
        if (error) {
            console.error('Update star error:', error);
        }
    } catch (err) {
        console.error("Update star error:", err);
    }
}

// --- 8. ANSWER & SCORING ---

// FIXED #1: New function to mark player as answered
async function markPlayerAnswered() {
    try {
        const column = isHost ? 'p1_answered' : 'p2_answered';
        const scoreColumn = isHost ? 'p1_score' : 'p2_score';
        const myScore = isHost ? players[0].score : players[1].score;
        
        const { error } = await supabaseClient
            .from('lobbies')
            .update({ 
                [column]: true,
                [scoreColumn]: myScore
            })
            .eq('id', lobbyCode);
        
        if (error) {
            console.error('Error marking answered:', error);
        }
    } catch (err) {
        console.error('Mark answered error:', err);
    }
}

function checkGuess() {
    if (isAnswered) return;
    
    // Safety check: ensure currentStar exists (more important than players array)
    if (!currentStar) {
        console.error('Current star not loaded yet');
        return;
    }
    
    const guess = document.getElementById('guess-input').value.trim().toLowerCase();
    if (guess === currentStar.name.toLowerCase()) {
        clearInterval(timerInterval);
        
        // Cancel grace period if player answered in time (works for both host and guest)
        if (isOnline && inGracePeriod) {
            cancelGracePeriod();
        }
        
        document.getElementById('feedback').textContent = `CORRECT! (+${pointValue})`;
        document.getElementById('feedback').className = "correct";
        updateScores(true);
        addToHistory(true);
        endTurn();
        
        // Mark player as answered in database
        if (isOnline) {
            markPlayerAnswered();
        }
        
        if (!isOnline || isHost) {
            document.getElementById('next-btn').style.display = "block";
        } else {
            document.getElementById('next-btn').style.display = "none";
            document.getElementById('feedback').textContent += " (Waiting for host...)";
        }
    } else {
        document.getElementById('feedback').textContent = "WRONG!";
        document.getElementById('feedback').className = "wrong";
        
        // Shake animation
        const input = document.getElementById('guess-input');
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 400);
    }
}

// FIXED #1: Simplified updateScores - only local updates
function updateScores(correct) {
    // Safety check - if players not initialized, just log it (don't fail)
    if (!players || players.length === 0) {
        console.warn('Players array not yet initialized, skipping score update');
        return;
    }
    
    if (players.length === 1) {
        const p = players[0];
        if (correct) { p.score += pointValue; p.streak++; } 
        else { p.streak = 0; }
    } else {
        if (isOnline) {
            // Each player updates ONLY their own score locally
            const myPlayerIndex = isHost ? 0 : 1;
            if (players[myPlayerIndex]) {
                if (correct) { 
                    players[myPlayerIndex].score += pointValue; 
                    players[myPlayerIndex].streak++; 
                } else { 
                    players[myPlayerIndex].streak = 0; 
                }
            }
        } else {
            // Local multiplayer: selected players get points
            players.forEach(p => {
                if (p.selected && correct) { p.score += pointValue; p.streak++; } 
                else if (p.selected && !correct) { p.streak = 0; }
            });
        }
    }
    
    renderSidebar();
}

function endTurn() {
    isAnswered = true;
    const input = document.getElementById('guess-input');
    if (input) {
        input.disabled = true;
    }
    document.getElementById('submit-btn').style.display = 'none';
    
    if (!isOnline || isHost) {
        document.getElementById('next-btn').style.display = 'block';
    }
}

function saveSession() {
    localStorage.setItem('starGuess_players', JSON.stringify(players));
    localStorage.setItem('starGuess_history', JSON.stringify(sessionHistory));
    localStorage.setItem('starGuess_used', JSON.stringify([...shownStarsIndices]));
}

function startTimer() {
    console.log(`Starting timer: ${timerDuration}s in ${gameMode} mode`);
    
    timeLeft = timerDuration;
    const container = document.getElementById('timer-bar-container');
    if (container) {
        container.style.display = 'block';
        console.log('Timer bar container set to visible');
    } else {
        console.error('timer-bar-container not found!');
    }
    
    const totalTime = timerDuration;
    
    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        const timerBar = document.getElementById('timer-bar');
        if (timerBar) {
            timerBar.style.width = (timeLeft / totalTime) * 100 + "%";
        }
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            
            // In online mode, just reveal and mark as answered
            // The poll will detect when both are done and show score review
            if (!isAnswered && currentStar) {
                const feedback = document.getElementById('feedback');
                if (feedback) {
                    feedback.textContent = `TIMEOUT! Answer: ${currentStar.name}`;
                    feedback.className = "wrong";
                }
                updateScores(false);
                addToHistory(false);
                endTurn();
                
                if (isOnline) {
                    markPlayerAnswered();
                }
            }
        }
    }, 100);
}

function revealHint() {
    if (isAnswered) return;
    
    // Safety check: ensure currentStar exists
    if (!currentStar) {
        console.error('Current star not loaded');
        return;
    }
    
    pointValue = 5;
    const n = currentStar.name;
    document.getElementById('hint-text').textContent = n[0] + n.slice(1, -1).replace(/[^\s]/g, '_') + n.slice(-1);
}

// FIXED #1: Update revealName to mark player as answered
function revealName() {
    if (isAnswered) return;
    
    // Safety check: ensure players array exists
    if (!players || players.length === 0) {
        console.error('Players array not initialized - cannot reveal');
        document.getElementById('feedback').textContent = "Game not loaded. Please wait...";
        document.getElementById('feedback').className = "wrong";
        return;
    }
    
    clearInterval(timerInterval);
    
    // Cancel grace period if player revealed (works for both host and guest)
    if (isOnline && inGracePeriod) {
        cancelGracePeriod();
    }
    
    document.getElementById('feedback').textContent = `Answer: ${currentStar.name}`;
    updateScores(false);
    addToHistory(false);
    endTurn();
    
    // Mark player as answered even when revealing
    if (isOnline) {
        markPlayerAnswered();
    }
    
    if (!isOnline || isHost) {
        document.getElementById('next-btn').style.display = "block";
    } else {
        document.getElementById('next-btn').style.display = "none";
        document.getElementById('feedback').textContent += " (Waiting for host...)";
    }
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
    if (gracePeriodTimer) {
        clearInterval(gracePeriodTimer);
        gracePeriodTimer = null;
    }
    
    // Update database status to 'ended' so guest can detect it
    if (isOnline && isHost && lobbyCode) {
        supabaseClient.from('lobbies').update({
            status: 'ended'
        }).eq('id', lobbyCode).then(({ error }) => {
            if (error) console.error('Error ending game:', error);
            else console.log('Game status updated to ended');
        });
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
        if (window.lobbyPollInterval) {
            clearInterval(window.lobbyPollInterval);
        }
        if (gracePeriodTimer) {
            clearInterval(gracePeriodTimer);
            gracePeriodTimer = null;
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

// --- 9. KEYBOARD SHORTCUTS ---
window.addEventListener('keydown', (e) => {
    if (document.getElementById('game-view').style.display === 'none') return;
    
    const isTyping = e.target.tagName === 'INPUT' || e.target.isContentEditable;

    if (!isAnswered && e.key >= '1' && e.key <= '9') {
        const id = parseInt(e.key);
        if (id <= players.length) {
            togglePlayerPill(id);
        }
    }

    if (e.key === 'Enter' && !isAnswered) { 
        checkGuess(); 
        return; 
    }
    
    if (e.code === 'Space' && isAnswered) { 
        e.preventDefault();
        
        if (isOnline && !isHost) {
            console.log('Guest cannot use spacebar, must wait for host to click Next');
            return;
        }
        
        nextRound(); 
        return; 
    }

    if (!isTyping) {
        if (e.key.toLowerCase() === 'h' && !isAnswered) revealHint();
        if (e.key.toLowerCase() === 'r' && !isAnswered) revealName();
    }
});