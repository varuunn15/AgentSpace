import "dotenv/config";
import amqplib from 'amqplib';

const QUEUE = 'auth_notification_queue';

let connection = null;
let channel = null;

try {
    if (process.env.RABBITMQ_URL) {
        connection = await amqplib.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE, { durable: true });
    }
} catch (err) {
    console.error('Failed to connect to RabbitMQ in auth service:', err.message);
}

export async function sendAuthNotification(message) {
    if (!channel) {
        console.warn('RabbitMQ channel not available, skipping notification');
        return;
    }
    try {
        channel.sendToQueue(
            QUEUE,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );
    } catch (err) {
        console.error('Failed to send auth notification:', err.message);
    }
}
