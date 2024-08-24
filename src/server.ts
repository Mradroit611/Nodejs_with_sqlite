import express, { Request, Response, NextFunction } from 'express';
import { createConnection, Repository } from 'typeorm';
import { Task } from './entity/Task';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { EventEmitter } from 'events';
import morgan from 'morgan';
import { format } from 'date-fns';
import { errorHandler } from './middleware'; // Import the errorHandler

const upload = multer({
    dest: path.join(__dirname, 'uploads'), // Temporary storage directory
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10 MB
});

class FileProcessor extends EventEmitter {}

export const fileProcessor = new FileProcessor();

const app = express();
const port = 3000;

// Configure Morgan to log requests to a file
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const requestLogFilePath = path.join(logsDir, 'requests.log');
const requestLogStream = fs.createWriteStream(requestLogFilePath, { flags: 'a' });

// Define a custom token for readable formatted time
morgan.token('readable-date', () => {
    return format(new Date(), 'yyyy-MM-dd HH:mm:ss'); // Format date as "YYYY-MM-DD HH:MM:SS"
});

const customMorganFormat = 
    ':readable-date - [URL: :url, Method: :method, HTTP Version: HTTP/:http-version, Status: :status, Response Length: :res[content-length] bytes, Response Time: :response-time ms, Remote Address: :remote-addr, Referrer: ":referrer", User Agent: ":user-agent"]';



// app.use(morgan('combined', { stream: requestLogStream })); // Use 'combined' format for detailed logs
app.use(morgan(customMorganFormat, { stream: requestLogStream }));


app.use(express.json());

// Create the uploads directory if it does not exist
const createDirectoryIfNotExists = (dir: string) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
};
createDirectoryIfNotExists(path.join(__dirname, 'uploads'));

// Connect to the database
createConnection().then(connection => {
    const taskRepository: Repository<Task> = connection.getRepository(Task);

    // Custom error handler for specific routes
    const handleError = (res: Response, statusCode: number, message: string) => {
        res.status(statusCode).json({ error: message });
    };

    app.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tasks = await taskRepository.find();
            res.json(tasks);
        } catch (error) {
            next(error); // Pass the error to the error-handling middleware
        }
    });

    app.get('/task/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const taskId: number = parseInt(req.params.id, 10);
            const task = await taskRepository.findOneBy({ id: taskId });
            if (task) {
                res.json(task);
            } else {
                handleError(res, 404, 'Task not found');
            }
        } catch (error) {
            next(error); // Pass the error to the error-handling middleware
        }
    });


    app.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const task = taskRepository.create(req.body);
            const result = await taskRepository.save(task);
            res.status(201).json(result);
        } catch (error) {
            next(error); // Pass the error to the error-handling middleware
        }
    });

    app.put('/task/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id: number = parseInt(req.params.id, 10);
            const { title, description, completed } = req.body;
            
            // Check if the task with the provided ID exists
            const existingTask = await taskRepository.findOneBy({ id });
            if (!existingTask) {
                return handleError(res, 404, 'Task not found');
            }

            // Update task without using ID as a default value
            await taskRepository.update(id, { title, description, completed });
            const updatedTask = await taskRepository.findOneBy({ id });

            res.status(200).json(updatedTask);
        } catch (error) {
            next(error); // Pass the error to the error-handling middleware
        }
    });

    app.delete('/task/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id: number = parseInt(req.params.id, 10);
            const deleteResult = await taskRepository.delete(id);
            if (deleteResult.affected) {
                res.status(204).send();
            } else {
                handleError(res, 404, 'Task not found');
            }
        } catch (error) {
            next(error); // Pass the error to the error-handling middleware
        }
    });

    app.patch('/task/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = parseInt(req.params.id, 10);
            const updates = req.body;
            const result = await taskRepository.update(id, updates);

            if (result.affected) {
                const updatedTask = await taskRepository.findOneBy({ id });
                return res.status(200).json(updatedTask);
            } else {
                return handleError(res, 404, 'Task not found');
            }
        } catch (error) {
            next(error); // Pass the error to the error-handling middleware
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

    // Use the error-handling middleware after all routes
    app.use(errorHandler);

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });

}).catch(error => console.log('Database connection error:', error));
