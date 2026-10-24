import express from 'express';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { Server } from "socket.io";
import http from 'http';
import pty from 'node-pty';
import os from 'os';
import cors from 'cors';

const WORKING_DIR = fs.existsSync('/workspace') ? '/workspace' : path.resolve(process.cwd(), 'workspace');
if (!fs.existsSync(WORKING_DIR)) {
    try {
        fs.mkdirSync(WORKING_DIR, { recursive: true });
    } catch {
        // ignore if cannot create
    }
}

function resolveWorkspacePath(file) {
    if (typeof file !== 'string' || !file.trim()) {
        throw new Error('A non-empty file path is required');
    }

    // Agent tools send workspace-relative paths with an optional leading slash.
    const cleanFile = file.replace(/^[\\/]+/, '');
    const filePath = path.resolve(WORKING_DIR, cleanFile);
    const relativePath = path.relative(WORKING_DIR, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error('File path must stay inside the project workspace');
    }
    return filePath;
}

const app = express();
const httpServer = http.createServer(app);

app.use(morgan('dev'));
app.use(cors({
    methods: [ "GET", "POST", "PATCH", "DELETE" ],
    origin: "*",
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: [ "GET", "POST", "PATCH" ],
    }
});

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Hello from sandbox agent!',
        status: 'success',
    });
});

app.get("/_status/healthz", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.get("/_status/readyz", (req, res) => {
    res.status(200).json({ status: "ready" });
});

const defaultShell = os.platform() === 'win32' ? (process.env.COMSPEC || 'powershell.exe') : 'bash';
const shell = process.env.SHELL || defaultShell;

let ptyProcess = null;
try {
    ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: WORKING_DIR,
        env: process.env
    });

    ptyProcess.onData((data) => {
        io.emit('terminal-output', data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`PTY process exited with code: ${exitCode}, signal: ${signal}`);
    });
} catch (err) {
    console.error('PTY spawn failed:', err.message);
}

io.on("connection", (socket) => {
    console.log("Client connected: " + socket.id);

    socket.on("terminal-input", (data) => {
        if (ptyProcess) {
            ptyProcess.write(data);
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected: " + socket.id);
    });
});

/**
 * @route GET /list-files
 * @description Lists all files in the working directory and its subdirectories. Returns a JSON object with the file paths relative to the working directory. exclude directories like node_modules, .git,dist, etc.
 * - eg. {
 *     "files": [
 *         "file1.txt",
 *         "src/file2.txt",
 *         "src/subdir/file3.txt"
 *     ]
 * }
 */
app.get("/list-files", async (req, res) => {

    const listFiles = async (dir, baseDir) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);

            // Exclude certain directories
            if (entry.isDirectory() && [ 'node_modules', '.git', 'dist' ].includes(entry.name)) {
                continue;
            }

            if (entry.isDirectory()) {
                files.push(...await listFiles(fullPath, baseDir));
            } else {
                files.push(relativePath.replace(/\\/g, '/'));
            }
        }

        return files;
    }

    try {
        const files = await listFiles(WORKING_DIR, WORKING_DIR);
        res.status(200).json({
            message: 'Files listed successfully',
            files,
        });
    } catch (err) {
        res.status(500).json({
            message: `Error listing files: ${err.message}`,
            status: 'error',
        });
    }

});


/**
 * @route GET /read-files
 * @description Reads the content of all files requested in the query parameter 'files' and returns their content as a JSON object.
 * - eg. /read-files?files=file1.txt,/src/file2.txt
 */
app.get("/read-files", async (req, res) => {

    const files = req.query.files;

    if (!files) {
        return res.status(400).json({
            message: 'No files specified in query parameter',
            status: 'error',
        });
    }

    const fileList = files.split(',');

    let resolvedFiles;
    try {
        resolvedFiles = fileList.map((file) => ({ file, filePath: resolveWorkspacePath(file) }));
    } catch (err) {
        return res.status(400).json({ message: err.message, status: 'error' });
    }

    const results = await Promise.all(resolvedFiles.map(async ({ file, filePath }) => {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return {
                [ '/' + path.relative(WORKING_DIR, filePath).replace(/\\/g, '/') ]: content,
            }
        } catch (err) {
            return {
                [ '/' + path.relative(WORKING_DIR, filePath).replace(/\\/g, '/') ]: `Error reading file: ${err.message}`,
            }
        }
    }));

    res.status(200).json({
        message: 'File contents',
        files: results,
    });

});


/**
 * @route PATCH /update-files
 * @description Updates the content of files specified in the request body. The request body should container a property 'updates' with a JSON Array of object, each object should have a 'file' property specifying the file path (relative to the working directory) and a 'content' property specifying the new content for the file.
 */
app.patch("/update-files", async (req, res) => {

    const updates = req.body.updates;

    if (!Array.isArray(updates) || updates.some((update) =>
        !update || typeof update.file !== 'string' || typeof update.content !== 'string'
    )) {
        return res.status(400).json({
            message: 'Invalid request body. Expected an "updates" array of objects with string file and content properties.',
            status: 'error',
        });
    }

    let resolvedUpdates;
    try {
        resolvedUpdates = updates.map(({ file, content }) => ({
            file,
            content,
            filePath: resolveWorkspacePath(file),
        }));
    } catch (err) {
        return res.status(400).json({ message: err.message, status: 'error' });
    }

    const results = await Promise.all(resolvedUpdates.map(async ({ file, content, filePath }) => {
        try {
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return {
                [ '/' + path.relative(WORKING_DIR, filePath).replace(/\\/g, '/') ]: 'File updated successfully',
            }
        } catch (err) {
            return {
                [ '/' + path.relative(WORKING_DIR, filePath).replace(/\\/g, '/') ]: `Error updating file: ${err.message}`,
            }
        }
    }));

    const hasFailures = results.some((result) => Object.values(result)[0]?.startsWith('Error updating file:'));

    res.status(hasFailures ? 500 : 200).json({
        message: 'File update results',
        results,
    });
});


/**
 * @route POST /create-files
 * @description Creates new files with the content specified in the request body. The request body should contain a property 'files' with a JSON Array of objects, each object should have a 'file' property specifying the file path (relative to the working directory) and a 'content' property specifying the content for the new file.
 */
app.post("/create-files", async (req, res) => {
    const files = req.body.files;

    if (!Array.isArray(files) || files.some((file) =>
        !file || typeof file.file !== 'string' || typeof file.content !== 'string'
    )) {
        return res.status(400).json({
            message: 'Invalid request body. Expected a "files" array of objects with string file and content properties.',
            status: 'error',
        });
    }

    let resolvedFiles;
    try {
        resolvedFiles = files.map(({ file, content }) => ({ file, content, filePath: resolveWorkspacePath(file) }));
    } catch (err) {
        return res.status(400).json({ message: err.message, status: 'error' });
    }

    const results = await Promise.all(resolvedFiles.map(async ({ file, content, filePath }) => {
        try {
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return {
                [ '/' + path.relative(WORKING_DIR, filePath).replace(/\\/g, '/') ]: 'File created successfully',
            }
        } catch (err) {
            return {
                [ '/' + path.relative(WORKING_DIR, filePath).replace(/\\/g, '/') ]: `Error creating file: ${err.message}`,
            }
        }
    }));

    const hasFailures = results.some((result) => Object.values(result)[0]?.startsWith('Error creating file:'));

    res.status(hasFailures ? 500 : 200).json({
        message: 'File creation results',
        results,
    });
});

export default httpServer;
