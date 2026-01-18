// State
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let keyboardHookProcess = null;
let isRightCtrlDown = false;
let isProcessing = false;

const VIEW = new URLSearchParams(location.search).get('view') || 'settings';
try {
    document.body.classList.add(`view-${VIEW}`);
} catch (_) {
}

const DEFAULT_PROMPT_PROFILES = [
    {
        id: 'default-transcribe',
        name: '转写润色',
        prompt: '你是一个专业的语音助手。请将音频内容转写为流畅的中文文本，自动修正错别字，并去除口语化的表达。只输出最终文本，不要解释。'
    },
    {
        id: 'translate-en',
        name: '翻译（中→英）',
        prompt: '请将音频内容先准确转写为中文，再翻译成英文，语气专业自然。只输出英文译文，不要解释。'
    }
];

const indicatorIcon = document.getElementById('indicator-icon');

const modelSelect = document.getElementById('model-select');
const geminiKeyInput = document.getElementById('gemini-key');
const geminiKeyToggleBtn = document.getElementById('gemini-key-toggle');
const geminiKeyCopyBtn = document.getElementById('gemini-key-copy');
const geminiModelSelect = document.getElementById('gemini-model');
const qwenKeyInput = document.getElementById('qwen-key');
const qwenKeyToggleBtn = document.getElementById('qwen-key-toggle');
const qwenKeyCopyBtn = document.getElementById('qwen-key-copy');
const qwenModelVersion = document.getElementById('qwen-model-version');
const qwenEnablePostProcessInput = document.getElementById('qwen-enable-postprocess');
const qwenTextModelInput = document.getElementById('qwen-text-model');
const systemPromptInput = document.getElementById('system-prompt');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const geminiConfig = document.getElementById('gemini-config');
const qwenConfig = document.getElementById('qwen-config');
const promptProfileSelect = document.getElementById('prompt-profile-select');
const promptNewBtn = document.getElementById('prompt-new-btn');
const promptDeleteBtn = document.getElementById('prompt-delete-btn');
const promptNewNameInput = document.getElementById('prompt-new-name');

const sceneHotkeyEnabledInput = document.getElementById('scene-hotkey-enabled');
const sceneHotkeySelects = Array.from({ length: 10 }, (_, i) => document.getElementById(`scene-hotkey-${i + 1}`));

function setSpeechState(state) {
    try {
        localStorage.setItem('speech_input_state', JSON.stringify({ state, ts: Date.now() }));
    } catch (_) {
    }
}

function applyIndicatorState(state) {
    if (!indicatorIcon) return;
    indicatorIcon.classList.remove('state-recording');
    indicatorIcon.classList.remove('state-processing');
    indicatorIcon.classList.remove('state-ready');

    if (state === 'recording') {
        indicatorIcon.classList.add('state-recording');
        indicatorIcon.textContent = '🎙️';
    } else if (state === 'processing') {
        indicatorIcon.classList.add('state-processing');
        indicatorIcon.textContent = '⏳';
    } else {
        indicatorIcon.classList.add('state-ready');
        indicatorIcon.textContent = '🎙️';
    }
}

function initIndicatorView() {
    const current = (() => {
        try {
            const raw = localStorage.getItem('speech_input_state');
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && parsed.state ? parsed.state : 'ready';
        } catch (_) {
            return 'ready';
        }
    })();

    applyIndicatorState(current);

    window.addEventListener('storage', (e) => {
        if (!e || e.key !== 'speech_input_state') return;
        try {
            const parsed = e.newValue ? JSON.parse(e.newValue) : null;
            applyIndicatorState(parsed && parsed.state ? parsed.state : 'ready');
        } catch (_) {
            applyIndicatorState('ready');
        }
    });
}

