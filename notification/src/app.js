import "dotenv/config";
import express from 'express';
import morgan from 'morgan';
import { sendEmail } from './email.js';
import channel from './mq.js';

const app = express();
app.use(morgan('dev'));

app.get('/', (req, res) => {
    res.send('Hello from Notification Service!');
});

app.get("/_status/healthz", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.get("/_status/readyz", (req, res) => {
    res.status(200).json({ status: "ready" });
});

if (channel) {
    channel.consume('auth_notification_queue', async (msg) => {
        if (msg !== null) {
            const messageContent = msg.content.toString();
            console.log('Received message from queue:', messageContent);

            try {
                const { userId, timestamp, email } = JSON.parse(messageContent);
                
                const subject = 'New Login Notification';
                const text = `A new login was detected for your account at ${timestamp}. If this was not you, please secure your account immediately.`;
                const html = `<p>A new login was detected for your account at <strong>${timestamp}</strong>. If this was not you, please secure your account immediately.</p>`;

                await sendEmail(email, subject, text, html);
                
                channel.ack(msg);
            } catch (error) {
                console.error('Error processing message:', error);
            }
        } else {
            console.log('Received null message');
        }
    });
} else {
    console.warn('RabbitMQ channel is not available; consumer is not active');
}

export default app;
