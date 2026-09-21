import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;

function start() {
    const app = createApp();

    app.listen(PORT, () => {
        console.log(`🚀 Greynote API is running at http://localhost:${PORT}/api/health`);
    });
}

start();
