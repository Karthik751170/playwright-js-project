const UploadUtil = require("./UploadUtil");

class AnswerEngine {

    constructor(page, surveyLogics = []) {
        this.page = page;
        this.surveyLogics = surveyLogics;
        this.uploadedQuestions = new Set();
    }

    getAiContext() {
        let baseContext = "I am a consumer taking a market research survey.";
        if (this.surveyLogics && this.surveyLogics.length > 0) {
            const logicsText = this.surveyLogics.map(l => l.text).join('\n\n');
            if (this.logicMode === 'trigger') {
                baseContext += `\n\nCRITICAL INSTRUCTION: You are validating survey logic rules! Whenever applicable, SELECT the answer option that triggers the following logic rule (e.g. skip/redirect/terminate) so we can test that the condition works properly:\n${logicsText}`;
            } else {
                baseContext += `\n\nCRITICAL INSTRUCTION: DO NOT select answers that would trigger any of the following early termination or skip logics! Avoid them at all costs:\n${logicsText}`;
            }
        }
        return baseContext;
    }

    async dumpActiveQuestionDOM(elements) {
        try {
            const container = elements.activeQuestion;
            if (!container) return;

            const fs = require('fs');
            const path = require('path');
            
            const html = await container.innerHTML().catch(() => "");
            
            const scratchDir = '/Users/karthiku/playwright-js-project/scratch';
            if (!fs.existsSync(scratchDir)) {
                fs.mkdirSync(scratchDir, { recursive: true });
            }
            
            fs.writeFileSync(path.join(scratchDir, 'active_question_dom.html'), html);
            console.log(`[AnswerEngine] Dumped HTML of active question to: scratch/active_question_dom.html`);
        } catch (err) {
            console.error("[AnswerEngine] Failed to dump active question DOM:", err.message);
        }
    }

