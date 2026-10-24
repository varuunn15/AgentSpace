import "dotenv/config";
import amqplib from 'amqplib';

const QUEUE = 'auth_notification_queue';

let channel = null;

try {
    if (process.env.RABBITMQ_URL) {
        const connection = await amqplib.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE, { durable: true });
    }
} catch (err) {
    console.error('Failed to connect to RabbitMQ in notification service:', err.message);
}

export default channel;
