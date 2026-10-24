import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import sandboxRouter from './routes/sandbox.routes.js';

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
    origin: [ 'https://www.cryboy.in', /\.cryboy\.in$/, 'http://localhost:5173' ],
    credentials: true,
    methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS' ]
}));

app.get('/api/sandbox/health', (req, res) => {
    res.status(200).json({
        message: 'Sandbox API is healthy',
        status: 'ok'
    });
});

app.get('/_status/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/_status/readyz', (req, res) => {
    res.status(200).json({ status: 'ready' });
});

app.use('/api/sandbox', sandboxRouter);

export default app;
