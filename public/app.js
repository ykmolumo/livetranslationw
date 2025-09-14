// Live Translation App - Main JavaScript
class LiveTranslationApp {
    constructor() {
        this.socket = io();
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.voiceEngine = null;
        this.performanceOptimizer = null;
        this.isRecording = false;
        this.currentTranslation = '';
        this.conversationHistory = [];
        this.currentRoom = null;
        this.userName = '';
        this.userLanguage = 'en';
        this.ambientListening = false;
        this.outputMode = 'both'; // 'both', 'text', 'audio'
        this.lastTranslation = null;
        this.settings = {
            speechRate: 1.0,
            voicePitch: 1.0,
            voiceVolume: 1.0,
            darkMode: false,
            autoPlay: true
        };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.initializeEngines();
        this.initializeSpeechRecognition();
        this.loadSettings();
        this.setupSocketEvents();
        this.hideLoadingOverlay();
        this.updateStats();
    }

    async initializeEngines() {
        // Initialize voice engine
        this.voiceEngine = new VoiceEngine();
        await this.voiceEngine.init();
        
        // Initialize performance optimizer
        this.performanceOptimizer = new PerformanceOptimizer();
        
        // Setup cleanup interval
        setInterval(() => {
            this.performanceOptimizer.cleanupCache();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    setupEventListeners() {
        // Microphone button
        document.getElementById('micButton').addEventListener('click', () => {
            this.toggleRecording();
        });

        // Language swap
        document.getElementById('swapLanguages').addEventListener('click', () => {
            this.swapLanguages();
        });

        // Play translation
        document.getElementById('playButton').addEventListener('click', () => {
            this.playTranslation();
        });

        // Copy translation
        document.getElementById('copyBtn').addEventListener('click', () => {
            this.copyTranslation();
        });

        // Save to history
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveToHistory();
        });

        // Clear input
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearInput();
        });

