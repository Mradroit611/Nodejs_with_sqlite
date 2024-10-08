import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

// Define paths for log files
const logsDir = path.join(__dirname, 'logs');
const errorLogFilePath = path.join(logsDir, 'errors.log');

// Ensure the logs directory exists
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create a write stream for the error log file
const errorLogStream = fs.createWriteStream(errorLogFilePath, { flags: 'a' });

// Error-handling middleware
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    // Log stack trace to console
    console.error(err.stack);

    // Prepare the log message
    const logMessage = `${new Date().toISOString()} - ${req.method} ${req.originalUrl}\n` +
                       `Status: ${err.status || 500}\n` +
                       `Message: ${err.message}\n` +
                       `Stack: ${err.stack}\n\n`;

    // Write the error message to the errors.log file
    errorLogStream.write(logMessage);

    // Send an error response to the client
    res.status(err.status || 500).json({ error: 'An unexpected error occurred' });
};
