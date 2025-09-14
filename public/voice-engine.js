// Advanced Voice Engine with Emotion and Tone Preservation
class VoiceEngine {
    constructor() {
        this.synthesis = window.speechSynthesis;
        this.voices = [];
        this.voiceProfiles = new Map();
        this.emotionAnalyzer = new EmotionAnalyzer();
        this.audioContext = null;
        this.audioAnalyzer = null;
        
        this.init();
    }

    async init() {
        await this.loadVoices();
        this.setupAudioContext();
        this.createVoiceProfiles();
    }

    async loadVoices() {
        return new Promise((resolve) => {
            const loadVoicesWhenReady = () => {
                this.voices = this.synthesis.getVoices();
                if (this.voices.length > 0) {
                    resolve();
                } else {
                    setTimeout(loadVoicesWhenReady, 100);
                }
            };
            
            if (this.synthesis.onvoiceschanged !== undefined) {
                this.synthesis.onvoiceschanged = loadVoicesWhenReady;
            }
            
            loadVoicesWhenReady();
        });
    }

    setupAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioAnalyzer = this.audioContext.createAnalyser();
            this.audioAnalyzer.fftSize = 256;
        } catch (error) {
            console.warn('Audio context not available:', error);
        }
    }

    createVoiceProfiles() {
        const languageVoiceMap = {
            'en': { 
                preferred: ['Google US English', 'Microsoft Zira', 'Alex', 'Samantha'],
                fallback: 'en-US'
            },
            'es': { 
                preferred: ['Google español', 'Microsoft Sabina', 'Paulina'],
                fallback: 'es-ES'
            },
            'fr': { 
                preferred: ['Google français', 'Microsoft Hortense', 'Amelie'],
                fallback: 'fr-FR'
            },
            'de': { 
                preferred: ['Google Deutsch', 'Microsoft Katja', 'Anna'],
                fallback: 'de-DE'
            },
            'it': { 
                preferred: ['Google italiano', 'Microsoft Elsa', 'Alice'],
                fallback: 'it-IT'
            },
            'pt': { 
                preferred: ['Google português do Brasil', 'Microsoft Maria', 'Luciana'],
                fallback: 'pt-BR'
            },
            'ru': { 
                preferred: ['Google русский', 'Microsoft Irina', 'Milena'],
                fallback: 'ru-RU'
            },
            'ja': { 
                preferred: ['Google 日本語', 'Microsoft Haruka', 'Kyoko'],
                fallback: 'ja-JP'
            },
            'ko': { 
                preferred: ['Google 한국의', 'Microsoft Heami', 'Yuna'],
                fallback: 'ko-KR'
            },
            'zh': { 
                preferred: ['Google 普通话（中国大陆）', 'Microsoft Huihui', 'Ting-Ting'],
                fallback: 'zh-CN'
            },
            'ar': { 
                preferred: ['Google العربية', 'Microsoft Naayf', 'Maged'],
                fallback: 'ar-SA'
            },
            'hi': { 
                preferred: ['Google हिन्दी', 'Microsoft Kalpana', 'Lekha'],
                fallback: 'hi-IN'
            }
        };

        Object.entries(languageVoiceMap).forEach(([lang, config]) => {
            const bestVoice = this.findBestVoice(config.preferred, config.fallback);
            this.voiceProfiles.set(lang, {
                voice: bestVoice,
                emotionSettings: this.getEmotionSettings(lang),
                prosodySettings: this.getProsodySettings(lang)
            });
        });
    }

    findBestVoice(preferredNames, fallbackLang) {
        // Try to find preferred voices first
        for (const name of preferredNames) {
            const voice = this.voices.find(v => 
                v.name.toLowerCase().includes(name.toLowerCase()) ||
                v.voiceURI.toLowerCase().includes(name.toLowerCase())
            );
            if (voice) return voice;
        }

        // Fallback to language match
        const langVoice = this.voices.find(v => 
            v.lang.startsWith(fallbackLang.split('-')[0])
        );
        
        return langVoice || this.voices[0];
    }

    getEmotionSettings(language) {
        // Language-specific emotion mapping
        const emotionMaps = {
            'en': { happy: { pitch: 1.2, rate: 1.1 }, sad: { pitch: 0.8, rate: 0.9 } },
            'es': { happy: { pitch: 1.3, rate: 1.2 }, sad: { pitch: 0.7, rate: 0.8 } },
            'fr': { happy: { pitch: 1.1, rate: 1.0 }, sad: { pitch: 0.9, rate: 0.9 } },
            'de': { happy: { pitch: 1.0, rate: 1.1 }, sad: { pitch: 0.8, rate: 0.8 } },
            'default': { happy: { pitch: 1.1, rate: 1.1 }, sad: { pitch: 0.9, rate: 0.9 } }
        };
        
        return emotionMaps[language] || emotionMaps.default;
    }

    getProsodySettings(language) {
        // Language-specific prosody (rhythm, stress, intonation)
        const prosodyMaps = {
            'en': { stress: 1.0, rhythm: 1.0, intonation: 1.0 },
            'es': { stress: 1.2, rhythm: 1.1, intonation: 1.2 },
            'fr': { stress: 0.9, rhythm: 0.95, intonation: 1.1 },
            'de': { stress: 1.1, rhythm: 0.9, intonation: 0.9 },
            'it': { stress: 1.3, rhythm: 1.2, intonation: 1.3 },
            'default': { stress: 1.0, rhythm: 1.0, intonation: 1.0 }
        };
        
        return prosodyMaps[language] || prosodyMaps.default;
    }

    async speak(text, options = {}) {
        const {
            language = 'en',
            emotion = 'neutral',
            preserveTone = true,
            rate = 1.0,
            pitch = 1.0,
            volume = 1.0
        } = options;

        // Cancel any ongoing speech
        this.synthesis.cancel();

        const profile = this.voiceProfiles.get(language);
        if (!profile) {
            throw new Error(`Voice profile not found for language: ${language}`);
        }

        // Analyze emotion in text if preserveTone is enabled
        let detectedEmotion = emotion;
        if (preserveTone && text) {
            detectedEmotion = this.emotionAnalyzer.analyze(text);
        }

        // Create utterance with enhanced settings
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = profile.voice;
        utterance.lang = profile.voice.lang;

        // Apply emotion-based modifications
        const emotionSettings = profile.emotionSettings[detectedEmotion] || 
                               profile.emotionSettings.neutral || 
                               { pitch: 1.0, rate: 1.0 };

        // Apply prosody settings
        const prosody = profile.prosodySettings;

        // Combine all settings
        utterance.rate = rate * emotionSettings.rate * prosody.rhythm;
        utterance.pitch = pitch * emotionSettings.pitch * prosody.intonation;
        utterance.volume = volume;

        // Add SSML-like enhancements if supported
        if (this.supportsSSML(profile.voice)) {
            utterance.text = this.enhanceWithSSML(text, detectedEmotion, prosody);
        }

        return new Promise((resolve, reject) => {
            utterance.onstart = () => {
                if (options.onStart) options.onStart();
            };

            utterance.onend = () => {
                if (options.onEnd) options.onEnd();
                resolve();
            };

            utterance.onerror = (event) => {
                if (options.onError) options.onError(event);
                reject(new Error(`Speech synthesis error: ${event.error}`));
            };

            utterance.onpause = () => {
                if (options.onPause) options.onPause();
            };

            utterance.onresume = () => {
                if (options.onResume) options.onResume();
            };

            this.synthesis.speak(utterance);
        });
    }

    supportsSSML(voice) {
        // Check if voice supports SSML (Speech Synthesis Markup Language)
        return voice.name.toLowerCase().includes('google') || 
               voice.name.toLowerCase().includes('microsoft');
    }

    enhanceWithSSML(text, emotion, prosody) {
        // Add SSML tags for better speech synthesis
        let ssmlText = text;

        // Add emotion-based emphasis
        if (emotion === 'happy' || emotion === 'excited') {
            ssmlText = `<emphasis level="strong">${ssmlText}</emphasis>`;
        } else if (emotion === 'sad' || emotion === 'disappointed') {
            ssmlText = `<emphasis level="reduced">${ssmlText}</emphasis>`;
        }

        // Add prosody modifications
        if (prosody.stress !== 1.0 || prosody.rhythm !== 1.0) {
            const prosodyRate = prosody.rhythm < 1.0 ? 'slow' : prosody.rhythm > 1.0 ? 'fast' : 'medium';
            ssmlText = `<prosody rate="${prosodyRate}">${ssmlText}</prosody>`;
        }

        return ssmlText;
    }

    getAvailableVoices(language) {
        return this.voices.filter(voice => 
            voice.lang.startsWith(language) || 
            voice.lang.startsWith(language.split('-')[0])
        );
    }

    setVoiceForLanguage(language, voiceName) {
        const voice = this.voices.find(v => v.name === voiceName);
        if (voice && this.voiceProfiles.has(language)) {
            this.voiceProfiles.get(language).voice = voice;
        }
    }

    pause() {
        this.synthesis.pause();
    }

    resume() {
        this.synthesis.resume();
    }

    stop() {
        this.synthesis.cancel();
    }

    isSpeaking() {
        return this.synthesis.speaking;
    }

    isPaused() {
        return this.synthesis.paused;
    }
}