function initSettingsView() {
    if (!window.electronAPI) {
        // 兼容打包后 preload 未生效/加载失败的情况：在渲染进程内手动执行 preload 来补齐桥接对象。
        try {
            require('./preload.js');
        } catch (e) {
            const msg = (e && e.message) ? e.message : String(e);
            alert(`初始化失败：插件桥接未加载。preload.js 执行失败：${msg}`);
            return;
        }
        if (!window.electronAPI) {
            alert('初始化失败：插件桥接未加载，请重启应用后重试');
            return;
        }
    }
    loadSettings();
    setupEventListeners();
    setSpeechState('ready');
    try {
        if (window.electronAPI.window && typeof window.electronAPI.window.createIndicatorWindow === 'function') {
            window.electronAPI.window.createIndicatorWindow();
        }
    } catch (_) {
    }
    startRightCtrlHook();
}

function loadSettings() {
    const settings = window.electronAPI.storage.get('settings') || {};
    
    // Defaults
    modelSelect.value = settings.model || 'gemini';
    geminiKeyInput.value = settings.geminiKey || '';
    geminiModelSelect.value = settings.geminiModel || 'gemini-3-flash-preview';
    qwenKeyInput.value = settings.qwenKey || '';
    const allowedQwenModels = ['qwen3-asr-flash', 'paraformer-v2'];
    const normalizedQwenModel = allowedQwenModels.includes(settings.qwenModel) ? settings.qwenModel : 'qwen3-asr-flash';
    qwenModelVersion.value = normalizedQwenModel;
    qwenTextModelInput.value = settings.qwenTextModel || 'qwen-plus';
    if (qwenEnablePostProcessInput) {
        qwenEnablePostProcessInput.checked = !!settings.qwenEnablePostProcess;
    }
    if (qwenTextModelInput) {
        qwenTextModelInput.disabled = !(settings.qwenEnablePostProcess);
    }

    const profiles = Array.isArray(settings.promptProfiles) && settings.promptProfiles.length > 0
        ? settings.promptProfiles
        : DEFAULT_PROMPT_PROFILES;
    const activeProfileId = settings.activePromptProfileId || profiles[0].id;

    const sceneHotkeys = normalizeSceneHotkeys(settings.sceneHotkeys, profiles);

    window.electronAPI.storage.set('settings', {
        ...settings,
        qwenModel: normalizedQwenModel,
        promptProfiles: profiles,
        activePromptProfileId: activeProfileId,
        sceneHotkeys
    });

    renderPromptProfiles(profiles, activeProfileId);
    renderSceneHotkeys(profiles, sceneHotkeys);
    const active = profiles.find(p => p.id === activeProfileId) || profiles[0];
    if (active) {
        systemPromptInput.value = active.prompt || '';
    }

    updateModelVisibility();
}

function normalizeSceneHotkeys(raw, profiles) {
    const enabled = !!(raw && raw.enabled);
    const mappingRaw = raw && typeof raw.mapping === 'object' && raw.mapping ? raw.mapping : {};
    const validIds = new Set((profiles || []).map(p => p && p.id).filter(Boolean));
    const mapping = {};
    for (let slot = 1; slot <= 10; slot++) {
        const key = String(slot);
        const id = mappingRaw[key] || mappingRaw[slot];
        if (id && validIds.has(id)) {
            mapping[slot] = id;
        }
    }
    return { enabled, mapping };
}

function renderSceneHotkeys(profiles, sceneHotkeys) {
    if (!sceneHotkeyEnabledInput || !sceneHotkeySelects || sceneHotkeySelects.length !== 10) return;
    const cfg = normalizeSceneHotkeys(sceneHotkeys, profiles);
    sceneHotkeyEnabledInput.checked = !!cfg.enabled;
    for (let slot = 1; slot <= 10; slot++) {
        const el = sceneHotkeySelects[slot - 1];
        if (!el) continue;
        el.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '（未设置：按序号）';
        el.appendChild(noneOpt);
        for (const p of profiles) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            el.appendChild(opt);
        }
        el.value = cfg.mapping[slot] || '';
        el.disabled = !cfg.enabled;
    }
}

