import express from 'express';
import type { Server } from 'http';

/**
 * Local fixture ATS servers for Phase 4 testing.
 *
 * These mimic the public JSON APIs of Greenhouse, Lever, Ashby, and
 * SmartRecruiters so the scraping adapters can be tested without hitting
 * live external sites. Fixtures are NOT evidence of live provider support.
 *
 * Each fixture server listens on a dedicated port:
 *   Greenhouse: 9001  (GET /boards/:boardId/jobs)
 *   Lever:      9002  (GET /postings/:company?mode=json)
 *   Ashby:      9003  (POST /postings/job-board)
 *   SmartRecruiters: 9004 (GET /companies/:companyId/jobs, GET /jobs/:id)
 */

const GREENHOUSE_JOBS = {
  jobs: [
    {
      id: 1001,
      title: 'Senior Frontend Engineer',
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/1001',
      updated_at: '2026-01-15T10:00:00Z',
      location: { name: 'Toronto, ON, Canada' },
      content:
        'We are looking for a Senior Frontend Engineer to build React applications. Requirements: TypeScript, React, 5+ years experience.',
    },
    {
      id: 1002,
      title: 'Product Designer',
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/1002',
      updated_at: '2026-01-14T10:00:00Z',
      location: { name: 'Remote' },
      content: null,
    },
    {
      id: 1003,
      title: 'Backend Engineer',
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/1003',
      updated_at: '2026-01-13T10:00:00Z',
      location: { name: 'Vancouver, BC, Canada' },
      content:
        'Backend Engineer position. Design and implement REST APIs. Requirements: Node.js, PostgreSQL, system design.',
    },
  ],
};

const LEVER_POSTINGS = [
  {
    id: 'lever-001',
    text: 'Full Stack Developer',
    hostUrl: 'https://jobs.lever.co/acme/lever-001',
    createdAt: 1768435200000,
    categories: { location: 'Ottawa, ON, Canada', department: 'Engineering' },
    plainTextContent:
      'Full Stack Developer role. Build features with React and Node.js. Requirements: TypeScript, React, Node.js, 3+ years.',
  },
  {
    id: 'lever-002',
    text: 'Engineering Manager',
    hostUrl: 'https://jobs.lever.co/acme/lever-002',
    createdAt: 1768348800000,
    categories: { location: 'Toronto, ON, Canada' },
    plainTextContent: null,
  },
];

const ASHBY_POSTINGS = {
  jobPostings: [
    {
      id: 'ashby-001',
      title: 'DevOps Engineer',
      applicationUrl: 'https://jobs.ashbyhq.com/acme/ashby-001',
      jobLocation: 'Montreal, QC, Canada',
      jobAddressCity: 'Montreal',
      jobAddressRegion: 'QC',
      jobAddressCountry: 'Canada',
      content:
        'DevOps Engineer. Manage CI/CD pipelines and infrastructure. Requirements: AWS, Docker, Kubernetes, Terraform.',
      updatedAt: '2026-01-12T10:00:00Z',
    },
    {
      id: 'ashby-002',
      title: 'Security Engineer',
      applicationUrl: 'https://jobs.ashbyhq.com/acme/ashby-002',
      jobLocation: null,
      jobAddressCity: null,
      jobAddressRegion: null,
      jobAddressCountry: null,
      content: null,
      updatedAt: '2026-01-11T10:00:00Z',
    },
  ],
};

const SMARTRECRUITERS_JOBS = {
  content: [
    {
      id: 'sr-001',
      name: 'Data Scientist',
      company: { name: 'Acme Corp' },
      location: { city: 'Calgary', region: 'AB', countryCode: 'CA' },
      ref: 'https://www.smartrecruiters.com/Acme/sr-001',
      jobAd: {
        sections: {
          jobDescription: {
            text:
              'Data Scientist. Build ML models and analyze data. Requirements: Python, SQL, machine learning, statistics.',
          },
        },
      },
      updatedAt: '2026-01-10T10:00:00Z',
    },
    {
      id: 'sr-002',
      name: 'QA Engineer',
      company: { name: 'Acme Corp' },
      location: { city: 'Edmonton', region: 'AB', countryCode: 'CA' },
      ref: 'https://www.smartrecruiters.com/Acme/sr-002',
      jobAd: {
        sections: {
          jobDescription: null,
        },
      },
      updatedAt: '2026-01-09T10:00:00Z',
    },
  ],
};

function startGreenhouse(port: number): Server {
  const app = express();
  app.get('/boards/:boardId/jobs', (_req, res) => {
    res.json(GREENHOUSE_JOBS);
  });
  return app.listen(port, '127.0.0.1');
}

function startLever(port: number): Server {
  const app = express();
  app.get('/postings/:company', (_req, res) => {
    res.set('Content-Type', 'application/json');
    res.send(LEVER_POSTINGS);
  });
  return app.listen(port, '127.0.0.1');
}

function startAshby(port: number): Server {
  const app = express();
  app.use(express.json());
  app.post('/postings/job-board', (_req, res) => {
    res.json(ASHBY_POSTINGS);
  });
  return app.listen(port, '127.0.0.1');
}

function startSmartRecruiters(port: number): Server {
  const app = express();
  app.get('/companies/:companyId/jobs', (_req, res) => {
    res.json(SMARTRECRUITERS_JOBS);
  });
  app.get('/jobs/:jobId', (req, res) => {
    const job = SMARTRECRUITERS_JOBS.content.find((j) => j.id === req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(job);
  });
  return app.listen(port, '127.0.0.1');
}

export function startFixtureServers(): { port: number; server: Server }[] {
  const servers: { port: number; server: Server }[] = [
    { port: 9001, server: startGreenhouse(9001) },
    { port: 9002, server: startLever(9002) },
    { port: 9003, server: startAshby(9003) },
    { port: 9004, server: startSmartRecruiters(9004) },
  ];
  return servers;
}

export function stopFixtureServers(
  servers: { port: number; server: Server }[],
): void {
  for (const { server } of servers) {
    server.close();
  }
}
