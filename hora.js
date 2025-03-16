// Función para obtener la hora actual en formato amigable
function obtenerHora() {
    const ahora = new Date();
    
    // Opciones de formato para la hora
    const opciones = { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    
    // Formato completo para español
    return ahora.toLocaleString('es-ES', opciones);
}

// Para permitir pru