// Variables globales
const API_KEY = "AIzaSyBk2gDvRT_WERHwZW-vuoI_NNnWrOEZ7b8"; // ⚠️ Ten cuidado con tu clave API
let currentSpeech = null;
let isRecording = false;
let recognitionTimeout = null;
let voices = [];
let isWaitingForResponse = false;

// Configuración del contexto
const MAX_CONTEXT_MESSAGES = 10;  // Número máximo de mensajes para el contexto
const MAX_CONTEXT_LENGTH = 2000;  // Longitud máxima en caracteres para evitar exceder límites de token

// Elementos DOM
const chatElement = document.getElementById('chat');
const inputField = document.getElementById('input');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const sendBtn = document.getElementById('sendBtn');
const voiceSelect = document.getElementById('voiceSelect');
const rateSelect = document.getElementById('rateSelect');
const pitchSelect = document.getElementById('pitchSelect');
const rateValue = document.getElementById('rateValue');
const pitchValue = document.getElementById('pitchValue');
const toggleConfigBtn = document.getElementById('toggleConfig');
const configMenu = document.getElementById('configMenu');
const closeConfigBtn = document.getElementById('closeConfig');
const themeToggle = document.getElementById('themeToggle');
const typingIndicator = document.getElementById('typing-indicator');

// Sonidos de interfaz
const sounds = {
    send: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'], volume: 0.5 }),
    receive: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'], volume: 0.5 }),
    start: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3'], volume: 0.5 }),
    stop: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'], volume: 0.5 })
};

// Inicialización del reconocimiento de voz
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'es-ES';
recognition.interimResults = true;
recognition.maxAlternatives = 1;
recognition.continuous = false;

// Manejo del historial de chat y contexto
let chatHistory = [];

// Cargar historial del chat desde localStorage
function loadChatHistory() {
    const savedChat = localStorage.getItem('geminiChatHistory');
    if (savedChat) {
        try {
            chatHistory = JSON.parse(savedChat);
            
            // Mostrar mensajes guardados en la interfaz
            chatHistory.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.textContent = msg.text;
                messageDiv.className = `message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`;
                chatElement.appendChild(messageDiv);
            });
            
            chatElement.scrollTop = chatElement.scrollHeight;
        } catch (error) {
            console.error('Error al cargar el historial del chat:', error);
            chatHistory = [];
        }
    }
}

// Guardar historial del chat en localStorage
function saveChatHistory() {
    localStorage.setItem('geminiChatHistory', JSON.stringify(chatHistory));
}

// Resumir el contexto para optimizar tokens
function generateContext() {
    if (chatHistory.length === 0) return "";
    
    // Si hay pocos mensajes, usar todos
    if (chatHistory.length <= MAX_CONTEXT_MESSAGES) {
        return chatHistory.map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.text}`).join('\n\n');
    }
    
    // Si hay muchos mensajes, incluir un resumen y los últimos mensajes
    let context = "Resumen de la conversación anterior:\n";
    
    // Resumir primeros mensajes
    const oldMessages = chatHistory.slice(0, chatHistory.length - MAX_CONTEXT_MESSAGES);
    const topics = new Set();
    oldMessages.forEach(msg => {
        // Extraer términos clave de cada mensaje (simplificado)
        const keywords = msg.text.split(/\s+/)
            .filter(word => word.length > 4)
            .slice(0, 3);
        keywords.forEach(word => topics.add(word.toLowerCase()));
    });
    
    context += `La conversación ha tratado sobre: ${Array.from(topics).slice(0, 8).join(", ")}.\n\n`;
    
    // Incluir los mensajes más recientes completos
    context += "Mensajes recientes:\n";
    const recentMessages = chatHistory.slice(-MAX_CONTEXT_MESSAGES);
    context += recentMessages.map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.text}`).join('\n\n');
    
    // Truncar si es demasiado largo
    if (context.length > MAX_CONTEXT_LENGTH) {
        context = context.substring(context.length - MAX_CONTEXT_LENGTH);
        // Asegurar que comienza con una frase completa
        context = '...' + context.substring(context.indexOf('\n') + 1);
    }
    
    return context;
}

// Cargar tema guardado
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    themeToggle.checked = savedTheme === 'dark';
}

// Cargar configuración guardada
function loadSavedConfig() {
    // Cargar tema
    loadSavedTheme();
    
    // Actualizar displays de valores
    rateValue.textContent = rateSelect.value;
    pitchValue.textContent = pitchSelect.value;
    
    // Cargar configuración de voz si existe
    const savedVoiceIndex = localStorage.getItem('selectedVoice');
    const savedRate = localStorage.getItem('rate') || 1;
    const savedPitch = localStorage.getItem('pitch') || 1;
    
    if (savedVoiceIndex) voiceSelect.selectedIndex = parseInt(savedVoiceIndex);
    rateSelect.value = savedRate;
    pitchSelect.value = savedPitch;
    
    // Actualizar displays
    rateValue.textContent = savedRate;
    pitchValue.textContent = savedPitch;
}

