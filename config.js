/**
 * Configuración del Microservicio de Mercado
 */

// Configuración del servidor
const PORT = process.env.PORT || 3004;

// Configuración de la conexión a RabbitMQ
const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

// URL de la API externa del mercado
const MARKET_API_URL = 'https://recruitment.alegra.com/api/farmers-market/buy';

// Nombres de colas
const QUEUE_NAMES = {
  MARKET_REQUESTS: 'market_requests'
};

// Tiempo de espera para reintentar compras (ms)
const RETRY_TIMEOUT = 5000;

// Exportar configuraciones
module.exports = {
  PORT,
  RABBIT_URL,
  MARKET_API_URL,
  QUEUE_NAMES,
  RETRY_TIMEOUT
}; 