function persistSceneHotkeys(update) {
    const settings = window.electronAPI.storage.get('settings') || {};
    const profiles = Array.isArray(settings.promptProfiles) && settings.promptProfiles.length > 0
        ? settings.promptProfiles
        : DEFAULT_PROMPT_PROFILES;
    const current = normalizeSceneHotkeys(settings.sceneHotkeys, profiles);
    const next = {
        enabled: typeof update.enabled === 'boolean' ? update.enabled : current.enabled,
        mapping: { ...current.mapping, ...(update.mapping || {}) }
    };
    window.electronAPI.storage.set('settings', {
        ...settings,
        sceneHotkeys: normalizeSceneHotkeys(next, profiles)
    });
}

function setActivePromptProfile(nextId) {
    const settings = window.electronAPI.storage.get('settings') || {};
    const profiles = Array.isArray(settings.promptProfiles) && settings.promptProfiles.length > 0
        ? settings.promptProfiles
        : DEFAULT_PROMPT_PROFILES;
    const profile = profiles.find(p => p.id === nextId);
    if (!profile) return;
    if (promptProfileSelect) {
        promptProfileSelect.value = profile.id;
    }
    if (systemPromptInput) {
        systemPromptInput.value = profile.prompt || '';
    }
    window.electronAPI.storage.set('settings', {
        ...settings,
        promptProfiles: profiles,
        activePromptProfileId: profile.id
    });
}

function switchPromptProfileBySlot(slot) {
    if (!Number.isFinite(slot) || slot < 1 || slot > 10) return;
    const settings = window.electronAPI.storage.get('settings') || {};
    const profiles = Array.isArray(settings.promptProfiles) && settings.promptProfiles.length > 0
        ? settings.promptProfiles
        : DEFAULT_PROMPT_PROFILES;
    const cfg = normalizeSceneHotkeys(settings.sceneHotkeys, profiles);
    if (!cfg.enabled) return;

    const mappedId = cfg.mapping[slot];
    const target = (mappedId && profiles.find(p => p.id === mappedId)) || profiles[slot - 1];
    if (!target) return;
    setActivePromptProfile(target.id);
}

function updateModelVisibility() {
    if (modelSelect.value === 'gemini') {
        geminiConfig.style.display = 'block';
        qwenConfig.style.display = 'none';
    } else {
        geminiConfig.style.display = 'none';
        qwenConfig.style.display = 'block';
    }
}

