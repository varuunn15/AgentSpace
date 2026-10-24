import "dotenv/config";
import app from './src/app.js';
import { connectDB } from './src/config/db.js';

connectDB();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Auth server is running on http://localhost:${PORT}`);
});