        // Settings modal
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openModal('settingsModal');
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            this.closeModal('settingsModal');
        });

        // History modal
        document.getElementById('historyBtn').addEventListener('click', () => {
            this.openModal('historyModal');
            this.loadHistory();
        });

        document.getElementById('closeHistory').addEventListener('click', () => {
            this.closeModal('historyModal');
        });

        // Settings controls
        this.setupSettingsControls();

        // History actions
        document.getElementById('exportHistory').addEventListener('click', () => {
            this.exportHistory();
        });

        document.getElementById('clearHistory').addEventListener('click', () => {
            this.clearHistory();
        });

        // Language change events
        document.getElementById('sourceLanguage').addEventListener('change', () => {
            this.updateLanguageSettings();
        });

        document.getElementById('targetLanguage').addEventListener('change', () => {
            this.updateLanguageSettings();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.ctrlKey) {
                e.preventDefault();
                this.toggleRecording();
            }
            if (e.code === 'KeyP' && e.ctrlKey) {
                e.preventDefault();
                this.playTranslation();
            }
        });

        // Add text input fallback button
        this.addTextInputButton();
        
        // Room management
        this.setupRoomEvents();
        
        // Check for room in URL
        this.checkUrlForRoom();
    }

    initializeSpeechRecognition() {
        // Check if we're on HTTPS or localhost
        const isSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';
        
        if (!isSecureContext) {
            this.showToast('Speech recognition requires HTTPS. Please use https:// or run on localhost', 'error');
            return;
        }

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 3; // Get multiple alternatives for better accuracy
            
            // Enhanced language detection
            this.setupLanguageDetection();
            
            this.recognition.onstart = () => this.onRecordingStart();
            this.recognition.onresult = (event) => this.onSpeechResult(event);
            this.recognition.onerror = (event) => this.onSpeechError(event);
            this.recognition.onend = () => this.onRecordingEnd();
            
            this.showToast('Speech recognition initialized with auto-detection', 'success');
        } else {
            this.showToast('Speech recognition not supported in this browser. Try Chrome or Edge.', 'error');
            this.setupTextInputFallback();
        }
    }

    setupLanguageDetection() {
        // Set recognition language based on user's selected language
        const userLang = this.userLanguage || document.getElementById('sourceLanguage').value || 'en';
        const langMap = {
            'en': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR',
            'de': 'de-DE',
            'it': 'it-IT',
            'pt': 'pt-BR',
            'ru': 'ru-RU',
            'ja': 'ja-JP',
            'ko': 'ko-KR',
            'zh': 'zh-CN',
            'ar': 'ar-SA',
            'hi': 'hi-IN',
            'nl': 'nl-NL'
        };
        
        this.recognition.lang = langMap[userLang] || 'en-US';
        
        // Store current speaker for identification
        this.currentSpeaker = this.userName || 'Unknown';
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
        });

        // Room events
        this.socket.on('room-joined', (data) => {
            this.onRoomJoined(data);
        });

        this.socket.on('user-joined', (data) => {
            this.onUserJoined(data);
        });

        this.socket.on('user-left', (data) => {
            this.onUserLeft(data);
        });

        this.socket.on('live-translation', (data) => {
            this.onLiveTranslation(data);
        });

        this.socket.on('new-message', (data) => {
            this.onNewMessage(data);
        });

        this.socket.on('user-language-changed', (data) => {
            this.onUserLanguageChanged(data);
        });

        this.socket.on('error', (error) => {
            this.showToast(error.message, 'error');
        });
    }

    toggleRecording() {
        if (!this.recognition) {
            this.showToast('Speech recognition not available', 'error');
            return;
        }

        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    async startRecording() {
        // Check microphone permission first
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        } catch (permissionError) {
            this.showToast('Microphone permission required. Please allow access.', 'error');
            return;
        }

        try {
            if (!this.recognition) {
                this.showToast('Speech recognition not available. Using text input instead.', 'warning');
                this.setupTextInputFallback();
                return;
            }
            
            this.recognition.lang = this.getLanguageCode(document.getElementById('sourceLanguage').value);
            this.recognition.start();
            this.isRecording = true;
        } catch (error) {
            console.error('Recording start error:', error);
            this.showToast('Failed to start recording. Try refreshing the page.', 'error');
            this.setupTextInputFallback();
        }
    }

    stopRecording() {
        if (this.recognition && this.isRecording) {
            this.recognition.stop();
            this.isRecording = false;
        }
    }

    onRecordingStart() {
        const micButton = document.getElementById('micButton');
        const voiceIndicator = document.getElementById('voiceIndicator');
        
        micButton.classList.add('recording');
        micButton.innerHTML = '<i class="fas fa-stop"></i>';
        voiceIndicator.classList.add('active');
        
        this.updateTranslationStatus('Listening...', 'listening');
        document.getElementById('inputText').innerHTML = '<p class="placeholder">Listening...</p>';
    }

    onRecordingEnd() {
        const micButton = document.getElementById('micButton');
        const voiceIndicator = document.getElementById('voiceIndicator');
        
        micButton.classList.remove('recording');
        micButton.innerHTML = '<i class="fas fa-microphone"></i>';
        voiceIndicator.classList.remove('active');
        
        this.updateTranslationStatus('Ready', 'ready');
        this.isRecording = false;
    }

    async onSpeechResult(event) {
        let finalTranscript = '';
        let interimTranscript = '';
        let confidence = 0;

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            confidence = result[0].confidence || 0;
            
            if (result.isFinal) {
                finalTranscript += transcript;
                
                // Enhanced speaker identification
                this.identifySpeaker(transcript, confidence);
                
                // Auto-detect language if confidence is low
                if (confidence < 0.7) {
                    await this.attemptLanguageDetection(transcript);
                }
            } else {
                interimTranscript += transcript;
            }
        }

        const inputText = document.getElementById('inputText');
        const displayText = finalTranscript + interimTranscript;
        
        if (displayText.trim()) {
            // Show confidence indicator
            const confidenceIndicator = confidence > 0 ? ` (${Math.round(confidence * 100)}%)` : '';
            inputText.innerHTML = `<p>${displayText}<span class="confidence">${confidenceIndicator}</span></p>`;
            
            if (finalTranscript.trim()) {
                await this.translateText(finalTranscript.trim(), true);
            }
        }
    }

    identifySpeaker(transcript, confidence) {
        // Simple speaker identification based on speech patterns and confidence
        const speakerInfo = {
            text: transcript,
            confidence: confidence,
            timestamp: Date.now(),
            speaker: this.currentSpeaker,
            language: this.userLanguage
        };
        
        // Store speaker history for pattern recognition
        if (!this.speakerHistory) {
            this.speakerHistory = [];
        }
        
        this.speakerHistory.push(speakerInfo);
        
        // Keep only last 10 entries
        if (this.speakerHistory.length > 10) {
            this.speakerHistory.shift();
        }
        
        // Update speaker confidence indicator
        this.updateSpeakerIndicator(confidence);
    }

    async attemptLanguageDetection(text) {
        // Simple language detection based on character patterns
        const patterns = {
            'zh': /[\u4e00-\u9fff]/,
            'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
            'ko': /[\uac00-\ud7af]/,
            'ar': /[\u0600-\u06ff]/,
            'ru': /[\u0400-\u04ff]/,
            'es': /[ñáéíóúü]/i,
            'fr': /[àâäéèêëïîôöùûüÿç]/i,
            'de': /[äöüß]/i
        };
        
        for (const [lang, pattern] of Object.entries(patterns)) {
            if (pattern.test(text)) {
                if (lang !== this.userLanguage) {
                    this.showToast(`Detected ${lang.toUpperCase()} - Consider switching language`, 'info');
                    this.suggestLanguageChange(lang);
                }
                break;
            }
        }
    }

    suggestLanguageChange(detectedLang) {
        const suggestion = document.createElement('div');
        suggestion.className = 'language-suggestion';
        suggestion.innerHTML = `
            <div class="suggestion-content">
                <span>Detected ${detectedLang.toUpperCase()}. Switch language?</span>
                <button onclick="app.changeLanguage('${detectedLang}')" class="btn-primary btn-sm">Yes</button>
                <button onclick="this.parentElement.parentElement.remove()" class="btn-secondary btn-sm">No</button>
            </div>
        `;
        
        document.body.appendChild(suggestion);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (suggestion.parentElement) {
                suggestion.remove();
            }
        }, 10000);
    }

    changeLanguage(newLang) {
        this.userLanguage = newLang;
        document.getElementById('sourceLanguage').value = newLang;
        
        if (this.recognition) {
            this.setupLanguageDetection();
        }
        
        if (this.currentRoom) {
            this.socket.emit('change-language', { language: newLang });
        }
        
        this.showToast(`Language changed to ${newLang.toUpperCase()}`, 'success');
        
        // Remove suggestion
        const suggestions = document.querySelectorAll('.language-suggestion');
        suggestions.forEach(s => s.remove());
    }

    updateSpeakerIndicator(confidence) {
        const indicator = document.getElementById('speakerIndicator') || this.createSpeakerIndicator();
        const quality = confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low';
        
        indicator.className = `speaker-indicator ${quality}`;
        indicator.innerHTML = `
            <i class="fas fa-microphone"></i>
            <span>${this.currentSpeaker}</span>
            <span class="confidence">${Math.round(confidence * 100)}%</span>
        `;
    }

    createSpeakerIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'speakerIndicator';
        indicator.className = 'speaker-indicator';
        
        const inputPanel = document.querySelector('.input-panel');
        inputPanel.appendChild(indicator);
        
        return indicator;
    }

    onSpeechError(event) {
        console.error('Speech recognition error:', event.error);
        this.onRecordingEnd();
        
        let errorMessage = 'Speech recognition error';
        let showFallback = false;
        
        switch (event.error) {
            case 'no-speech':
                errorMessage = 'No speech detected. Try speaking closer to the microphone.';
                break;
            case 'audio-capture':
                errorMessage = 'Microphone not accessible. Check your microphone connection.';
                break;
            case 'not-allowed':
                errorMessage = 'Microphone permission denied. Please allow microphone access and refresh.';
                break;
            case 'network':
                errorMessage = 'Network error. Speech recognition requires internet connection.';
                showFallback = true;
                break;
            case 'service-not-allowed':
                errorMessage = 'Speech service not allowed. Try using HTTPS or localhost.';
                showFallback = true;
                break;
            default:
                errorMessage = `Speech error: ${event.error}. Try refreshing the page.`;
                showFallback = true;
        }
        
        this.showToast(errorMessage, 'error');
        
        if (showFallback) {
            setTimeout(() => {
                this.setupTextInputFallback();
            }, 2000);
        }
    }

    async translateText(text, isLiveSpeech = false) {
        if (!text.trim()) return;

        const startTime = Date.now();
        this.updateTranslationStatus('Translating...', 'translating');

        try {
            const sourceLang = this.userLanguage;
            
            // For live speech in room, broadcast to room members
            if (isLiveSpeech && this.currentRoom) {
                this.socket.emit('live-speech', {
                    text: text,
                    isInterim: false,
                    sourceLanguage: sourceLang
                });
            }
            
            // For solo mode or local display
            if (!this.currentRoom) {
                const targetLang = document.getElementById('targetLanguage')?.value || 'en';
                
                const cached = this.performanceOptimizer.getCachedTranslation(text, sourceLang, targetLang);
                if (cached) {
                    const latency = Date.now() - startTime;
                    this.displayTranslation(cached.translatedText);
                    this.updateLatency(latency);
                    
                    if (this.settings.autoPlay && this.outputMode !== 'text') {
                        this.speakTranslation(cached.translatedText);
                    }
                    
                    this.updateTranslationStatus('Completed (Cached)', 'completed');
                    return;
                }

                const result = await this.performanceOptimizer.translateSingle({
                    text: text,
                    sourceLang: sourceLang,
                    targetLang: targetLang
                });
                
                if (result.success || result.translatedText) {
                    const latency = Date.now() - startTime;
                    this.displayTranslation(result.translatedText);
                    this.updateLatency(latency);
                    
                    if (this.settings.autoPlay && this.outputMode !== 'text') {
                        this.speakTranslation(result.translatedText);
                    }

                    this.updateTranslationStatus('Completed', 'completed');
                } else {
                    throw new Error(result.error || 'Translation failed');
                }
            }
            
            // Send as conversation message if in room
            if (this.currentRoom) {
                this.socket.emit('conversation-message', {
                    text: text,
                    messageType: isLiveSpeech ? 'speech' : 'text'
                });
                
                // Add to local feed as own message
                this.addMessageToFeed({
                    originalText: text,
                    translatedText: text, // Same language for own message
                    speakerName: this.userName,
                    isOwn: true,
                    timestamp: new Date().toISOString()
                });
            }
            
        } catch (error) {
            console.error('Translation error:', error);
            this.showToast('Translation failed', 'error');
            this.updateTranslationStatus('Error', 'error');
        }
    }

    displayTranslation(translatedText) {
        this.currentTranslation = translatedText;
        const outputText = document.getElementById('outputText');
        outputText.innerHTML = `<p>${translatedText}</p>`;
    }

    async speakTranslation(text) {
        if (!text) return;

        const targetLanguage = document.getElementById('targetLanguage').value;
        const startTime = Date.now();

        try {
            await this.voiceEngine.speak(text, {
                language: targetLanguage,
                emotion: 'neutral',
                preserveTone: true,
                rate: this.settings.speechRate,
                pitch: this.settings.voicePitch,
                volume: this.settings.voiceVolume,
                onStart: () => {
                    document.getElementById('playButton').innerHTML = '<i class="fas fa-pause"></i>';
                },
                onEnd: () => {
                    document.getElementById('playButton').innerHTML = '<i class="fas fa-play"></i>';
                    const latency = Date.now() - startTime;
                    this.performanceOptimizer.performanceMetrics.ttsLatency.push({
                        timestamp: Date.now(),
                        latency,
                        textLength: text.length
                    });
                },
                onError: (error) => {
                    this.showToast('Speech synthesis failed', 'error');
                    document.getElementById('playButton').innerHTML = '<i class="fas fa-play"></i>';
                }
            });
        } catch (error) {
            console.error('TTS Error:', error);
            this.showToast('Speech synthesis failed', 'error');
            document.getElementById('playButton').innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    async playTranslation() {
        const textToPlay = this.lastTranslation || this.currentTranslation;
        if (textToPlay) {
            await this.speakTranslation(textToPlay);
        } else {
            this.showToast('No translation to play', 'warning');
        }
    }

    copyTranslation() {
        const textToCopy = this.lastTranslation || this.currentTranslation;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                this.showToast('Translation copied to clipboard', 'success');
            }).catch(() => {
                this.showToast('Failed to copy translation', 'error');
            });
        } else {
            this.showToast('No translation to copy', 'warning');
        }
    }

    saveToHistory() {
        const inputText = document.getElementById('inputText').textContent;
        const outputText = this.currentTranslation;

        if (inputText && outputText && inputText !== 'Listening...' && inputText !== 'Click the microphone to start speaking...') {
            const historyItem = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                originalText: inputText,
                translatedText: outputText,
                sourceLanguage: document.getElementById('sourceLanguage').value,
                targetLanguage: document.getElementById('targetLanguage').value
            };

            this.conversationHistory.unshift(historyItem);
            this.saveHistoryToStorage();
            this.showToast('Saved to history', 'success');
        } else {
            this.showToast('Nothing to save', 'warning');
        }
    }

    clearInput() {
        document.getElementById('inputText').innerHTML = '<p class="placeholder">Click the microphone to start speaking...</p>';
        document.getElementById('outputText').innerHTML = '<p class="placeholder">Translation will appear here...</p>';
        this.currentTranslation = '';
        this.updateTranslationStatus('Ready', 'ready');
    }

    swapLanguages() {
        const sourceSelect = document.getElementById('sourceLanguage');
        const targetSelect = document.getElementById('targetLanguage');
        
        const sourceValue = sourceSelect.value;
        const targetValue = targetSelect.value;
        
        if (sourceValue !== 'auto') {
            sourceSelect.value = targetValue;
            targetSelect.value = sourceValue;
            this.updateLanguageSettings();
        } else {
            this.showToast('Cannot swap with auto-detect', 'warning');
        }
    }

    updateLanguageSettings() {
        if (this.recognition) {
            this.recognition.lang = this.getLanguageCode(document.getElementById('sourceLanguage').value);
        }
    }

    getLanguageCode(langCode) {
        const languageMap = {
            'en': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR',
            'de': 'de-DE',
            'it': 'it-IT',
            'pt': 'pt-BR',
            'ru': 'ru-RU',
            'ja': 'ja-JP',
            'ko': 'ko-KR',
            'zh': 'zh-CN',
            'ar': 'ar-SA',
            'hi': 'hi-IN',
            'auto': 'en-US'
        };
        
        return languageMap[langCode] || langCode;
    }

    setupSettingsControls() {
        // Speech rate
        const speechRateSlider = document.getElementById('speechRate');
        const rateValue = document.getElementById('rateValue');
        
        speechRateSlider.addEventListener('input', (e) => {
            this.settings.speechRate = parseFloat(e.target.value);
            rateValue.textContent = `${e.target.value}x`;
            this.saveSettings();
        });

        // Voice pitch
        const voicePitchSlider = document.getElementById('voicePitch');
        const pitchValue = document.getElementById('pitchValue');
        
        voicePitchSlider.addEventListener('input', (e) => {
            this.settings.voicePitch = parseFloat(e.target.value);
            pitchValue.textContent = e.target.value;
            this.saveSettings();
        });

        // Voice volume
        const voiceVolumeSlider = document.getElementById('voiceVolume');
        const volumeValue = document.getElementById('volumeValue');
        
        voiceVolumeSlider.addEventListener('input', (e) => {
            this.settings.voiceVolume = parseFloat(e.target.value);
            volumeValue.textContent = `${Math.round(e.target.value * 100)}%`;
            this.saveSettings();
        });

        // Dark mode
        const darkModeToggle = document.getElementById('darkMode');
        darkModeToggle.addEventListener('change', (e) => {
            this.settings.darkMode = e.target.checked;
            this.toggleDarkMode(e.target.checked);
            this.saveSettings();
        });

        // Auto-play
        const autoPlayToggle = document.getElementById('autoPlay');
        autoPlayToggle.addEventListener('change', (e) => {
            this.settings.autoPlay = e.target.checked;
            this.saveSettings();
        });
    }

    toggleDarkMode(enabled) {
        if (enabled) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('liveTranslationSettings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        }

        // Apply settings to UI
        document.getElementById('speechRate').value = this.settings.speechRate;
        document.getElementById('rateValue').textContent = `${this.settings.speechRate}x`;
        
        document.getElementById('voicePitch').value = this.settings.voicePitch;
        document.getElementById('pitchValue').textContent = this.settings.voicePitch;
        
        document.getElementById('voiceVolume').value = this.settings.voiceVolume;
        document.getElementById('volumeValue').textContent = `${Math.round(this.settings.voiceVolume * 100)}%`;
        
        document.getElementById('darkMode').checked = this.settings.darkMode;
        this.toggleDarkMode(this.settings.darkMode);
        
        document.getElementById('autoPlay').checked = this.settings.autoPlay;
    }

    saveSettings() {
        localStorage.setItem('liveTranslationSettings', JSON.stringify(this.settings));
    }

    loadHistory() {
        const savedHistory = localStorage.getItem('liveTranslationHistory');
        if (savedHistory) {
            this.conversationHistory = JSON.parse(savedHistory);
        }

        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';

        if (this.conversationHistory.length === 0) {
            historyList.innerHTML = '<p class="placeholder">No conversation history yet.</p>';
            return;
        }

        this.conversationHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-item-header">
                    <span class="history-timestamp">${new Date(item.timestamp).toLocaleString()}</span>
                    <button class="btn-icon" onclick="app.deleteHistoryItem('${item.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="history-text">
                    <div class="history-original">${item.originalText}</div>
                    <div class="history-translation">${item.translatedText}</div>
                </div>
            `;
            historyList.appendChild(historyItem);
        });
    }

    saveHistoryToStorage() {
        localStorage.setItem('liveTranslationHistory', JSON.stringify(this.conversationHistory));
    }

    deleteHistoryItem(id) {
        this.conversationHistory = this.conversationHistory.filter(item => item.id != id);
        this.saveHistoryToStorage();
        this.loadHistory();
        this.showToast('History item deleted', 'success');
    }

    exportHistory() {
        if (this.conversationHistory.length === 0) {
            this.showToast('No history to export', 'warning');
            return;
        }

        const dataStr = JSON.stringify(this.conversationHistory, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `translation-history-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        this.showToast('History exported', 'success');
    }

    clearHistory() {
        if (confirm('Are you sure you want to clear all conversation history?')) {
            this.conversationHistory = [];
            this.saveHistoryToStorage();
            this.loadHistory();
            this.showToast('History cleared', 'success');
        }
    }

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    updateTranslationStatus(text, status) {
        const statusElement = document.getElementById('translationStatus');
        const statusText = statusElement.querySelector('.status-text');
        const statusIndicator = statusElement.querySelector('.status-indicator');
        
        statusText.textContent = text;
        
        // Update indicator color based on status
        statusIndicator.style.background = {
            'ready': 'var(--accent-color)',
            'listening': 'var(--warning-color)',
            'translating': 'var(--primary-color)',
            'completed': 'var(--accent-color)',
            'error': 'var(--danger-color)'
        }[status] || 'var(--accent-color)';
    }

    updateLatency(latency) {
        document.getElementById('latencyDisplay').textContent = `${latency}ms`;
        
        // Update quality based on latency
        const qualityDisplay = document.getElementById('qualityDisplay');
        if (latency < 500) {
            qualityDisplay.textContent = 'Excellent';
            qualityDisplay.style.color = 'var(--accent-color)';
        } else if (latency < 1000) {
            qualityDisplay.textContent = 'Good';
            qualityDisplay.style.color = 'var(--warning-color)';
        } else {
            qualityDisplay.textContent = 'Fair';
            qualityDisplay.style.color = 'var(--danger-color)';
        }
    }

    updateConnectionStatus(connected) {
        const connectedUsers = document.getElementById('connectedUsers');
        connectedUsers.textContent = connected ? '1' : '0';
    }

    updateStats() {
        // Update stats periodically
        setInterval(() => {
            // Simulate some stats updates
            const now = Date.now();
            if (this.lastStatsUpdate && now - this.lastStatsUpdate > 5000) {
                // Reset latency if no recent activity
                document.getElementById('latencyDisplay').textContent = '0ms';
            }
        }, 1000);
    }

    handleRemoteTranslation(data) {
        // Handle translations from other connected users
        this.showToast(`Remote translation: ${data.translatedText}`, 'info');
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastIcon = toast.querySelector('.toast-icon');
        const toastMessage = toast.querySelector('.toast-message');
        
        // Set icon based on type
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        toastIcon.className = `toast-icon ${icons[type] || icons.info}`;
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        
        // Show toast
        toast.classList.add('show');
        
        // Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.remove('active');
    }

    // Text input fallback when speech recognition fails
    setupTextInputFallback() {
        const inputPanel = document.querySelector('.input-panel .text-display');
        if (inputPanel.querySelector('textarea')) return; // Already setup
        
        inputPanel.innerHTML = `
            <textarea 
                id="textInput" 
                placeholder="Type your message here and press Enter to translate..."
                style="width: 100%; height: 120px; padding: 1rem; border: 2px solid var(--border-color); 
                       border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary);
                       font-family: inherit; font-size: 1rem; resize: vertical;"
            ></textarea>
        `;
        
        const textInput = document.getElementById('textInput');
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = textInput.value.trim();
                if (text) {
                    this.translateText(text);
                    textInput.value = '';
                }
            }
        });
        
        this.showToast('Speech recognition unavailable. You can type instead!', 'info');
    }

    addTextInputButton() {
        const controls = document.querySelector('.input-panel .panel-controls');
        const textBtn = document.createElement('button');
        textBtn.className = 'btn-secondary';
        textBtn.id = 'textInputBtn';
        textBtn.title = 'Switch to Text Input';
        textBtn.innerHTML = '<i class="fas fa-keyboard"></i>';
        textBtn.addEventListener('click', () => {
            this.setupTextInputFallback();
        });
        controls.appendChild(textBtn);
    }

    // Room management methods
    setupRoomEvents() {
        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            this.joinOrCreateRoom();
        });

        document.getElementById('shareRoomBtn').addEventListener('click', () => {
            this.shareRoomLink();
        });

        document.getElementById('sourceLanguage').addEventListener('change', (e) => {
            this.userLanguage = e.target.value;
            if (this.recognition) {
                this.setupLanguageDetection();
            }
            if (this.currentRoom) {
                this.socket.emit('change-language', { language: this.userLanguage });
            }
        });

        document.getElementById('ambientListening').addEventListener('change', (e) => {
            this.ambientListening = e.target.checked;
            if (this.ambientListening && this.currentRoom) {
                this.startAmbientListening();
            } else {
                this.stopAmbientListening();
            }
        });

        document.getElementById('outputMode').addEventListener('change', (e) => {
            this.outputMode = e.target.value;
        });

        document.getElementById('clearFeedBtn').addEventListener('click', () => {
            this.clearConversationFeed();
        });
    }

    checkUrlForRoom() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            document.getElementById('roomIdInput').value = roomId;
            this.showToast('Room ID detected in URL. Enter your name and join!', 'info');
        }
    }

    async joinOrCreateRoom() {
        const roomId = document.getElementById('roomIdInput').value.trim() || this.generateRoomId();
        const userName = document.getElementById('userNameInput').value.trim() || `User${Math.floor(Math.random() * 1000)}`;
        const userLanguage = document.getElementById('sourceLanguage').value;

        this.userName = userName;
        this.userLanguage = userLanguage;
        this.currentRoom = roomId;

        this.socket.emit('join-room', {
            roomId: roomId,
            userName: userName,
            userLanguage: userLanguage
        });

        this.updateRoomStatus('Connecting...', 'connecting');
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async shareRoomLink() {
        if (!this.currentRoom) return;
        
        const shareLink = `${window.location.origin}${window.location.pathname}?room=${this.currentRoom}`;
        
        try {
            await navigator.clipboard.writeText(shareLink);
            this.showToast('Room link copied to clipboard!', 'success');
        } catch (error) {
            // Fallback for browsers that don't support clipboard API
            const textArea = document.createElement('textarea');
            textArea.value = shareLink;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('Room link copied to clipboard!', 'success');
        }
    }

    onRoomJoined(data) {
        this.updateRoomStatus(`Connected to room: ${data.roomId}`, 'connected');
        this.updateRoomUsers(data.users);
        this.showConnectedUsers();
        document.getElementById('shareRoomBtn').style.display = 'inline-block';
        document.getElementById('roomIdInput').value = data.roomId;
        document.getElementById('currentMode').textContent = 'Room Chat';
        
        this.clearConversationFeed();
        this.addSystemMessage(`Welcome to room ${data.roomId}! You can now have real-time conversations.`);
    }

    onUserJoined(data) {
        this.addSystemMessage(`${data.userName} joined the conversation (${data.userLanguage})`);
        this.showToast(`${data.userName} joined`, 'info');
    }

    onUserLeft(data) {
        this.addSystemMessage(`${data.userName} left the conversation`);
        this.showToast(`${data.userName} left`, 'info');
    }

    onLiveTranslation(data) {
        this.addMessageToFeed({
            originalText: data.originalText,
            translatedText: data.translatedText,
            speakerName: data.speakerName,
            isOwn: false,
            timestamp: data.timestamp
        });

        // Auto-play if enabled and output mode allows
        if (this.settings.autoPlay && this.outputMode !== 'text') {
            this.speakTranslation(data.translatedText);
        }

        this.lastTranslation = data.translatedText;
    }

    onNewMessage(data) {
        // This handles non-translated messages (same language users)
        this.addMessageToFeed({
            originalText: data.originalText,
            translatedText: data.originalText,
            speakerName: data.speakerName,
            isOwn: false,
            timestamp: data.timestamp
        });
    }

    onUserLanguageChanged(data) {
        this.addSystemMessage(`${data.userName} switched to ${data.newLanguage}`);
    }

    updateRoomStatus(text, status) {
        const statusElement = document.getElementById('roomStatus');
        const statusText = statusElement.querySelector('.status-text');
        statusText.textContent = text;
        
        statusElement.className = `room-status ${status}`;
    }

    updateRoomUsers(users) {
        const count = Array.isArray(users) ? users.length : users.size;
        document.getElementById('roomUsersCount').textContent = count;
        
        if (Array.isArray(users)) {
            this.displayUsersList(users);
        } else {
            this.displayUsersList(Array.from(users.entries()).map(([id, info]) => ({
                id,
                name: info.userName,
                language: info.userLanguage
            })));
        }
    }

    displayUsersList(users) {
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';
        
        users.forEach(user => {
            const userBadge = document.createElement('div');
            userBadge.className = 'user-badge';
            userBadge.innerHTML = `
                <span class="language-flag">${user.language.toUpperCase()}</span>
                ${user.name}
            `;
            usersList.appendChild(userBadge);
        });
    }

    showConnectedUsers() {
        document.getElementById('connectedUsers').style.display = 'block';
    }

    addMessageToFeed(message) {
        const feed = document.getElementById('conversationFeed');
        const messageElement = document.createElement('div');
        messageElement.className = `conversation-message ${message.isOwn ? 'own' : ''}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="speaker-name">${message.speakerName}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">
                ${message.originalText !== message.translatedText ? 
                    `<div class="original-text">${message.originalText}</div>` : ''}
                <div class="translated-text">${message.translatedText}</div>
            </div>
            <div class="message-actions">
                <button class="message-action" onclick="app.playMessage('${message.translatedText}')">
                    <i class="fas fa-play"></i>
                </button>
                <button class="message-action" onclick="app.copyMessage('${message.translatedText}')">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        `;
        
        feed.appendChild(messageElement);
        feed.scrollTop = feed.scrollHeight;
        
        // Remove placeholder if exists
        const placeholder = feed.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    addSystemMessage(text) {
        const feed = document.getElementById('conversationFeed');
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.style.cssText = `
            padding: 0.5rem 1rem;
            background: var(--bg-tertiary);
            border-radius: var(--radius-sm);
            font-size: 0.875rem;
            color: var(--text-secondary);
            text-align: center;
            font-style: italic;
        `;
        messageElement.textContent = text;
        
        feed.appendChild(messageElement);
        feed.scrollTop = feed.scrollHeight;
        
        const placeholder = feed.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    clearConversationFeed() {
        const feed = document.getElementById('conversationFeed');
        feed.innerHTML = '<p class="placeholder">Conversation will appear here...</p>';
    }

    playMessage(text) {
        this.speakTranslation(text);
    }

    copyMessage(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Message copied', 'success');
        });
    }

    startAmbientListening() {
        if (!this.recognition || this.isRecording) return;
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.startRecording();
        this.showToast('Ambient listening started - app will continuously listen', 'info');
    }

    stopAmbientListening() {
        if (this.isRecording) {
            this.stopRecording();
        }
        this.showToast('Ambient listening stopped', 'info');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check browser compatibility
    const isCompatible = checkBrowserCompatibility();
    if (!isCompatible.compatible) {
        showCompatibilityWarning(isCompatible.issues);
    }
    
    window.app = new LiveTranslationApp();
});