function setupEventListeners() {
    // Settings
    modelSelect.addEventListener('change', updateModelVisibility);

    setupSecretField(geminiKeyInput, geminiKeyToggleBtn, geminiKeyCopyBtn);
    setupSecretField(qwenKeyInput, qwenKeyToggleBtn, qwenKeyCopyBtn);

    if (qwenEnablePostProcessInput && qwenTextModelInput) {
        qwenEnablePostProcessInput.addEventListener('change', () => {
            qwenTextModelInput.disabled = !qwenEnablePostProcessInput.checked;
        });
    }

    if (sceneHotkeyEnabledInput) {
        sceneHotkeyEnabledInput.addEventListener('change', () => {
            persistSceneHotkeys({ enabled: !!sceneHotkeyEnabledInput.checked });
            const settings = window.electronAPI.storage.get('settings') || {};
            const profiles = Array.isArray(settings.promptProfiles) && settings.promptProfiles.length > 0
                ? settings.promptProfiles
                : DEFAULT_PROMPT_PROFILES;
            renderSceneHotkeys(profiles, settings.sceneHotkeys);
        });
    }

    for (let slot = 1; slot <= 10; slot++) {
        const el = sceneHotkeySelects[slot - 1];
        if (!el) continue;
        el.addEventListener('change', () => {
            const v = el.value || '';
            persistSceneHotkeys({ mapping: { [slot]: v || undefined } });
        });
    }

    promptProfileSelect.addEventListener('change', () => {
        const settings = window.electronAPI.storage.get('settings') || {};
        const profiles = Array.isArray(settings.promptProfiles) ? settings.promptProfiles : DEFAULT_PROMPT_PROFILES;
        const selectedId = promptProfileSelect.value;
        const profile = profiles.find(p => p.id === selectedId);
        if (profile) {
            systemPromptInput.value = profile.prompt || '';
            window.electronAPI.storage.set('settings', {
                ...settings,
                activePromptProfileId: selectedId
            });
        }
    });

    promptNewBtn.addEventListener('click', () => {
        const name = (promptNewNameInput.value || '').trim();
        if (!name) {
            alert('请输入场景名称');
            return;
        }
        const settings = window.electronAPI.storage.get('settings') || {};
        const profiles = Array.isArray(settings.promptProfiles) ? settings.promptProfiles : DEFAULT_PROMPT_PROFILES;
        const id = `custom-${Date.now()}`;
        const nextProfiles = [...profiles, { id, name, prompt: systemPromptInput.value || '' }];
        const nextSettings = { ...settings, promptProfiles: nextProfiles, activePromptProfileId: id };
        window.electronAPI.storage.set('settings', nextSettings);
        promptNewNameInput.value = '';
        renderPromptProfiles(nextProfiles, id);
        renderSceneHotkeys(nextProfiles, nextSettings.sceneHotkeys);
    });

    promptDeleteBtn.addEventListener('click', () => {
        const settings = window.electronAPI.storage.get('settings') || {};
        const profiles = Array.isArray(settings.promptProfiles) ? settings.promptProfiles : DEFAULT_PROMPT_PROFILES;
        if (profiles.length <= 1) {
            alert('至少保留一个场景');
            return;
        }
        const selectedId = promptProfileSelect.value;
        const nextProfiles = profiles.filter(p => p.id !== selectedId);
        const nextActiveId = nextProfiles[0].id;
        const nextSettings = { ...settings, promptProfiles: nextProfiles, activePromptProfileId: nextActiveId };
        window.electronAPI.storage.set('settings', nextSettings);
        renderPromptProfiles(nextProfiles, nextActiveId);
        renderSceneHotkeys(nextProfiles, nextSettings.sceneHotkeys);
        const active = nextProfiles[0];
        systemPromptInput.value = active.prompt || '';
    });
    
    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            model: modelSelect.value,
            geminiKey: geminiKeyInput.value,
            geminiModel: geminiModelSelect.value,
            qwenKey: qwenKeyInput.value,
            qwenModel: qwenModelVersion.value,
            qwenTextModel: qwenTextModelInput.value,
            qwenEnablePostProcess: qwenEnablePostProcessInput ? !!qwenEnablePostProcessInput.checked : false
        };

        const prev = window.electronAPI.storage.get('settings') || {};
        const profiles = Array.isArray(prev.promptProfiles) && prev.promptProfiles.length > 0 ? prev.promptProfiles : DEFAULT_PROMPT_PROFILES;
        const activeId = prev.activePromptProfileId || profiles[0].id;
        const nextProfiles = profiles.map(p => p.id === activeId ? { ...p, prompt: systemPromptInput.value || '' } : p);

        window.electronAPI.storage.set('settings', {
            ...prev,
            ...settings,
            promptProfiles: nextProfiles,
            activePromptProfileId: activeId
        });
        
        alert('设置已保存');
    });

    document.getElementById('hide-btn').addEventListener('click', () => {
        window.electronAPI.window.hide();
    });
}

