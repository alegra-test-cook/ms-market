const express = require('express');
const amqp = require('amqplib');
const axios = require('axios');
const cors = require('cors');

const { PORT, RABBIT_URL, MARKET_API_URL, QUEUE_NAMES, RETRY_TIMEOUT } = require('./config');
const logger = require('./logger');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

async function start() {
  await logger.initLogger();
  await logger.info('Servicio de Mercado iniciado');
  
  const connection = await amqp.connect(RABBIT_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAMES.MARKET_REQUESTS);

  channel.consume(QUEUE_NAMES.MARKET_REQUESTS, async (msg) => {
    if (!msg) return;
    const request = JSON.parse(msg.content.toString());
    const { orderId, ingredient, quantity } = request;
    
    try {
      let totalQuantityReceived = 0;
      await logger.info(`🔍 Buscando "${ingredient}" (cant. necesaria: ${quantity}) para Pedido ${orderId}`);
      
      while (totalQuantityReceived < quantity) {
        try {
          const response = await axios.get(`${MARKET_API_URL}?ingredient=${ingredient}`);
          const quantitySold = response.data?.quantitySold || 0;
          
          if (quantitySold > 0) {
            totalQuantityReceived += quantitySold;
            await logger.info(`🛒 Compra exitosa de ${quantitySold} unidad(es) de "${ingredient}" para Pedido ${orderId}`);
          } else {
            await logger.warning(`"${ingredient}" no disponible actualmente. Esperando reabastecimiento...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_TIMEOUT));
          }
        } catch (error) {
          await logger.error(`Error en API del Mercado: ${error.message}`, { 
            ingredient, 
            orderId,
            stack: error.stack 
          });
          await new Promise(resolve => setTimeout(resolve, RETRY_TIMEOUT));
        }
      }
      
      await logger.info(`🔍 Cantidad total conseguida de "${ingredient}": ${totalQuantityReceived} para Pedido ${orderId}`);
      
      const response = { ingredient: ingredient, quantity: totalQuantityReceived };
      channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
        correlationId: msg.properties.correlationId
      });
      channel.ack(msg);
    } catch (err) {
      await logger.error(`Error general procesando solicitud en Mercado: ${err.message}`, { 
        ingredient, 
        orderId,
        stack: err.stack 
      });
      channel.nack(msg, false, true);
    }
  }, { noAck: false });

  app.get('/', async (_req, res) => {
    await logger.info('Endpoint raíz del servicio de mercado accedido');
    res.send('Servicio de Mercado operativo');
  });

  app.listen(PORT, () => {
    logger.info(`Servicio de Mercado escuchando en puerto ${PORT}`);
  });
}

start().catch(async err => {
  try {
    await logger.error(`Error iniciando el Servicio de Mercado: ${err.message}`, { stack: err.stack });
  } catch (logError) {
    console.error('✘ Error iniciando el Servicio de Mercado:', err);
    console.error('Error adicional al intentar registrar el error:', logError);
  }
  process.exit(1);
});