// Emotion Analysis for Voice Tone Preservation
class EmotionAnalyzer {
    constructor() {
        this.emotionKeywords = {
            happy: ['happy', 'joy', 'excited', 'great', 'wonderful', 'amazing', 'fantastic', 'excellent', 'love', 'smile', 'laugh'],
            sad: ['sad', 'sorry', 'disappointed', 'upset', 'cry', 'tears', 'hurt', 'pain', 'miss', 'lost'],
            angry: ['angry', 'mad', 'furious', 'rage', 'hate', 'annoyed', 'frustrated', 'irritated'],
            surprised: ['wow', 'amazing', 'incredible', 'unbelievable', 'shocking', 'surprised', 'astonished'],
            fear: ['scared', 'afraid', 'terrified', 'worried', 'anxious', 'nervous', 'panic'],
            neutral: ['okay', 'fine', 'normal', 'regular', 'standard', 'typical']
        };

        this.punctuationEmotions = {
            '!': 'excited',
            '?': 'curious',
            '...': 'thoughtful',
            '.': 'neutral'
        };
    }

    analyze(text) {
        if (!text || typeof text !== 'string') {
            return 'neutral';
        }

        const lowerText = text.toLowerCase();
        const emotions = Object.keys(this.emotionKeywords);
        const emotionScores = {};

        // Initialize scores
        emotions.forEach(emotion => {
            emotionScores[emotion] = 0;
        });

        // Analyze keywords
        emotions.forEach(emotion => {
            this.emotionKeywords[emotion].forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const matches = lowerText.match(regex);
                if (matches) {
                    emotionScores[emotion] += matches.length;
                }
            });
        });

        // Analyze punctuation
        const lastChar = text.trim().slice(-1);
        if (this.punctuationEmotions[lastChar]) {
            const punctEmotion = this.punctuationEmotions[lastChar];
            if (emotionScores.hasOwnProperty(punctEmotion)) {
                emotionScores[punctEmotion] += 0.5;
            }
        }

        // Analyze capitalization (indicates excitement/emphasis)
        const capsCount = (text.match(/[A-Z]/g) || []).length;
        const totalLetters = (text.match(/[a-zA-Z]/g) || []).length;
        if (totalLetters > 0 && capsCount / totalLetters > 0.3) {
            emotionScores.excited = (emotionScores.excited || 0) + 1;
        }

        // Find dominant emotion
        let dominantEmotion = 'neutral';
        let maxScore = 0;

        Object.entries(emotionScores).forEach(([emotion, score]) => {
            if (score > maxScore) {
                maxScore = score;
                dominantEmotion = emotion;
            }
        });

        return maxScore > 0 ? dominantEmotion : 'neutral';
    }

    getEmotionIntensity(text) {
        const emotion = this.analyze(text);
        const lowerText = text.toLowerCase();
        
        // Calculate intensity based on various factors
        let intensity = 0.5; // Base intensity

        // Punctuation intensity
        const exclamationCount = (text.match(/!/g) || []).length;
        const questionCount = (text.match(/\?/g) || []).length;
        intensity += Math.min(exclamationCount * 0.2, 0.4);
        intensity += Math.min(questionCount * 0.1, 0.2);

        // Capitalization intensity
        const capsCount = (text.match(/[A-Z]/g) || []).length;
        const totalLetters = (text.match(/[a-zA-Z]/g) || []).length;
        if (totalLetters > 0) {
            intensity += Math.min((capsCount / totalLetters) * 0.5, 0.3);
        }

        // Word repetition (indicates emphasis)
        const words = lowerText.split(/\s+/);
        const wordCount = {};
        words.forEach(word => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });
        
        const maxRepetition = Math.max(...Object.values(wordCount));
        if (maxRepetition > 1) {
            intensity += Math.min((maxRepetition - 1) * 0.1, 0.2);
        }

        return Math.min(intensity, 1.0);
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VoiceEngine, EmotionAnalyzer };
} else {
    window.VoiceEngine = VoiceEngine;
    window.EmotionAnalyzer = EmotionAnalyzer;
}