function setupSecretField(input, toggleBtn, copyBtn) {
    if (toggleBtn && input) {
        toggleBtn.addEventListener('click', () => {
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    }

    if (copyBtn && input) {
        copyBtn.addEventListener('click', () => {
            const text = (input.value || '').toString();
            if (!text) return;
            try {
                window.electronAPI.action.copy(text);
                const prev = copyBtn.textContent;
                copyBtn.textContent = '✓';
                setTimeout(() => {
                    copyBtn.textContent = prev;
                }, 800);
            } catch (_) {
            }
        });
    }
}

window.addEventListener('beforeunload', () => {
    try {
        if (keyboardHookProcess) {
            keyboardHookProcess.kill();
            keyboardHookProcess = null;
        }
    } catch (_) {
    }
});

async function insertToExternalApp(text) {
    if (!text) return;
    try {
        const res = await window.electronAPI.action.insert(text);
        void res;
    } catch (e) {
        console.warn('插入失败:', e);
    }
}

function renderPromptProfiles(profiles, activeId) {
    promptProfileSelect.innerHTML = '';
    for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === activeId) opt.selected = true;
        promptProfileSelect.appendChild(opt);
    }
}

function getActivePrompt() {
    const settings = window.electronAPI.storage.get('settings') || {};
    const profiles = Array.isArray(settings.promptProfiles) && settings.promptProfiles.length > 0
        ? settings.promptProfiles
        : DEFAULT_PROMPT_PROFILES;
    const activeId = settings.activePromptProfileId || profiles[0].id;
    return profiles.find(p => p.id === activeId) || profiles[0];
}