    /**
     * Extracts full question text and inspects any visual images (animals, birds, products)
     * as well as audio/sound elements from the DOM to provide rich context to Groq.
     */
    async extractQuestionInfo(container) {
        let questionText = ((await container.innerText().catch(() => "")) || "").trim();

        // 1. Scan all images in active question
        const images = container.locator('img, [style*="url("], [style*="background-image"]');
        const imgCount = await images.count();
        const imageDetails = [];

        for (let i = 0; i < imgCount; i++) {
            const el = images.nth(i);
            let src = (await el.getAttribute('src').catch(() => "")) || "";
            let srcset = (await el.getAttribute('srcset').catch(() => "")) || "";
            let alt = (await el.getAttribute('alt').catch(() => "")) || "";
            let title = (await el.getAttribute('title').catch(() => "")) || "";
            let style = (await el.getAttribute('style').catch(() => "")) || "";

            let rawUrl = src || srcset;
            if (!rawUrl && style.includes('url(')) {
                const bgMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (bgMatch) rawUrl = bgMatch[1];
            }

            if (rawUrl) {
                const nextUrlMatch = rawUrl.match(/url=([^&]+)/);
                if (nextUrlMatch) {
                    try {
                        rawUrl = decodeURIComponent(nextUrlMatch[1]);
                    } catch (e) {
                        rawUrl = nextUrlMatch[1];
                    }
                }

                let filename = "";
                let cleanName = "";
                try {
                    const pathname = new URL(rawUrl.startsWith('http') ? rawUrl : `https://example.com/${rawUrl}`).pathname;
                    filename = pathname.split('/').pop() || "";
                    cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
                } catch (e) {
                    const parts = rawUrl.split(/[/?#]/);
                    filename = parts.pop() || parts.pop() || "";
                    cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
                }

                // Hercules image group catalog for composite animal & attention check images
                const HERCULES_IMAGE_CATALOG = {
                    'group-16': 'Toucan, Giraffe, Pink Hippo, Zebra, Elephant, Tiger',
                    'group-1': 'Lion, Zebra, Giraffe',
                    'group-2': 'Elephant, Monkey, Parrot, Toucan',
                    'group-3': 'Bear, Deer, Fox, Rabbit',
                    'group-4': 'Dolphin, Whale, Seal, Penguin',
                    'group-5': 'Eagle, Hawk, Falcon, Owl, Toucan',
                    'group-6': 'Horse, Cow, Sheep, Goat',
                    'group-7': 'Dog, Puppy, Cat, Kitten',
                    'group-8': 'Duck, Swan, Goose, Flamingo',
                    'group-9': 'Cheetah, Leopard, Panther, Jaguar',
                    'group-10': 'Kangaroo, Koala, Wombat, Platypus'
                };

                const baseKey = filename.replace(/\.[^/.]+$/, "").toLowerCase();
                if (HERCULES_IMAGE_CATALOG[baseKey]) {
                    cleanName = HERCULES_IMAGE_CATALOG[baseKey];
                }

                // Ignore utility icons/spinners
                if (/^(icon|chevron|arrow|spinner|check|close|copy|avatar|radio|tick|dots)$/i.test(cleanName) && !alt) {
                    continue;
                }

                imageDetails.push({
                    url: rawUrl,
                    filename: filename,
                    name: cleanName,
                    alt: alt,
                    title: title
                });
            }
        }

        // 2. Scan all audio / sound elements in active question
        const audioDetails = [];
        try {
            const domAudioInfo = await this.page.evaluate(() => {
                const audios = Array.from(document.querySelectorAll('audio, audio source, [data-audio], [data-sound]'));
                return audios.map(a => {
                    return {
                        src: a.currentSrc || a.src || a.getAttribute('data-audio') || a.getAttribute('data-sound') || '',
                        aria: a.getAttribute('aria-label') || a.getAttribute('title') || ''
                    };
                }).filter(a => !!a.src || !!a.aria);
            }).catch(() => []);

            const audioButtons = container.locator("button[aria-label*='sound' i], button[aria-label*='audio' i], button[aria-label*='play' i], [data-audio], [data-sound]");
            const btnCount = await audioButtons.count();
            for (let b = 0; b < btnCount; b++) {
                const btn = audioButtons.nth(b);
                const aria = (await btn.getAttribute('aria-label').catch(() => "")) || "";
                const dataAudio = (await btn.getAttribute('data-audio').catch(() => "")) || (await btn.getAttribute('data-sound').catch(() => "")) || "";
                if (aria || dataAudio) {
                    domAudioInfo.push({ src: dataAudio, aria: aria });
                }
            }

            // Hercules official audio clip catalog mapping
            const HERCULES_AUDIO_CATALOG = {
                'clip-1': 'Dog barking canine puppy',
                'clip-2': 'Cat meow kitten feline',
                'clip-3': 'Cow moo cattle bovine',
                'clip-4': 'Horse neigh stallion equine',
                'clip-5': 'Donkey bray mule',
                'clip-6': 'Chicken rooster crow hen cluck poultry',
                'clip-7': 'Turkey gobble bird poultry',
                'clip-8': 'Crow caw black bird',
                'clip-9': 'Owl hoot nocturnal bird',
                'clip-10': 'Frog croak amphibian',
                'clip-11': 'Pigeon coo bird dove',
                'clip-12': 'Peacock call bird scream feather',
                'clip-13': 'Bee buzz honeybee insect',
                'clip-14': 'Lion roar wild big cat',
                'clip-15': 'Elephant trumpet pachyderm',
                'clip-16': 'Tiger roar big cat striped',
                'clip-17': 'Bear growl roar grizzly wild animal',
                'clip-18': 'Sheep baa lamb wool',
                'clip-19': 'Pig oink swine hog',
                'clip-20': 'Fox yip bark wild canine'
            };

            // Check if active container text explicitly mentions a clip (e.g. "clip-06.mp3" or "clip-13.mp3")
            const clipTextMatch = questionText.match(/clip-(\d+)(\.mp3)?/i);
            if (clipTextMatch) {
                const clipNum = parseInt(clipTextMatch[1], 10);
                const clipKey = `clip-${clipNum}`;
                const soundName = HERCULES_AUDIO_CATALOG[clipKey] || `Animal sound from clip-${clipNum}`;
                audioDetails.push({
                    url: `${clipKey}.mp3`,
                    filename: `clip-${clipTextMatch[1]}.mp3`,
                    name: soundName,
                    label: `Audio sound of ${soundName}`
                });
            }

            for (const item of domAudioInfo) {
                let rawUrl = item.src;
                let filename = "";
                let cleanName = "";
                if (rawUrl) {
                    const nextUrlMatch = rawUrl.match(/url=([^&]+)/);
                    if (nextUrlMatch) {
                        try { rawUrl = decodeURIComponent(nextUrlMatch[1]); } catch (e) { rawUrl = nextUrlMatch[1]; }
                    }
                    try {
                        const pathname = new URL(rawUrl.startsWith('http') ? rawUrl : `https://example.com/${rawUrl}`).pathname;
                        filename = pathname.split('/').pop() || "";
                        cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
                    } catch (e) {
                        const parts = rawUrl.split(/[/?#]/);
                        filename = parts.pop() || parts.pop() || "";
                        cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
                    }
                }

                const baseKey = filename.replace(/\.[^/.]+$/, "").toLowerCase();
                const numMatch = baseKey.match(/clip-(\d+)/);
                const normKey = numMatch ? `clip-${parseInt(numMatch[1], 10)}` : baseKey;
                if (HERCULES_AUDIO_CATALOG[normKey]) {
                    cleanName = HERCULES_AUDIO_CATALOG[normKey];
                }

                if (!cleanName && item.aria) {
                    cleanName = item.aria.replace(/^play\s*|audio\s*|sound\s*of\s*/gi, '').trim();
                }

                if (cleanName || filename) {
                    audioDetails.push({
                        url: rawUrl,
                        filename: filename,
                        name: cleanName,
                        label: item.aria
                    });
                }
            }
        } catch (e) {}

        // 3. Scan video elements
        try {
            const domVideoSrc = await this.page.evaluate(() => {
                const v = document.querySelector('video, [data-video-wrapper] video');
                return v ? (v.src || v.currentSrc || '') : '';
            }).catch(() => '');

            if (domVideoSrc) {
                const HERCULES_VIDEO_CATALOG = {
                    'dog-owl': 'Owl hooting nocturnal bird',
                    'lion-elephant': 'Elephant trumpet pachyderm',
                    'elephant-lion': 'Lion roaring big cat',
                    'cat-dog': 'Dog barking canine',
                    'dog-cat': 'Cat meowing feline',
                    'horse-lion': 'Lion roaring big cat',
                    'cow-sheep': 'Sheep baa lamb',
                    'bear-chicken': 'Chicken rooster crow hen'
                };
                const cleanVid = domVideoSrc.split('/').pop().replace(/\.[^/.]+$/, '').toLowerCase();
                let soundAnimal = cleanVid;
                if (cleanVid.includes('-')) {
                    const parts = cleanVid.split('-');
                    soundAnimal = parts[parts.length - 1]; // In [visual]-[sound].mp4, the sound is the 2nd animal
                }
                const vidSubject = HERCULES_VIDEO_CATALOG[cleanVid] || `${soundAnimal} (Animal sound heard in video)`;
                audioDetails.push({
                    url: domVideoSrc,
                    filename: `${cleanVid}.mp4`,
                    name: vidSubject,
                    label: `Audio sound heard in video: ${vidSubject}`
                });
            }
        } catch (e) {}

        if (imageDetails.length > 0) {
            const imgSummary = imageDetails.map((img, idx) => {
                let desc = `[Image ${idx + 1} shown on screen:`;
                if (img.name) desc += ` Visual subject/Name = "${img.name}"`;
                if (img.filename) desc += ` (Filename: ${img.filename})`;
                if (img.url && img.url.startsWith('http')) desc += ` (Image URL: ${img.url})`;
                if (img.alt && img.alt !== 'Question Image') desc += `, Alt text = "${img.alt}"`;
                desc += `]`;
                return desc;
            }).join('\n');

            questionText += `\n\nATTACHED QUESTION VISUAL / IMAGE DETAILS:\n${imgSummary}\n(CRITICAL VISUAL RECOGNITION INSTRUCTION: The question asks to identify/match the photo on screen. Choose the answer option that accurately names this visual subject!)`;
        }

        if (audioDetails.length > 0) {
            const audioSummary = audioDetails.map((aud, idx) => {
                let desc = `[Audio ${idx + 1} played on screen:`;
                if (aud.name) desc += ` Sound/Subject = "${aud.name}"`;
                if (aud.filename) desc += ` (Filename: ${aud.filename})`;
                if (aud.label) desc += `, Label = "${aud.label}"`;
                desc += `]`;
                return desc;
            }).join('\n');

            questionText += `\n\nATTACHED QUESTION AUDIO / SOUND DETAILS:\n${audioSummary}\n(CRITICAL AUDIO RECOGNITION INSTRUCTION: The question asks to listen to an audio sound clip. The sound heard is "${audioDetails.map(d => d.name).filter(Boolean).join(', ')}". Choose the picture/option that corresponds to the animal or object that makes this sound!)`;
        }

        return { questionText, imageDetails, audioDetails };
    }

    async extractOptionText(locator) {
        let text = ((await locator.innerText().catch(() => "")) || "").trim();
        
        // Check if option contains an image
        const img = locator.locator('img, [style*="url("], [style*="background-image"]').first();
        if (await img.count() > 0) {
            let src = (await img.getAttribute('src').catch(() => "")) || "";
            let alt = (await img.getAttribute('alt').catch(() => "")) || "";
            let style = (await img.getAttribute('style').catch(() => "")) || "";
            let rawUrl = src;
            if (!rawUrl && style.includes('url(')) {
                const bgMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (bgMatch) rawUrl = bgMatch[1];
            }
            if (rawUrl) {
                const nextMatch = rawUrl.match(/url=([^&]+)/);
                if (nextMatch) {
                    try { rawUrl = decodeURIComponent(nextMatch[1]); } catch(e){}
                }
                const parts = rawUrl.split(/[/?#]/);
                const fname = parts.pop() || "";
                const cname = fname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
                if (cname && !/^(icon|check|radio|tick|dots|dropdown|arrow|chevron|control)$/i.test(cname)) {
                    text = text ? `${text} (Image: ${cname})` : cname;
                } else if (alt && !/^(dropdown|icon|check|arrow|chevron|control)$/i.test(alt)) {
                    text = text ? `${text} (${alt})` : alt;
                }
            }
        }
        return text;
    }

    async answer(elements, isLastQuestion = false) {
        const activeQ = elements.activeQuestion;
        if (activeQ) {
            const text = await activeQ.innerText().catch(() => "");
            console.log(`[AnswerEngine] Inspecting Active Question: "${text.substring(0, 150).replace(/\s+/g, ' ')}..."`);
            await this.dumpActiveQuestionDOM(elements);
        }

        await this.handleMoreOptions(elements);
        
        const playedAudio = await this.handleAudio(elements);
        const playedVideo = await this.handleVideo(elements);
        
        if (playedAudio || playedVideo) {
            const ActiveQuestionFinder = require("./ActiveQuestionFinder");
            const finder = new ActiveQuestionFinder(this.page);
            const activeData = await finder.getActiveQuestion(5000);
            if (activeData && activeData.container) {
                elements.activeQuestion = activeData.container;
                console.log("[AnswerEngine] Active question re-fetched post-audio/video playback.");
                await this.dumpActiveQuestionDOM(elements);
            }
        }

        const handlers = [
            this.answerDropdown?.bind(this), // Must run FIRST so dropdowns are properly saved
            this.answerRanking?.bind(this),
            this.answerFileUpload?.bind(this),
            this.answerCustomOptionCard?.bind(this),
            this.answerTextbox?.bind(this),
            this.answerRating?.bind(this),
            this.answerYesNo?.bind(this),
            this.answerCheckbox?.bind(this),
            this.answerMultiSelect?.bind(this),
            this.answerSingleChoice?.bind(this),
            this.answerRadio?.bind(this),
            this.answerGenericOption?.bind(this)
        ].filter(Boolean);

        for (const handler of handlers) {

            const handled = await handler(elements);

            if (handled) {
                return true;
            }
        }

        return false;
    }

    // ============================================
    // More Options
    // ============================================

    async handleMoreOptions(elements) {
        try {
            let maxAttempts = 10;
            while (maxAttempts > 0) {
                maxAttempts--;
                const candidates = this.page.locator("//p[contains(text(), 'More options') or contains(text(), 'more options')] | //span[contains(text(), 'More options') or contains(text(), 'more options')] | //button[contains(., 'More options') or contains(., 'more options')] | //div[contains(text(), 'More options') or contains(text(), 'more options')]");

                const count = await candidates.count();
                let clickedAny = false;

                for (let i = 0; i < count; i++) {
                    const btn = candidates.nth(i);
                    if (await btn.isVisible().catch(() => false)) {
                        const text = ((await btn.innerText().catch(() => "")) || "").trim();
                        if (/more options/i.test(text) && text.length < 40) {
                            console.log(`[AnswerEngine] Found 'More options' button ("${text.replace(/\s+/g, ' ')}")! Expanding options...`);
                            await btn.scrollIntoViewIfNeeded().catch(() => {});
                            await this.page.waitForTimeout(500);
                            await btn.click({ force: true, timeout: 5000 }).catch(async () => {
                                await btn.evaluate(el => el.click()).catch(() => {});
                            });
                            await this.page.waitForTimeout(1500); // Allow DOM options to expand
                            clickedAny = true;
                            break;
                        }
                    }
                }

                if (!clickedAny) {
                    break;
                }
            }
        } catch (e) {
            console.log("[AnswerEngine] Error in handleMoreOptions loop:", e.message);
        }
    }

    // ============================================
    // Audio Player & Playback Handler
    // ============================================

    async handleAudio(elements) {
        try {
            const container = elements.activeQuestion;
            if (!container) return false;

            // User specified: [alt='Control'] for audio click this button
            const controlImg = container.locator("img[alt='Control'], [alt='Control']").first();
            const audioBtn = container.locator(
                "img[alt='Control'], [alt='Control'], button:has(img[alt='Control']), " +
                "button:has(img[src*='play']), button:has(img[src*='audio']), " +
                "button:has-text('Play'), button:has-text('Listen'), button:has-text('Audio'), button:has-text('Sound'), " +
                "button[aria-label*='audio' i], button[aria-label*='play' i], button[aria-label*='listen' i], button[aria-label*='sound' i], button[aria-label*='speaker' i], " +
                "div[role='button'][aria-label*='play' i], div[role='button'][aria-label*='audio' i], div[role='button']:has-text('Play'), " +
                "svg[class*='volume' i], svg[class*='speaker' i], svg[class*='audio' i], svg[class*='lucide-volume' i], svg[class*='lucide-play' i], " +
                "img[alt*='audio' i], img[alt*='speaker' i], img[alt*='sound' i], img[alt*='play' i], [data-testid*='audio' i], [data-testid*='play' i]"
            ).first();

            const audioEl = container.locator('audio, audio source');

            if ((await audioBtn.count() > 0 && await audioBtn.isVisible().catch(() => false)) || await audioEl.count() > 0) {
                console.log("[AnswerEngine] Audio question component detected!");

                if (await controlImg.isVisible().catch(() => false)) {
                    const src = await controlImg.getAttribute('src').catch(() => '');
                    // Only click if it's currently showing PLAY icon (not PAUSE icon)
                    if (!src.includes('pause')) {
                        console.log("[AnswerEngine] Clicking audio control button ([alt='Control'])...");
                        await controlImg.scrollIntoViewIfNeeded().catch(() => {});
                        await controlImg.click({ force: true, timeout: 5000 }).catch(async () => {
                            await controlImg.evaluate(el => el.click()).catch(() => {});
                        });
                    } else {
                        console.log("[AnswerEngine] Audio is already playing/paused ([alt='Control'] has pause state).");
                    }
                } else if (await audioBtn.count() > 0 && await audioBtn.isVisible().catch(() => false)) {
                    console.log("[AnswerEngine] Clicking fallback audio play button...");
                    await audioBtn.scrollIntoViewIfNeeded().catch(() => {});
                    await audioBtn.click({ force: true, timeout: 5000 }).catch(async () => {
                        await audioBtn.evaluate(el => el.click()).catch(() => {});
                    });
                }
                
                // Play HTML5 audio if present
                await this.page.evaluate(() => {
                    const audios = Array.from(document.querySelectorAll('audio'));
                    audios.forEach(a => {
                        if (a && typeof a.play === 'function') a.play().catch(() => {});
                    });
                }).catch(() => {});

                // Wait 8 seconds for audio clip to finish playing completely so Next button unlocks
                console.log("[AnswerEngine] Waiting 8 seconds for audio clip to play completely...");
                await this.page.waitForTimeout(8000);
                return true;
            }
        } catch (e) {
            console.log("[AnswerEngine] Error in handleAudio:", e.message);
        }
        return false;
    }

    // ============================================
    // Video
    // ============================================

    async handleVideo(elements) {
        try {
            const container = elements.activeQuestion;
            if (!container) return false;

            const play = container.locator(
                "div[data-video-wrapper] div:has-text('▶ Play'), div:has-text('▶ Play'), " +
                "button[aria-label*='play' i], button:has-text('Play'), [data-testid*='video' i]"
            ).first();

            const videoEl = container.locator('video');

            if (await play.count() > 0 || await videoEl.count() > 0) {
                console.log("[AnswerEngine] Video question component detected! Playing video...");
                if (await play.count() > 0 && await play.isVisible().catch(() => false)) {
                    await play.click({ force: true }).catch(() => {});
                }
                
                await this.page.evaluate(() => {
                    const v = document.querySelector('video');
                    if (v) {
                        v.muted = false;
                        if (typeof v.play === 'function') v.play().catch(() => {});
                    }
                }).catch(() => {});

                // Wait 6 seconds for video clip to finish playing completely
                console.log("[AnswerEngine] Waiting 6 seconds for video playback to complete...");
                await this.page.waitForTimeout(6000);
                return true;
            }
        } catch (e) {
            console.log("[AnswerEngine] Error in handleVideo:", e.message);
        }
        return false;
    }

    // ============================================
    // Custom React Option Cards (ImageCombo / Flex Cards)
    // ============================================

    async answerCustomOptionCard(elements) {
        try {
            const container = elements.activeQuestion;

            // Target option cards with cursor: pointer or inside optionContainer / optionSection / optionItem or button option cards
            const cards = container.locator('button[class*="cursor-pointer"], button:has(img):has(p), div[style*="cursor: pointer"], div[class*="optionContainer"] div[style*="cursor: pointer"], div[class*="optionSection"] p, div[class*="optionItem"]');
            const count = await cards.count();

            if (count > 0) {
                const candidates = [];
                for (let i = 0; i < count; i++) {
                    const card = cards.nth(i);
                    const text = await this.extractOptionText(card);

                    if (text && !/Next|Continue|More options|^\d+\/\d+$|clip-\d+|^\d+:\d+$/i.test(text)) {
                        candidates.push({ card, text });
                    }
                }

                if (candidates.length > 0) {
                    const { questionText, audioDetails, imageDetails } = await this.extractQuestionInfo(container);
                    const isAudioOrVisual = (audioDetails && audioDetails.length > 0) || (imageDetails && imageDetails.length > 0) || /audio|sound|hear|listen|photo|picture|matching/i.test(questionText);
                    const rank3Match = questionText.match(/(?:rank\s*(?:from)?\s*\d+\s*(?:to|-)\s*|1\s*(?:to|-)\s*|top\s+|rank\s*(?:top\s*)?|select\s*(?:up\s*to)?\s*|choose\s*(?:up\s*to)?\s*|rank\s*(?:up\s*to)?\s*)(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i);
                    const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
                    const requiredRankCount = rank3Match ? (parseInt(rank3Match[1], 10) || wordMap[rank3Match[1].toLowerCase()] || 0) : (/rank/i.test(questionText) ? 3 : 0);
                    const isMulti = !isAudioOrVisual && (requiredRankCount > 0 || /select all|choose all|multiple|all that apply/i.test(questionText));
                    const aiContext = this.getAiContext();
                    
                    const optionsText = candidates.map(c => c.text);
                    let indicesToClick = [];

                    try {
                        const LiveAIAssistant = require('./LiveAIAssistant');
                        const fs = require('fs');
                        const liveAudioFile = 'scratch/live_survey_audio.mp3';

                        // 1. If live audio was captured from the browser, listen and classify directly via Whisper
                        if (fs.existsSync(liveAudioFile) && (isAudioOrVisual || /audio|sound|hear|listen/i.test(questionText))) {
                            console.log('[AnswerEngine] 🎧 Live audio stream detected! Hearing and classifying sound via Whisper...');
                            const audioClassification = await LiveAIAssistant.listenAndClassifyAudio(liveAudioFile, questionText, optionsText);
                            if (audioClassification && audioClassification.index !== undefined && audioClassification.index >= 0 && audioClassification.index < candidates.length) {
                                indicesToClick = [audioClassification.index];
                                console.log(`[AnswerEngine] Direct acoustic hearing selected option: "${optionsText[audioClassification.index]}"`);
                            }
                            // Clean up file after hearing so subsequent slides capture fresh audio
                            try { fs.unlinkSync(liveAudioFile); } catch (e) {}
                        }

                        if (indicesToClick.length === 0) {
                            const type = isMulti ? 'multi' : 'single';
                            const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, type, optionsText, 'consumer', this.surveyLogics);
                            
                            if (isMulti && response && Array.isArray(response.indices)) {
                                indicesToClick = response.indices;
                            } else if (response && response.index !== undefined) {
                                indicesToClick = [response.index];
                            }
                        }
                    } catch (err) {
                        console.log("[AnswerEngine] AI generation failed for option cards, falling back to smart selection.");
                    }
 
                    if (indicesToClick.length === 0) {
                        const numToSelect = isMulti ? Math.min(candidates.length, requiredRankCount > 0 ? requiredRankCount : 2) : 1;
                        indicesToClick = Array.from({ length: numToSelect }, (_, i) => i);
                    }

                    if (requiredRankCount > 0 && !isAudioOrVisual) {
                        const targetClicks = Math.min(candidates.length, requiredRankCount);
                        for (let i = 0; i < candidates.length && indicesToClick.length < targetClicks; i++) {
                            if (!indicesToClick.includes(i)) {
                                indicesToClick.push(i);
                            }
                        }
                        if (indicesToClick.length > targetClicks) {
                            indicesToClick = indicesToClick.slice(0, targetClicks);
                        }
                    }
                    
                    for (const idx of indicesToClick) {
                        if (idx >= 0 && idx < candidates.length) {
                            const selected = candidates[idx];
                            console.log(`[AnswerEngine] React Option Card selected: "${selected.text.substring(0, 50)}"`);
                            await selected.card.scrollIntoViewIfNeeded().catch(() => {});
                            await selected.card.click({ force: true }).catch(async () => {
                                await selected.card.evaluate(el => el.click()).catch(()=>{});
                            });
                            await this.page.waitForTimeout(500);
                        }
                    }
                    this.lastAnswerSummary = {
                        questionText: questionText,
                        optionsPresent: optionsText,
                        optionsSelected: indicesToClick.map(i => optionsText[i] || `Option ${i+1}`),
                        handlerUsed: 'Option Cards (React)'
                    };
                    return true;
                }
            }
        } catch (e) {
            console.error("Error in answerCustomOptionCard:", e.message);
        }
        return false;
    }

    // ============================================
    // Upload
    // ============================================

    async answerFileUpload(elements) {
        try {
            const container = elements.activeQuestion;
            if (!container) return false;

            const uploadElement = container.locator('input[type="file"], [class*="upload" i], [class*="Upload" i], button:has-text("Upload"), label:has-text("Upload")');
            if (await uploadElement.count() > 0) {
                console.log("[AnswerEngine] File upload element detected in active question container.");
                const uploaded = await UploadUtil.upload(this.page, container);
                if (uploaded) {
                    console.log("[AnswerEngine] File upload completed successfully.");
                    return true;
                }
            }
        } catch (e) {
            console.error("Error in answerFileUpload:", e.message);
        }
        return false;
    }

    // ============================================
    // Rating
    // ============================================

    async answerRating(elements) {

        const buttons =
            elements.activeQuestion.getByRole("button");

        const ratings = [];

        const count = await buttons.count();

        for (let i = 0; i < count; i++) {

            const button = buttons.nth(i);

            const text =
                ((await button.textContent()) || "").trim();

            if (/^\d+$/.test(text))
                ratings.push(button);
        }

        if (!ratings.length)
            return false;

        const selectIdx = ratings.length > 1
            ? (Math.random() > 0.5 ? ratings.length - 1 : ratings.length - 2)
            : 0;

        await ratings[selectIdx].click();

        console.log(
            "Rating:",
            await ratings[selectIdx].textContent()
        );

        return true;
    }

    // ============================================
    // Yes / No
    // ============================================

    async answerYesNo(elements) {

        const buttons =
            elements.activeQuestion.getByRole("button");

        const options = [];

        const count = await buttons.count();

        for (let i = 0; i < count; i++) {

            const button = buttons.nth(i);

            const text =
                ((await button.textContent()) || "").trim();

            if (/^(yes|no)$/i.test(text))
                options.push(button);
        }

        if (!options.length)
            return false;

        const random =
            Math.floor(Math.random() * options.length);

        await options[random].click();

        return true;
    }

    // ============================================
    // Checkbox & Multi Select
    // ============================================

    async answerCheckbox(elements) {
        try {
            const container = elements.activeQuestion;
            const checkboxes = container.locator('input[type="checkbox"], [role="checkbox"], label:has(input[type="checkbox"])');
            const count = await checkboxes.count();
            if (count > 0) {
                const { questionText } = await this.extractQuestionInfo(container);
                const aiContext = this.getAiContext();
                const candidates = [];
                for (let i = 0; i < count; i++) {
                    const cb = checkboxes.nth(i);
                    const text = await this.extractOptionText(cb);
                    candidates.push({ element: cb, text: text || `Option ${i + 1}` });
                }
                const optionsText = candidates.map(c => c.text);
                let indicesToClick = [0];

                try {
                    const LiveAIAssistant = require('./LiveAIAssistant');
                    const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'multi', optionsText, 'consumer', this.surveyLogics);
                    if (response && Array.isArray(response.indices) && response.indices.length > 0) {
                        indicesToClick = response.indices;
                    }
                } catch (e) {}

                for (const idx of indicesToClick) {
                    if (idx >= 0 && idx < candidates.length) {
                        const target = candidates[idx].element;
                        await target.scrollIntoViewIfNeeded().catch(() => {});
                        await target.click({ force: true }).catch(async () => {
                            await target.evaluate(el => el.click());
                        });
                        console.log(`[AnswerEngine] Checked checkbox option ${idx + 1} of ${count}: "${optionsText[idx]}"`);
                        await this.page.waitForTimeout(300);
                    }
                }
                this.lastAnswerSummary = {
                    questionText: questionText,
                    optionsPresent: optionsText,
                    optionsSelected: indicesToClick.map(i => optionsText[i]),
                    handlerUsed: 'Checkboxes'
                };
                return true;
            }
        } catch (e) {}
        return false;
    }

    async answerMultiSelect(elements) {
        return await this.answerCheckbox(elements);
    }

    // ============================================
    // Single Choice & Radio
    // ============================================

    async answerSingleChoice(elements) {
        try {
            const container = elements.activeQuestion;
            const { questionText } = await this.extractQuestionInfo(container);
            const aiContext = this.getAiContext();
            const LiveAIAssistant = require('./LiveAIAssistant');

            // 1. Radio inputs
            const radios = container.locator('input[type="radio"], [role="radio"], label:has(input[type="radio"])');
            const radioCount = await radios.count();
            if (radioCount > 0) {
                const candidates = [];
                for (let i = 0; i < radioCount; i++) {
                    const r = radios.nth(i);
                    const text = await this.extractOptionText(r);
                    candidates.push({ element: r, text: text || `Option ${i + 1}` });
                }
                const optionsText = candidates.map(c => c.text);
                let selectedIdx = 0;
                try {
                    const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'single', optionsText, 'consumer', this.surveyLogics);
                    if (response && response.index !== undefined && response.index >= 0 && response.index < radioCount) {
                        selectedIdx = response.index;
                    }
                } catch (e) {}

                const target = candidates[selectedIdx].element;
                await target.scrollIntoViewIfNeeded().catch(() => {});
                await target.click({ force: true }).catch(async () => {
                    await target.evaluate(el => el.click());
                });
                console.log(`[AnswerEngine] Selected radio option ${selectedIdx + 1} of ${radioCount}: "${optionsText[selectedIdx]}"`);
                this.lastAnswerSummary = {
                    questionText: questionText,
                    optionsPresent: optionsText,
                    optionsSelected: [optionsText[selectedIdx]],
                    handlerUsed: 'Radio Buttons'
                };
                return true;
            }

            // 2. Buttons representing options (excluding Next/Continue/More/Submit/Save/Play/Audio buttons)
            const optionButtons = container.locator('button').filter({
                hasNotText: /Next|Continue|More|Submit|Save|Play|Options|Audio|Control/i
            });
            const btnCount = await optionButtons.count();
            if (btnCount > 0) {
                let allDigits = true;
                const buttonTexts = [];
                for (let j = 0; j < btnCount; j++) {
                    const txt = await this.extractOptionText(optionButtons.nth(j));
                    buttonTexts.push(txt);
                    if (!/^\d+$/.test(txt)) {
                        allDigits = false;
                    }
                }

                // If it is genuinely a 5-point rating grid matrix (e.g. 10, 15, 20 numbered buttons)
                if (btnCount % 5 === 0 && btnCount >= 10 && allDigits) {
                    console.log(`[AnswerEngine] Grid rating detected with ${btnCount} buttons. Clicking positive options...`);
                    const rows = btnCount / 5;
                    for (let r = 0; r < rows; r++) {
                        const col = Math.random() > 0.5 ? 4 : 3; // 4 or 5 star
                        const selectIdx = r * 5 + col;
                        const target = optionButtons.nth(selectIdx);
                        await target.scrollIntoViewIfNeeded().catch(() => {});
                        await target.click({ force: true }).catch(async () => {
                            await target.evaluate(el => el.click());
                        });
                        console.log(`Selected positive rating button ${selectIdx + 1} of ${btnCount}`);
                    }
                    this.lastAnswerSummary = {
                        questionText: questionText,
                        optionsPresent: buttonTexts,
                        optionsSelected: [`Grid rating (${rows} rows)`],
                        handlerUsed: 'Grid Rating Buttons'
                    };
                    return true;
                }
                
                let selectIdx = 0;
                if (allDigits && btnCount > 1) {
                    selectIdx = btnCount > 1 ? (Math.random() > 0.5 ? btnCount - 1 : btnCount - 2) : 0;
                } else {
                    try {
                        const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'single', buttonTexts, 'consumer', this.surveyLogics);
                        if (response && response.index !== undefined && response.index >= 0 && response.index < btnCount) {
                            selectIdx = response.index;
                        }
                    } catch (e) {}
                }

                const target = optionButtons.nth(selectIdx);
                await target.scrollIntoViewIfNeeded().catch(() => {});
                await target.click({ force: true }).catch(async () => {
                    await target.evaluate(el => el.click());
                });
                console.log(`[AnswerEngine] Selected option button ${selectIdx + 1} of ${btnCount}: "${buttonTexts[selectIdx]}"`);
                this.lastAnswerSummary = {
                    questionText: questionText,
                    optionsPresent: buttonTexts,
                    optionsSelected: [buttonTexts[selectIdx]],
                    handlerUsed: 'Option Buttons'
                };
                return true;
            }

            // 3. Option labels or option item elements
            const optionItems = container.locator('label, div[class*="option"], div[class*="choice"], div[class*="answer"], div[class*="item"], div[class*="card"], [data-option]');
            const count = await optionItems.count();
            if (count > 0) {
                const candidates = [];
                for (let i = 0; i < count; i++) {
                    const item = optionItems.nth(i);
                    const text = await this.extractOptionText(item);
                    if (text && !/Next|Continue|More options|^\d+\/\d+$/i.test(text)) {
                        candidates.push({ item, text });
                    }
                }
                if (candidates.length > 0) {
                    const optionsText = candidates.map(c => c.text);
                    let selectIdx = 0;
                    try {
                        const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'single', optionsText, 'consumer', this.surveyLogics);
                        if (response && response.index !== undefined && response.index >= 0 && response.index < candidates.length) {
                            selectIdx = response.index;
                        }
                    } catch (e) {}

                    const target = candidates[selectIdx].item;
                    await target.scrollIntoViewIfNeeded().catch(() => {});
                    await target.click({ force: true }).catch(async () => {
                        await target.evaluate(el => el.click());
                    });
                    console.log(`[AnswerEngine] Selected option item ${selectIdx + 1} ("${optionsText[selectIdx].substring(0, 40)}")`);
                    return true;
                }
            }
        } catch (e) {
            console.error("Error in answerSingleChoice:", e.message);
        }
        return false;
    }

    async answerRadio(elements) {
        return await this.answerSingleChoice(elements);
    }

    // ============================================
    // Dropdown
    // ============================================
    async answerDropdown(elements) {
        const question = elements.activeQuestion;
        
        // Find dropdowns within the question to avoid scoping issues with previous slides
        let dropdown = question.locator("button[data-testid^='ranking-option-']:not([data-testid*='-rank-'])");
        let numDropdowns = await dropdown.count();

        if (numDropdowns === 0) {
            dropdown = question.locator("img[alt='Dropdown']");
            numDropdowns = await dropdown.count();
        }

        if (numDropdowns === 0) {
            return false;
        }

        console.log(`Dropdown question detected with ${numDropdowns} dropdowns.`);

        for (let d = 0; d < numDropdowns; d++) {
            // Open dropdown
            await dropdown.nth(d).click({ force: true });

            await this.page.waitForTimeout(1500);

            const modal = this.page.locator("//div[@role='dialog']").first();
            const buttons = modal.getByRole("button").filter({ hasNotText: 'Save' });
            const options = [];

            const count = await buttons.count();

            for (let i = 0; i < count; i++) {
                const button = buttons.nth(i);

                if (!(await button.isVisible().catch(() => false))) {
                    continue;
                }

                const text = ((await button.textContent()) || "").trim();

                if (!text) {
                    continue;
                }

                // Ignore action buttons
                if (/^(next|save|close|cancel|back|continue|submit)$/i.test(text)) {
                    continue;
                }

                options.push(button);
            }

            if (options.length === 0) {
                console.log(`No dropdown options found for dropdown ${d + 1}.`);
                continue;
            }

            // Random option
            const randomIndex = Math.floor(Math.random() * options.length);
            const selectedText = ((await options[randomIndex].textContent()) || "").trim();

            await options[randomIndex].click();
            console.log(`Selected dropdown option for dropdown ${d + 1}:`, selectedText);

            await this.page.waitForTimeout(500);

            // Click Save if it appears
            const save = this.page
                .locator("p")
                .filter({ hasText: /^Save$/ })
                .first();

            if (
                await save.count() > 0 &&
                await save.isVisible().catch(() => false)
            ) {
                await save.click();
                console.log(`Dropdown ${d + 1} saved.`);
                await this.page.waitForTimeout(500);
            }
        }
        this.lastAnswerSummary = {
            questionText: "Matrix Dropdown Rating Grid",
            optionsPresent: [`Matrix Grid (${numDropdowns} dropdown rows)`],
            optionsSelected: [`Filled & Saved ${numDropdowns} dropdown rows`],
            handlerUsed: 'Matrix Dropdowns'
        };
        return true;
    }

    // ============================================
    // Textbox
    // ============================================

    async answerTextbox(elements) {
        try {
            const container = elements.activeQuestion;
            const textbox = container.locator('textarea, input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="file"]), [role="textbox"]').first();
            if (!(await textbox.count()) || !(await textbox.isVisible().catch(() => false))) return false;

            const { questionText, imageDetails } = await this.extractQuestionInfo(container);
            const aiContext = this.getAiContext();
            const isNumericQuestion = /spend|cost|price|amount|INR|rupees|money|number|how many|how much|\bage\b|\byear\b/i.test(questionText);
            
            let defaultText = "Digital nomad accommodations should offer fast Wi-Fi, dedicated workspace, and flexible check-in.";
            if (imageDetails && imageDetails.length > 0 && imageDetails[0].name) {
                defaultText = `The image shows a ${imageDetails[0].name}.`;
            }
            let answerText = isNumericQuestion ? "500" : defaultText;
            
            try {
                const LiveAIAssistant = require('./LiveAIAssistant');
                const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'text', [], 'consumer', this.surveyLogics);
                if (response && response.answer) {
                    answerText = response.answer;
                }
            } catch (err) {
                console.log("[AnswerEngine] AI generation failed for textbox, falling back to contextual text.");
            }

            if (isNumericQuestion) {
                // Extract only the first contiguous sequence of digits (e.g. "800" from "800 or 500")
                const match = String(answerText).match(/\d+/);
                answerText = match ? match[0] : "500";
            }

            await textbox.scrollIntoViewIfNeeded().catch(() => {});
            await textbox.click({ force: true }).catch(() => {});
            await textbox.fill(answerText);
            await this.page.waitForTimeout(300);
            
            // Dispatch input and change events to ensure React / MUI state commits
            await textbox.dispatchEvent('input').catch(() => {});
            await textbox.dispatchEvent('change').catch(() => {});
            await textbox.press('Tab').catch(() => {});

            console.log(`[AnswerEngine] Filled textbox with AI answer: "${answerText.substring(0, 60)}..."`);
            this.lastAnswerSummary = {
                questionText: questionText,
                optionsPresent: ['[Open Text Input]'],
                optionsSelected: [answerText],
                handlerUsed: 'Open Textbox'
            };
            return true;
        } catch (e) {
            console.log("[AnswerEngine] Error in answerTextbox:", e.message);
        }
        return false;
    }

    // ============================================
    // Ranking
    // ============================================

    async answerRanking(elements) {
        try {
            const container = elements.activeQuestion;
            const { questionText } = await this.extractQuestionInfo(container);
            const isRanking = /rank|order|arrange|reorder/i.test(questionText);
            
            if (!isRanking) return false;

            console.log("[AnswerEngine] Ranking question detected! Matching options...");
            
            // Fetch potential ranking option cards using same classes as custom options & general choices
            const cards = container.locator('div[style*="cursor: pointer"], div[class*="optionContainer"] div[style*="cursor: pointer"], div[class*="optionSection"] p, [data-ranking], .rank-option, [aria-label*="rank" i]');
            const count = await cards.count();
            
            if (count > 0) {
                const candidates = [];
                for (let i = 0; i < count; i++) {
                    const card = cards.nth(i);
                    const text = await this.extractOptionText(card);
                    if (text && !/Next|Continue|More options|^\d+\/\d+$/i.test(text)) {
                        candidates.push({ card, text });
                    }
                }

                if (candidates.length === 0) return false;

                let numToRank = candidates.length;
                const rankMatch = questionText.match(/(?:rank\s*(?:from)?\s*\d+\s*(?:to|-)\s*|1\s*(?:to|-)\s*|top\s+|rank\s*(?:top\s*)?|select\s*(?:up\s*to)?\s*|choose\s*(?:up\s*to)?\s*|rank\s*(?:up\s*to)?\s*)(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i);
                const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
                if (rankMatch) {
                    const numWord = rankMatch[1].toLowerCase();
                    numToRank = parseInt(numWord, 10) || wordMap[numWord] || candidates.length;
                } else if (/rank\s+from\s+most\s+to\s+least|rank\s+all|order\s+all/i.test(questionText)) {
                    numToRank = candidates.length;
                } else {
                    numToRank = Math.min(candidates.length, 3);
                }
                numToRank = Math.max(1, Math.min(candidates.length, numToRank));

                // Ask AI for ranking order
                let selectedIndices = [];
                try {
                    const LiveAIAssistant = require('./LiveAIAssistant');
                    const aiContext = this.getAiContext();
                    const optionsText = candidates.map(c => c.text);
                    const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'multi', optionsText, 'consumer', this.surveyLogics);
                    if (response && Array.isArray(response.indices) && response.indices.length > 0) {
                        selectedIndices = response.indices;
                    }
                } catch (e) {}

                // Ensure exactly numToRank unique indices are selected
                for (let i = 0; i < candidates.length && selectedIndices.length < numToRank; i++) {
                    if (!selectedIndices.includes(i)) {
                        selectedIndices.push(i);
                    }
                }
                if (selectedIndices.length > numToRank) {
                    selectedIndices = selectedIndices.slice(0, numToRank);
                }

                if (selectedIndices.length === 0) {
                    selectedIndices = Array.from({ length: numToRank }, (_, i) => i);
                }

                console.log(`[AnswerEngine] Ranking ${selectedIndices.length} options: ${selectedIndices.join(', ')}...`);

                for (const idx of selectedIndices) {
                    if (idx >= 0 && idx < candidates.length) {
                        const candidate = candidates[idx];
                        console.log(`[AnswerEngine] Ranking option ${idx + 1}: Clicking "${candidate.text.substring(0, 40)}"`);
                        await candidate.card.scrollIntoViewIfNeeded().catch(() => {});
                        await candidate.card.click({ force: true, timeout: 5000 }).catch(async () => {
                            await candidate.card.evaluate(el => el.click()).catch(() => {});
                        });
                        await this.page.waitForTimeout(500);
                    }
                }
                return true;
            }
        } catch (e) {
            console.error("Error in answerRanking:", e.message);
        }
        return false;
    }

    // ============================================
    // Universal Fallback for any Option Element
    // ============================================

    async answerGenericOption(elements) {
        try {
            const container = elements.activeQuestion;
            const candidates = container.locator('button, label, input, select, textarea, div[class*="option"], div[class*="choice"], div[class*="answer"], div[class*="item"], div[class*="card"], span[class*="option"]');
            const count = await candidates.count();
            console.log(`[AnswerEngine] Universal fallback inspecting ${count} element candidate(s)...`);

            for (let i = 0; i < count; i++) {
                const item = candidates.nth(i);
                const text = ((await item.innerText().catch(() => "")) || "").trim();

                // Skip Next, Continue, Back, or parent containers containing Next
                if (/Next|Continue|Back|Previous|More options|▶ Play/i.test(text)) {
                    continue;
                }

                if (await item.isVisible().catch(() => false)) {
                    console.log(`[AnswerEngine] Universal fallback clicking element ${i + 1} ("${text.substring(0, 30)}")`);
                    await item.scrollIntoViewIfNeeded().catch(() => {});
                    await item.click({ force: true }).catch(async () => {
                        await item.evaluate(el => el.click());
                    });
                    return true;
                }
            }
        } catch (e) {
            console.error("Error in answerGenericOption:", e.message);
        }
        return false;
    }

    // ============================================
    // Next Button
    // ============================================

    async clickNext(elements) {
        try {
            const NextButtonHandler = require('./NextButtonHandler');
            const nextHandler = new NextButtonHandler(this.page);
            return await nextHandler.clickNext(elements);
        } catch (e) {
            console.log('[AnswerEngine] Error in clickNext:', e.message);
        }
        return false;
    }
}

module.exports = AnswerEngine;