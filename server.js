import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(helmet());
app.use(compression());

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(morgan('combined'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const OS = [
    "Executive",
    "Revenue",
    "CRM",
    "Marketing",
    "Operations",
    "Finance",
    "HR",
    "Projects",
    "Knowledge",
    "Compliance",
    "Supply",
    "Acquisition"
];

let STATUS = {};

OS.forEach((o, i) => {
    STATUS[i + 1] = {
        id: i + 1,
        name: o,
        status: 'active',
        events: 0,
        projects: []
    };
});

/* DASHBOARD */

app.get('/api/dashboard', async (req, res) => {

    let permits = 0;
    let revenue = 0;
    let tenants = [];

    try {

        const { count } = await supabase
            .from('permits')
            .select('*', {
                count: 'exact',
                head: true
            });

        permits = count || 0;

        const { data: rev } = await supabase
            .from('revenue_log')
            .select('amount');

        revenue = (rev || []).reduce(
            (a, b) => a + Number(b.amount || 0),
            0
        );

        const { data: t } = await supabase
            .from('tenants')
            .select('*');

        tenants = t || [];

    } catch (e) {
        console.log(e.message);
    }

    res.json({
        success: true,
        metrics: {
            permits,
            revenue,
            activeOS: Object.keys(STATUS).length
        },
        os: Object.values(STATUS),
        tenants
    });

});

/* TOGGLE OS */

app.post('/api/os/:id', (req, res) => {

    const id = Number(req.params.id);

    STATUS[id].status =
        STATUS[id].status === 'active'
            ? 'inactive'
            : 'active';

    STATUS[id].events++;

    res.json(STATUS[id]);

});

/* FORCE SCAN */

app.post('/api/scan', async (req, res) => {

    STATUS[12].events++;

    res.json({
        success: true,
        permits: Math.floor(Math.random() * 50)
    });

});

/* TENANTS */

app.get('/api/tenants', async (req, res) => {

    const { data } = await supabase
        .from('tenants')
        .select('*');

    res.json(data || []);

});

/* AFFILIATES */

app.get('/api/affiliates', (req, res) => {

    res.json([
        {
            product: 'Stripe',
            clicks: 245,
            conversions: 11,
            revenue: 330
        },
        {
            product: 'AWS',
            clicks: 120,
            conversions: 4,
            revenue: 700
        }
    ]);

});

/* GOOGLE INDEX */

app.post('/api/google/index', (req, res) => {

    console.log('Index Triggered');

    res.json({
        success: true
    });

});

/* SOCIAL PUBLISH */

app.post('/api/social/publish', (req, res) => {

    console.log('Publishing globally');

    res.json({
        success: true
    });

});

/* CRON */

cron.schedule('*/30 * * * *', () => {
    console.log('Background tasks running');
});

app.use(express.static(
    path.join(__dirname, 'public')
));

app.get('*', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'dashboard.html'
        )
    );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`GRIDV21 running on ${PORT}`);
});
