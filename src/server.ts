import express, { Request, Response } from 'express';
import { createConnection, Repository } from 'typeorm';
import { Task } from './entity/Task';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { EventEmitter } from 'events';
import { requestLogger, errorHandler } from './middleware';

const upload = multer({
    dest: path.join(__dirname, 'uploads'), // Temporary storage directory
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10 MB
});

class FileProcessor extends EventEmitter {}

export const fileProcessor = new FileProcessor();

const app = express();
const port = 3000;

app.use(express.json());
app.use(requestLogger);

const createDirectoryIfNotExists = (dir: string) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
};
createDirectoryIfNotExists(path.join(__dirname, 'logs'));
createDirectoryIfNotExists(path.join(__dirname, 'uploads'));

// Connect to the database
createConnection().then(connection => {
    const taskRepository: Repository<Task> = connection.getRepository(Task);

    const handleError = (res: Response, statusCode: number, message: string) => {
        res.status(statusCode).json({ error: message });
    };

    app.get('/tasks', async (req: Request, res: Response) => {
        try {
            const tasks = await taskRepository.find();
            res.json(tasks);
        } catch (error) {
            handleError(res, 500, 'Failed to fetch tasks');
        }
    });

    app.get('/task/:id', async (req: Request, res: Response) => {
        try {
            const taskId: number = parseInt(req.params.id, 10);
            const task = await taskRepository.findOneBy({ id: taskId });
            if (task) {
                res.json(task);
            } else {
                handleError(res, 404, 'Task not found');
            }
        } catch (error) {
            handleError(res, 500, 'Failed to fetch task');
        }
    });

    app.post('/tasks', async (req: Request, res: Response) => {
        try {
            const task = taskRepository.create(req.body);
            const result = await taskRepository.save(task);
            res.status(201).json(result);
        } catch (error) {
            handleError(res, 500, 'Failed to create task');
        }
    });

    app.put('/task/:id', async (req: Request, res: Response) => {
        try {
            const id: number = parseInt(req.params.id, 10);
            const { title, description, completed } = req.body;
            const result = await taskRepository.upsert([{ id, title, description, completed }], { conflictPaths: ['id'] });
            res.status(201).json(result);
        } catch (error) {
            handleError(res, 500, 'Failed to update task');
        }
    });

    app.delete('/task/:id', async (req: Request, res: Response) => {
        try {
            const id: number = parseInt(req.params.id, 10);
            const deleteResult = await taskRepository.delete(id);
            if (deleteResult.affected) {
                res.status(204).send();
            } else {
                handleError(res, 404, 'Task not found');
            }
        } catch (error) {
            handleError(res, 500, 'Failed to delete task');
        }
    });

    app.patch('/task/:id', async (req: Request, res: Response) => {
        try {
            const id = parseInt(req.params.id, 10);
            const updates = req.body;
            const result = await taskRepository.update(id, updates);

            if (result.affected) {
                const updatedTask = await taskRepository.findOne({ where: { id } });
                return res.status(200).json(updatedTask);
            } else {
                return handleError(res, 404, 'Task not found');
            }
        } catch (error) {
            return handleError(res, 500, 'Failed to update task');
        }
    });

    // Handle file upload with multer
    app.post('/upload', upload.single('file'), (req: Request, res: Response) => {
        if (!req.file) {
            return res.status(400).send('No file uploaded');
        }

        const filePath = req.file.path;

        fileProcessor.emit('fileProcessed', { filePath });
        res.send('File uploaded and processing started.');
    });

    fileProcessor.on('fileProcessed', async ({ filePath }: { filePath: string }) => {
        try {
            if (!fs.existsSync(filePath)) {
                console.error('File does not exist:', filePath);
                return;
            }

            const data = fs.readFileSync(filePath, 'utf-8');
            const tasks = JSON.parse(data);

            tasks.forEach((task: any) => {
                task.id = parseInt(task.id, 10);
            });

            await taskRepository.save(tasks);

            console.log('Tasks successfully updated in the database.');

            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        } catch (err) {
            console.error('Error processing file:', err);
        }
    });

    app.use(errorHandler);

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });

}).catch(error => console.log('Database connection error:', error));
