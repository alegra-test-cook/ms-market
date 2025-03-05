const express = require('express');
const amqp = require('amqplib');

const PORT = process.env.PORT || 3004;
const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

const app = express();
app.use(express.json());

async function start() {
  const connection = await amqp.connect(RABBIT_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue('market_requests');

  channel.consume('market_requests', (msg) => {
    if (!msg) return;
    const request = JSON.parse(msg.content.toString());
    const { orderId, ingredient, quantity } = request;
    const availableNow = Math.random() < 0.7;
    if (availableNow) {
      console.log(`🟢 Mercado: Ingrediente "${ingredient}" (cant. ${quantity}) disponible para Pedido ${orderId}. Enviando confirmación...`);
      const response = { ingredient: ingredient, quantity: quantity };
      channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
        correlationId: msg.properties.correlationId
      });
      channel.ack(msg);
    } else {
      console.log(`🟡 Mercado: "${ingredient}" no disponible actualmente para Pedido ${orderId}. Esperando reabastecimiento...`);
      setTimeout(() => {
        console.log(`🟢 Mercado: Ingrediente "${ingredient}" reabastecido. Enviando ${quantity} unidad(es) para Pedido ${orderId}.`);
        const response = { ingredient: ingredient, quantity: quantity };
        try {
          channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
            correlationId: msg.properties.correlationId
          });
          channel.ack(msg);
        } catch (err) {
          console.error('✘ Error enviando respuesta desde Mercado:', err);
        }
      }, 5000);
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