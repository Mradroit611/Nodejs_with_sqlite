import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const logFilePath = path.join(logsDir, 'requests.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const logMessage = `Time: ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`;
  logStream.write(logMessage);
  next();
};

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  const logMessage = `${new Date().toISOString()} - ERROR: ${err.message}\n${err.stack}\n`;
  logStream.write(logMessage);
  res.status(500).json({ error: 'An unexpected error occurred' });
};