// Obtener las voces disponibles para TTS
function loadVoices() {
    voices = speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    
    // Filtrar para preferir voces en español
    const spanishVoices = voices.filter(voice => voice.lang.includes('es'));
    const otherVoices = voices.filter(voice => !voice.lang.includes('es'));
    const sortedVoices = [...spanishVoices, ...otherVoices];
    
    sortedVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;
        option.selected = voice.default;
        voiceSelect.appendChild(option);
    });
    
    loadSavedConfig();
}

// Inicializar voces
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();

// Función para añadir mensajes al chat
function appendMessage(message, className, saveToHistory = true) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${className}`;
    chatElement.appendChild(messageDiv);
    chatElement.scrollTop = chatElement.scrollHeight;
    
    // Guardar en el historial si se indica
    if (saveToHistory) {
        const role = className === 'user-message' ? 'user' : 'assistant';
        chatHistory.push({ role, text: message });
        saveChatHistory();
    }
    
    // Reproducir sonido según tipo de mensaje
    if (className === 'user-message') {
        sounds.send.play();
    } else if (className === 'bot-message') {
        sounds.receive.play();
        readAloud(message);
    }
}

// Mostrar indicador de "escribiendo..."
function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    chatElement.scrollTop = chatElement.scrollHeight;
}

// Ocultar indicador de "escribiendo..."
function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

// Función para enviar mensaje a Gemini
function sendMessage(userInput) {
    if (!userInput.trim()) return;
    
    // Limpiar campo de entrada
    inputField.value = '';
    
    // Mostrar mensaje del usuario
    appendMessage(userInput, 'user-message');
    
    // Verificar si es pregunta sobre la hora
    if (userInput.toLowerCase().includes("hora") || 
        userInput.toLowerCase().includes("tiempo") || 
        userInput.toLowerCase().includes("¿qué hora")) {
        try {
            const horaActual = obtenerHora();
            appendMessage(`La hora actual es: ${horaActual}`, 'bot-message');
            return;
        } catch (error) {
            console.error("Error al obtener la hora:", error);
            // Continuar con Gemini si falla la función de hora
        }
    }
    
    // Mostrar indicador de "escribiendo..."
    showTypingIndicator();
    isWaitingForResponse = true;
    
    // Actualizar estado de los botones
    updateButtonStates();
    
    // Generar contexto para la consulta
    const context = generateContext();
    
    // Crear prompt para Gemini incluyendo el contexto
    const promptWithContext = context ? 
        `Contexto de la conversación:\n${context}\n\nConsulta actual:\n${userInput}` : 
        userInput;
    
    // Enviar solicitud a Gemini
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: promptWithContext }]
            }]
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Error de API: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Ocultar indicador de "escribiendo..."
        hideTypingIndicator();
        isWaitingForResponse = false;
        
        // Procesar respuesta
        const respuesta = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                         'Lo siento, no pude procesar tu solicitud en este momento.';
        appendMessage(respuesta, 'bot-message');
        
        // Actualizar estado de los botones
        updateButtonStates();
    })
    .catch(error => {
        console.error("Error:", error);
        hideTypingIndicator();
        isWaitingForResponse = false;
        appendMessage('Lo siento, ocurrió un error al comunicarse con Gemini. Por favor, inténtalo de nuevo más tarde.', 'bot-message');
        updateButtonStates();
    });
}

// Función para leer texto en voz alta
function readAloud(text) {
    if ('speechSynthesis' in window) {
        // Cancelar cualquier lectura anterior
        window.speechSynthesis.cancel();
        
        // Crear nueva instancia de síntesis de voz
        currentSpeech = new SpeechSynthesisUtterance(text);
        
        // Configurar voz
        const selectedVoiceIndex = parseInt(voiceSelect.value);
        currentSpeech.voice = voices[selectedVoiceIndex] || voices[0];
        currentSpeech.rate = parseFloat(rateSelect.value);
        currentSpeech.pitch = parseFloat(pitchSelect.value);
        
        // Eventos de la síntesis
        currentSpeech.onstart = () => {
            updateButtonStates();
        };
        
        currentSpeech.onend = () => {
            currentSpeech = null;
            updateButtonStates();
        };
        
        currentSpeech.onerror = (event) => {
            console.error('Error de síntesis de voz:', event);
            currentSpeech = null;
            updateButtonStates();
        };
        
        // Iniciar lectura
        window.speechSynthesis.speak(currentSpeech);
    } else {
        console.error('La API de SpeechSynthesis no está soportada en este navegador');
    }
}

// Actualizar estados de los botones
function updateButtonStates() {
    const isSpeaking = currentSpeech && window.speechSynthesis.speaking;
    const isPaused = currentSpeech && window.speechSynthesis.paused;
    
    startBtn.disabled = isRecording || isWaitingForResponse;
    pauseBtn.disabled = !isSpeaking || isPaused;
    resumeBtn.disabled = !isPaused;
    stopBtn.disabled = !isSpeaking && !isPaused;
    
    // Actualizar texto del botón de inicio
    if (isRecording) {
        startBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Escuchando...';
    } else {
        startBtn.innerHTML = '<i class="fas fa-microphone"></i> Hablar con Gemini';
    }
}

// Funciones de control de voz
function pauseReading() {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        updateButtonStates();
    }
}

function resumeReading() {
    if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        updateButtonStates();
    }
}

function stopReading() {
    if (window.speechSynthesis.speaking || window.speechSynthesis.paused) {
        window.speechSynthesis.cancel();
        sounds.stop.play();
        currentSpeech = null;
        updateButtonStates();
    }
}

// Eventos del reconocimiento de voz
recognition.onstart = () => {
    isRecording = true;
    sounds.start.play();
    updateButtonStates();
};

recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript;
    inputField.value = transcript;
};

recognition.onend = () => {
    isRecording = false;
    updateButtonStates();
    
    // Si hay texto transcrito, enviar después de un breve retraso
    if (inputField.value.trim()) {
        // Limpiar cualquier timeout pendiente
        if (recognitionTimeout) {
            clearTimeout(recognitionTimeout);
        }
        
        recognitionTimeout = setTimeout(() => {
            if (inputField.value.trim()) {
                sendMessage(inputField.value.trim());
            }
        }, 1000);
    }
};

recognition.onerror = (event) => {
    console.error('Error en reconocimiento de voz:', event.error);
    isRecording = false;
    updateButtonStates();
    
    if (event.error === 'not-allowed') {
        appendMessage('No se ha permitido el acceso al micrófono. Por favor, permite el acceso y vuelve a intentarlo.', 'bot-message');
    }
};

// Event Listeners
startBtn.addEventListener('click', () => {
    if (!isRecording) {
        recognition.start();
    }
});

pauseBtn.addEventListener('click', pauseReading);
resumeBtn.addEventListener('click', resumeReading);
stopBtn.addEventListener('click', stopReading);

sendBtn.addEventListener('click', () => {
    sendMessage(inputField.value);
});

inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage(inputField.value);
    }
});

rateSelect.addEventListener('input', () => {
    const rate = rateSelect.value;
    localStorage.setItem('rate', rate);
    rateValue.textContent = rate;
});

pitchSelect.addEventListener('input', () => {
    const pitch = pitchSelect.value;
    localStorage.setItem('pitch', pitch);
    pitchValue.textContent = pitch;
});

voiceSelect.addEventListener('change', () => {
    localStorage.setItem('selectedVoice', voiceSelect.selectedIndex);
});

toggleConfigBtn.addEventListener('click', () => {
    configMenu.classList.toggle('hidden');
});

closeConfigBtn.addEventListener('click', () => {
    configMenu.classList.add('hidden');
});

themeToggle.addEventListener('change', () => {
    const theme = themeToggle.checked ? 'dark' : 'light';
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
});

// Botón para limpiar el historial
function addClearHistoryButton() {
    const configSection = document.createElement('div');
    configSection.className = 'config-section';
    
    const clearHistoryBtn = document.createElement('button');
    clearHistoryBtn.className = 'control-button';
    clearHistoryBtn.innerHTML = '<i class="fas fa-trash"></i> Borrar historial';
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres borrar todo el historial de chat?')) {
            chatHistory = [];
            localStorage.removeItem('geminiChatHistory');
            chatElement.innerHTML = '';
            appendMessage('El historial de chat ha sido borrado.', 'bot-message', false);
            configMenu.classList.add('hidden');
        }
    });
    
    configSection.appendChild(clearHistoryBtn);
    configMenu.appendChild(configSection);
}

// Mostrar mensaje de bienvenida e inicializar
window.addEventListener('DOMContentLoaded', () => {
    // Cargar historial existente
    loadChatHistory();
    
    // Añadir botón de borrar historial
    addClearHistoryButton();
    
    // Mostrar mensaje de bienvenida solo si no hay historial
    if (chatHistory.length === 0) {
        setTimeout(() => {
            appendMessage('¡Hola! Soy Gemini 2.0 Flash. Puedes hablarme haciendo clic en el botón "Hablar con Gemini" o escribiendo tu mensaje. ¿En qué puedo ayudarte hoy?', 'bot-message');
        }, 500);
    }
});