function startRightCtrlHook() {
    if (keyboardHookProcess) return;

    try {
        const { spawn } = require('child_process');

        const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Windows.Forms;

public class KeyboardHook {
    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int VK_RCONTROL = 0xA3;
    private const int VK_MENU = 0x12;
    private const int VK_0 = 0x30;
    private const int VK_9 = 0x39;

    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static bool _altDown = false;
    private static int _lastAltVk = -1;
    private static int _lastAltTick = 0;

    public static void Start() {
        _hookID = SetHook(_proc);
        Application.Run();
    }

    public static void Stop() {
        if (_hookID != IntPtr.Zero) {
            UnhookWindowsHookEx(_hookID);
            _hookID = IntPtr.Zero;
        }
        try { Application.ExitThread(); } catch {}
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int msg = wParam.ToInt32();
            if (msg == WM_KEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYDOWN || msg == WM_SYSKEYUP) {
                KBDLLHOOKSTRUCT kb = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                if (kb.vkCode == VK_MENU) {
                    if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) {
                        _altDown = true;
                    } else {
                        _altDown = false;
                    }
                } else if (_altDown && kb.vkCode >= VK_0 && kb.vkCode <= VK_9) {
                    if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) {
                        int now = Environment.TickCount;
                        if (kb.vkCode != _lastAltVk || (now - _lastAltTick) > 250) {
                            _lastAltVk = kb.vkCode;
                            _lastAltTick = now;
                            int digit = kb.vkCode - VK_0;
                            Console.WriteLine("ALT_" + digit);
                            Console.Out.Flush();
                        }
                    }
                }
                if (kb.vkCode == VK_RCONTROL) {
                    if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) {
                        Console.WriteLine("RCTRL_DOWN");
                        Console.Out.Flush();
                    } else {
                        Console.WriteLine("RCTRL_UP");
                        Console.Out.Flush();
                    }
                }
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public int vkCode;
        public int scanCode;
        public int flags;
        public int time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
}
"@ -ReferencedAssemblies System.Windows.Forms

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[KeyboardHook]::Start()
`;

        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

        keyboardHookProcess = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Sta', '-EncodedCommand', encoded], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        keyboardHookProcess.stdout.setEncoding('utf8');

        let buf = '';
        keyboardHookProcess.stdout.on('data', (chunk) => {
            buf += chunk;
            const lines = buf.split(/\r?\n/);
            buf = lines.pop() || '';
            for (const line of lines) {
                const s = (line || '').trim();
                if (!s) continue;
                if (s === 'RCTRL_DOWN') {
                    onRightCtrlDown();
                } else if (s === 'RCTRL_UP') {
                    onRightCtrlUp();
                } else if (s.startsWith('ALT_')) {
                    const raw = s.slice(4);
                    const digit = Number(raw);
                    if (Number.isFinite(digit)) {
                        const slot = digit === 0 ? 10 : digit;
                        switchPromptProfileBySlot(slot);
                    }
                }
            }
        });

        keyboardHookProcess.stderr.setEncoding('utf8');
        keyboardHookProcess.stderr.on('data', (chunk) => {
            console.warn('keyboard hook stderr:', chunk);
        });

        keyboardHookProcess.on('exit', () => {
            keyboardHookProcess = null;
        });
    } catch (e) {
        console.error('startRightCtrlHook failed:', e);
        try { alert('全局按键监听启动失败（可能被系统限制）'); } catch (_) {}
    }
}

function onRightCtrlDown() {
    if (isRightCtrlDown) return;
    isRightCtrlDown = true;
    if (isProcessing) return;
    if (!isRecording) {
        startRecording();
    }
}

function onRightCtrlUp() {
    if (!isRightCtrlDown) return;
    isRightCtrlDown = false;
    if (isRecording) {
        stopRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Gemini supports webm
            processAudio(audioBlob);
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        setSpeechState('recording');
        
        // Optional: Bring window to front? No, user might be typing elsewhere.
        // We can play a sound to indicate start?
        
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('无法访问麦克风: ' + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        setSpeechState('processing');
    }
}

async function processAudio(blob) {
    const settings = window.electronAPI.storage.get('settings') || {};
    const model = settings.model || 'gemini';
    const activePrompt = getActivePrompt();
    const prompt = (activePrompt && activePrompt.prompt) ? activePrompt.prompt : 'Convert speech to text.';

    try {
        isProcessing = true;
        let text = '';
        if (model === 'gemini') {
            text = await callGemini(blob, settings.geminiKey, settings.geminiModel || 'gemini-3-flash-preview', prompt);
        } else {
            const transcript = await callQwenTranscribe(blob, settings.qwenKey, settings.qwenModel, prompt);
            if (settings.qwenEnablePostProcess) {
                text = await callQwenPostProcess(transcript, settings.qwenKey, settings.qwenTextModel || 'qwen-plus', prompt);
            } else {
                text = transcript;
            }
        }

        setSpeechState('ready');
        
        // Auto insert
        if (text) {
            await insertToExternalApp(text);
        }
        
    } catch (error) {
        console.error('API Error:', error);
        setSpeechState('ready');
    } finally {
        isProcessing = false;
    }
}

function writeWavHeader(view, opts) {
    const { numChannels, sampleRate, dataByteLength } = opts;
    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    const blockAlign = numChannels * 2;
    const byteRate = sampleRate * blockAlign;
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataByteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataByteLength, true);
}

function audioBufferToWavBlob(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numSamples = audioBuffer.length;
    const dataByteLength = numSamples * numChannels * 2;
    const buffer = new ArrayBuffer(44 + dataByteLength);
    const view = new DataView(buffer);
    writeWavHeader(view, { numChannels, sampleRate, dataByteLength });

    const channels = [];
    for (let c = 0; c < numChannels; c++) {
        channels.push(audioBuffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
            let s = channels[c][i];
            if (s > 1) s = 1;
            else if (s < -1) s = -1;
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

async function convertBlobToWavIfPossible(blob) {
    if (!blob) return null;
    const type = (blob.type || '').toLowerCase();
    if (!type.includes('webm') && !type.includes('ogg') && !type.includes('mp4')) return null;

    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        try {
            await ctx.close();
        } catch (_) {
        }
        return audioBufferToWavBlob(audioBuffer);
    } catch (_) {
        return null;
    }
}

async function convertBlobToWav16kMono(blob) {
    if (!blob) return null;
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        try {
            await ctx.close();
        } catch (_) {
        }

        const srcChannels = audioBuffer.numberOfChannels;
        const srcLength = audioBuffer.length;
        const srcSampleRate = audioBuffer.sampleRate;

        const mono = new OfflineAudioContext(1, srcLength, srcSampleRate).createBuffer(1, srcLength, srcSampleRate);
        const monoData = mono.getChannelData(0);
        for (let c = 0; c < srcChannels; c++) {
            const ch = audioBuffer.getChannelData(c);
            for (let i = 0; i < srcLength; i++) {
                monoData[i] += ch[i] / srcChannels;
            }
        }

        const targetSampleRate = 16000;
        const targetLength = Math.max(1, Math.ceil((srcLength / srcSampleRate) * targetSampleRate));
        const offline = new OfflineAudioContext(1, targetLength, targetSampleRate);
        const source = offline.createBufferSource();
        source.buffer = mono;
        source.connect(offline.destination);
        source.start(0);
        const rendered = await offline.startRendering();

        return audioBufferToWavBlob(rendered);
    } catch (_) {
        return null;
    }
}

// --- API Implementations ---

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function callGemini(blob, apiKey, model, prompt) {
    if (!apiKey) throw new Error('Gemini API Key 未配置');

    const base64Audio = await blobToBase64(blob);

    // 说明：不同账号/区域可用模型不同，因此增加模型选择并做回退。
    const preferredModel = model || 'gemini-3-flash-preview';
    const modelFallbacks = [
        preferredModel,
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-pro'
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);
    
    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inline_data: {
                        mime_type: "audio/webm",
                        data: base64Audio
                    }
                }
            ]
        }]
    };

    let lastErr = null;
    for (const m of modelFallbacks) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                const msg = data && data.error && data.error.message ? data.error.message : `HTTP ${response.status}`;
                throw new Error(msg);
            }

            if (data.error) {
                throw new Error(data.error.message);
            }

            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                const out = data.candidates[0].content.parts[0].text;
                return (out || '').trim();
            }
            throw new Error('Gemini 未返回可用内容');
        } catch (e) {
            lastErr = e;
            const msg = String(e && e.message ? e.message : e);
            const isModelNotFound = msg.includes('is not found') || msg.includes('not supported') || msg.includes('models/');
            if (!isModelNotFound) {
                break;
            }
        }
    }

    throw lastErr || new Error('Gemini 调用失败');
}

async function callQwenTranscribe(blob, apiKey, model, prompt) {
    if (!apiKey) throw new Error('Qwen API Key 未配置');

    if (!window.electronAPI || !window.electronAPI.qwen || typeof window.electronAPI.qwen.asrTranscribe !== 'function') {
        throw new Error('Qwen 初始化失败：缺少 qwen.asrTranscribe');
    }

    let uploadBlob = blob;
    let filename = 'recording.webm';
    const wav16k = await convertBlobToWav16kMono(blob);
    if (wav16k) {
        uploadBlob = wav16k;
        filename = 'recording.wav';
    } else {
        const wav = await convertBlobToWavIfPossible(blob);
        if (wav) {
            uploadBlob = wav;
            filename = 'recording.wav';
        }
    }

    const mimeType = (uploadBlob && uploadBlob.type) ? uploadBlob.type : (filename.endsWith('.wav') ? 'audio/wav' : 'audio/webm');
    const base64Audio = await blobToBase64(uploadBlob);

    const out = await window.electronAPI.qwen.asrTranscribe({
        apiKey,
        model: model || 'qwen3-asr-flash',
        audioBase64: base64Audio,
        mimeType
    });

    return (out || '').trim();
}

async function callQwenPostProcess(text, apiKey, model, systemPrompt) {
    const inputText = (text || '').trim();
    if (!inputText) return '';
    if (!apiKey) throw new Error('Qwen API Key 未配置');

    if (!window.electronAPI || !window.electronAPI.qwen || typeof window.electronAPI.qwen.textGenerate !== 'function') {
        throw new Error('Qwen 初始化失败：缺少 qwen.textGenerate');
    }

    const out = await window.electronAPI.qwen.textGenerate({
        apiKey,
        model: model || 'qwen-plus',
        systemPrompt,
        userText: inputText
    });
    return (out || inputText).trim();
}

// Start
if (VIEW === 'indicator') {
    initIndicatorView();
} else {
    initSettingsView();
}
