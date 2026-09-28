const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/api');
const { seedDatabase } = require('./scripts/seed');

dotenv.config();

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 5000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  message: { success: false, message: 'Too many requests, please slow down.' }
});
app.use(limiter);

app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong on the server. Please try again later.'
  });
});

if (process.env.VERCEL) {
  seedDatabase().catch((error) => {
    console.error('Vercel startup seed failed:', error);
  });
}

async function startServer() {
  if (process.env.VERCEL) {
    console.log('Vercel runtime detected; skipping direct port bind for serverless deployment.');
    return;
  }

  try {
    await seedDatabase();
    const listenOn = (port) => {
      app.listen(port, () => {
        console.log(`SkillBridge AI running on http://localhost:${port}`);
      }).on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port === DEFAULT_PORT) {
          console.warn(`Port ${port} is busy. Retrying on ${port + 1}.`);
          listenOn(port + 1);
          return;
        }
        console.error('Failed to start server:', err.message);
        process.exit(1);
      });
    };

    listenOn(DEFAULT_PORT);
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
