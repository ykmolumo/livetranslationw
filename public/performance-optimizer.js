// Performance Optimization and Cross-Platform Compatibility Module
class PerformanceOptimizer {
    constructor() {
        this.isWebWorkerSupported = typeof Worker !== 'undefined';
        this.isServiceWorkerSupported = 'serviceWorker' in navigator;
        this.isWebAssemblySupported = typeof WebAssembly !== 'undefined';
        this.isMobile = this.detectMobile();
        this.connectionType = this.getConnectionType();
        
        this.audioBufferCache = new Map();
        this.translationCache = new Map();
        this.maxCacheSize = 100;
        
        this.init();
    }

    init() {
        this.setupServiceWorker();
        this.setupPerformanceMonitoring();
        this.optimizeForDevice();
        this.preloadCriticalResources();
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    getConnectionType() {
        if ('connection' in navigator) {
            return navigator.connection.effectiveType || 'unknown';
        }
        return 'unknown';
    }

    async setupServiceWorker() {
        if (!this.isServiceWorkerSupported) return;

        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration);
        } catch (error) {
            console.warn('Service Worker registration failed:', error);
        }
    }

    setupPerformanceMonitoring() {
        // Monitor performance metrics
        this.performanceMetrics = {
            translationLatency: [],
            speechRecognitionLatency: [],
            ttsLatency: [],
            memoryUsage: [],
            cpuUsage: []
        };

        // Collect metrics every 5 seconds
        setInterval(() => {
            this.collectPerformanceMetrics();
        }, 5000);
    }

    collectPerformanceMetrics() {
        // Memory usage
        if ('memory' in performance) {
            const memory = performance.memory;
            this.performanceMetrics.memoryUsage.push({
                timestamp: Date.now(),
                used: memory.usedJSHeapSize,
                total: memory.totalJSHeapSize,
                limit: memory.jsHeapSizeLimit
            });
        }

        // Keep only last 50 measurements
        Object.keys(this.performanceMetrics).forEach(key => {
            if (this.performanceMetrics[key].length > 50) {
                this.performanceMetrics[key] = this.performanceMetrics[key].slice(-50);
            }
        });
    }

    optimizeForDevice() {
        const optimizations = {
            mobile: {
                audioSampleRate: 16000,
                maxConcurrentTranslations: 1,
                cacheSize: 50,
                enableAudioCompression: true,
                reduceAnimations: true
            },
            desktop: {
                audioSampleRate: 44100,
                maxConcurrentTranslations: 3,
                cacheSize: 100,
                enableAudioCompression: false,
                reduceAnimations: false
            }
        };

        const config = this.isMobile ? optimizations.mobile : optimizations.desktop;
        this.applyOptimizations(config);
    }

    applyOptimizations(config) {
        // Apply device-specific optimizations
        this.maxCacheSize = config.cacheSize;
        
        if (config.reduceAnimations) {
            document.documentElement.style.setProperty('--transition', 'none');
        }

        // Adjust audio settings
        this.audioConfig = {
            sampleRate: config.audioSampleRate,
            enableCompression: config.enableAudioCompression
        };
    }

    async preloadCriticalResources() {
        // Preload critical translation pairs
        const commonPairs = [
            { from: 'en', to: 'es' },
            { from: 'en', to: 'fr' },
            { from: 'es', to: 'en' },
            { from: 'fr', to: 'en' }
        ];

        // Preload common phrases
        const commonPhrases = [
            'Hello', 'Thank you', 'Please', 'Excuse me', 'How are you?',
            'Where is...?', 'I need help', 'Do you speak English?'
        ];

        // Cache common translations in background
        this.preloadTranslations(commonPairs, commonPhrases);
    }

    async preloadTranslations(languagePairs, phrases) {
        for (const pair of languagePairs) {
            for (const phrase of phrases) {
                try {
                    const cacheKey = `${phrase}_${pair.from}_${pair.to}`;
                    if (!this.translationCache.has(cacheKey)) {
                        // Simulate translation preloading (would use actual API in production)
                        setTimeout(() => {
                            this.translationCache.set(cacheKey, {
                                text: phrase,
                                translation: `[${pair.to}] ${phrase}`, // Placeholder
                                timestamp: Date.now()
                            });
                        }, Math.random() * 1000);
                    }
                } catch (error) {
                    console.warn('Preload translation failed:', error);
                }
            }
        }
    }

    // Translation caching with LRU eviction
    cacheTranslation(originalText, translatedText, sourceLang, targetLang) {
        const key = `${originalText}_${sourceLang}_${targetLang}`;
        
        if (this.translationCache.size >= this.maxCacheSize) {
            // Remove oldest entry (LRU)
            const oldestKey = this.translationCache.keys().next().value;
            this.translationCache.delete(oldestKey);
        }

        this.translationCache.set(key, {
            originalText,
            translatedText,
            sourceLang,
            targetLang,
            timestamp: Date.now(),
            hitCount: 0
        });
    }

    getCachedTranslation(text, sourceLang, targetLang) {
        const key = `${text}_${sourceLang}_${targetLang}`;
        const cached = this.translationCache.get(key);
        
        if (cached) {
            cached.hitCount++;
            cached.lastAccessed = Date.now();
            return cached;
        }
        
        return null;
    }

    // Audio buffer caching for TTS
    cacheAudioBuffer(text, language, audioBuffer) {
        const key = `${text}_${language}`;
        
        if (this.audioBufferCache.size >= this.maxCacheSize) {
            const oldestKey = this.audioBufferCache.keys().next().value;
            this.audioBufferCache.delete(oldestKey);
        }

        this.audioBufferCache.set(key, {
            buffer: audioBuffer,
            timestamp: Date.now()
        });
    }

    getCachedAudioBuffer(text, language) {
        const key = `${text}_${language}`;
        return this.audioBufferCache.get(key);
    }

    // Debounced translation to prevent excessive API calls
    createDebouncedTranslation(translationFunction, delay = 300) {
        let timeoutId;
        
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                translationFunction.apply(this, args);
            }, delay);
        };
    }

    // Batch translation requests
    async batchTranslate(requests) {
        const batchSize = this.isMobile ? 3 : 10;
        const results = [];

        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);
            const batchPromises = batch.map(request => this.translateSingle(request));
            
            try {
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            } catch (error) {
                console.error('Batch translation error:', error);
                // Fallback to individual requests
                for (const request of batch) {
                    try {
                        const result = await this.translateSingle(request);
                        results.push(result);
                    } catch (individualError) {
                        results.push({ error: individualError.message });
                    }
                }
            }
        }

        return results;
    }

    async translateSingle(request) {
        // Check cache first
        const cached = this.getCachedTranslation(
            request.text, 
            request.sourceLang, 
            request.targetLang
        );
        
        if (cached) {
            return {
                originalText: cached.originalText,
                translatedText: cached.translatedText,
                fromCache: true
            };
        }

        // Perform actual translation
        const startTime = Date.now();
        
        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });
            
            const result = await response.json();
            const latency = Date.now() - startTime;
            
            // Record performance metric
            this.performanceMetrics.translationLatency.push({
                timestamp: Date.now(),
                latency,
                textLength: request.text.length
            });

            // Cache the result
            if (result.success) {
                this.cacheTranslation(
                    request.text,
                    result.translatedText,
                    request.sourceLang,
                    request.targetLang
                );
            }

            return result;
        } catch (error) {
            throw new Error(`Translation failed: ${error.message}`);
        }
    }

    // Adaptive quality based on connection and device
    getOptimalQuality() {
        const qualityLevels = {
            '4g': { audioQuality: 'high', translationTimeout: 5000 },
            '3g': { audioQuality: 'medium', translationTimeout: 8000 },
            '2g': { audioQuality: 'low', translationTimeout: 12000 },
            'slow-2g': { audioQuality: 'low', translationTimeout: 15000 },
            'unknown': { audioQuality: 'medium', translationTimeout: 8000 }
        };

        let quality = qualityLevels[this.connectionType] || qualityLevels.unknown;

        // Adjust for mobile devices
        if (this.isMobile) {
            quality.translationTimeout *= 1.2;
            if (quality.audioQuality === 'high') {
                quality.audioQuality = 'medium';
            }
        }

        return quality;
    }

    // Memory management
    cleanupCache() {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes

        // Clean translation cache
        for (const [key, value] of this.translationCache.entries()) {
            if (now - value.timestamp > maxAge) {
                this.translationCache.delete(key);
            }
        }

        // Clean audio buffer cache
        for (const [key, value] of this.audioBufferCache.entries()) {
            if (now - value.timestamp > maxAge) {
                this.audioBufferCache.delete(key);
            }
        }
    }

    // Performance monitoring and reporting
    getPerformanceReport() {
        const report = {
            device: {
                isMobile: this.isMobile,
                connectionType: this.connectionType,
                userAgent: navigator.userAgent
            },
            cache: {
                translationCacheSize: this.translationCache.size,
                audioCacheSize: this.audioBufferCache.size,
                hitRatio: this.calculateCacheHitRatio()
            },
            performance: {
                averageTranslationLatency: this.calculateAverageLatency('translationLatency'),
                averageTTSLatency: this.calculateAverageLatency('ttsLatency'),
                memoryUsage: this.getLatestMemoryUsage()
            }
        };

        return report;
    }

    calculateCacheHitRatio() {
        let totalHits = 0;
        let totalRequests = 0;

        for (const cached of this.translationCache.values()) {
            totalHits += cached.hitCount;
            totalRequests += cached.hitCount + 1; // +1 for initial cache
        }

        return totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
    }

    calculateAverageLatency(metricType) {
        const metrics = this.performanceMetrics[metricType];
        if (metrics.length === 0) return 0;

        const sum = metrics.reduce((acc, metric) => acc + metric.latency, 0);
        return sum / metrics.length;
    }

    getLatestMemoryUsage() {
        const memoryMetrics = this.performanceMetrics.memoryUsage;
        return memoryMetrics.length > 0 ? memoryMetrics[memoryMetrics.length - 1] : null;
    }

    // Cleanup method
    destroy() {
        // Clear intervals and cleanup resources
        this.translationCache.clear();
        this.audioBufferCache.clear();
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Cross-platform compatibility utilities
class CrossPlatformUtils {
    static getOptimalAudioFormat() {
        const audio = new Audio();
        
        if (audio.canPlayType('audio/webm; codecs="opus"')) {
            return 'webm';
        } else if (audio.canPlayType('audio/mp4; codecs="aac"')) {
            return 'mp4';
        } else if (audio.canPlayType('audio/ogg; codecs="vorbis"')) {
            return 'ogg';
        } else {
            return 'wav'; // Fallback
        }
    }

    static isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    static supportsWebRTC() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    static getOptimalWorkerCount() {
        return navigator.hardwareConcurrency || 4;
    }

    static detectBrowserCapabilities() {
        return {
            webAudio: !!(window.AudioContext || window.webkitAudioContext),
            webRTC: this.supportsWebRTC(),
            webWorkers: typeof Worker !== 'undefined',
            serviceWorkers: 'serviceWorker' in navigator,
            webAssembly: typeof WebAssembly !== 'undefined',
            speechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
            speechSynthesis: 'speechSynthesis' in window,
            mediaRecorder: typeof MediaRecorder !== 'undefined'
        };
    }
}

// Export modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PerformanceOptimizer, CrossPlatformUtils };
} else {
    window.PerformanceOptimizer = PerformanceOptimizer;
    window.CrossPlatformUtils = CrossPlatformUtils;
}
