const express = require('express');
const amqp = require('amqplib');
const axios = require('axios');

// Importar configuraciones
const { PORT, RABBIT_URL, MARKET_API_URL, QUEUE_NAMES, RETRY_TIMEOUT } = require('./config');

const app = express();
app.use(express.json());

async function start() {
  const connection = await amqp.connect(RABBIT_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAMES.MARKET_REQUESTS);

  channel.consume(QUEUE_NAMES.MARKET_REQUESTS, async (msg) => {
    if (!msg) return;
    const request = JSON.parse(msg.content.toString());
    const { orderId, ingredient, quantity } = request;
    
    try {
      let totalQuantityReceived = 0;
      console.log(`🔍 Mercado: Buscando "${ingredient}" (cant. necesaria: ${quantity}) para Pedido ${orderId}.`);
      
      // Intentar comprar hasta conseguir la cantidad necesaria
      while (totalQuantityReceived < quantity) {
        try {
          const response = await axios.get(`${MARKET_API_URL}?ingredient=${ingredient}`);
          const quantitySold = response.data?.quantitySold || 0;
          
          if (quantitySold > 0) {
            totalQuantityReceived += quantitySold;
            console.log(`🟢 Mercado: Compra exitosa de ${quantitySold} unidad(es) de "${ingredient}" para Pedido ${orderId}.`);
          } else {
            console.log(`🟡 Mercado: "${ingredient}" no disponible actualmente. Esperando reabastecimiento...`);
            // Esperar antes de intentar de nuevo
            await new Promise(resolve => setTimeout(resolve, RETRY_TIMEOUT));
          }
        } catch (error) {
          console.error(`🔴 Error en API del Mercado:`, error.message);
          // Esperar antes de intentar de nuevo
          await new Promise(resolve => setTimeout(resolve, RETRY_TIMEOUT));
        }
      }
      
      console.log(`✅ Mercado: Cantidad total conseguida de "${ingredient}": ${totalQuantityReceived} para Pedido ${orderId}.`);
      
      // Enviar respuesta a quien solicitó
      const response = { ingredient: ingredient, quantity: totalQuantityReceived };
      channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
        correlationId: msg.properties.correlationId
      });
      channel.ack(msg);
    } catch (err) {
      console.error('✘ Error general procesando solicitud en Mercado:', err);
      channel.nack(msg, false, true); // Reencolar mensaje para reintento
    }
  }, { noAck: false });

  app.get('/', (_req, res) => {
    res.send('Servicio de Mercado operativo');
  });

  app.listen(PORT, () => {
    console.log(`🚀 Servicio de Mercado escuchando en puerto ${PORT}`);
  });
}

start().catch(err => {
  console.error('✘ Error iniciando el Servicio de Mercado:', err);
  process.exit(1);
});