// Browser compatibility check
function checkBrowserCompatibility() {
    const issues = [];
    let compatible = true;
    
    // Check for HTTPS or localhost
    if (!window.isSecureContext && location.protocol !== 'https:' && location.hostname !== 'localhost') {
        issues.push('HTTPS required for microphone access');
        compatible = false;
    }
    
    // Check for Speech Recognition
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        issues.push('Speech recognition not supported (try Chrome or Edge)');
    }
    
    // Check for Speech Synthesis
    if (!('speechSynthesis' in window)) {
        issues.push('Text-to-speech not supported');
    }
    
    // Check for getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        issues.push('Microphone access not supported');
    }
    
    return { compatible, issues };
}

function showCompatibilityWarning(issues) {
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        background: #f59e0b; color: white; padding: 1rem; text-align: center;
        font-weight: 500; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    warning.innerHTML = `
        <strong>Browser Compatibility Issues:</strong><br>
        ${issues.join(' • ')}<br>
        <small>Some features may not work properly. Try Chrome/Edge on HTTPS.</small>
    `;
    document.body.prepend(warning);
    
    setTimeout(() => warning.remove(), 10000);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.app && window.app.isRecording) {
        window.app.stopRecording();
    }
});

// Handle connection status
window.addEventListener('online', () => {
    if (window.app) {
        window.app.showToast('Connection restored', 'success');
    }
});

window.addEventListener('offline', () => {
    if (window.app) {
        window.app.showToast('Connection lost - some features may not work', 'warning');
    }
});

// Handle beforeunload
window.addEventListener('beforeunload', () => {
    if (window.app && window.app.isRecording) {
        window.app.stopRecording();
    }
});
