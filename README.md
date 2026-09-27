# SkillBridge AI

SkillBridge AI is an evidence-based career skill intelligence platform that helps students connect their demonstrated skills to target job roles, identify gaps, and improve through personalized learning, project recommendations, and faculty reviews.

## Overview

The platform is designed for students and faculty in an academic technology environment. Students can register, choose a target role, submit evidence, view skill gap insights, follow learning plans, and receive weekly assessments. Faculty can review evidence and validate skill levels separately from AI-generated analysis.

## Architecture

- Frontend: HTML, CSS, Vanilla JavaScript, Chart.js
- Backend: Node.js + Express.js
- AI service: OpenRouter API
- Datastore: AWS DynamoDB with local fallback support
- File storage: Amazon S3 with local upload fallback
- Authentication: Custom email/password auth using bcrypt + JWT

## Features

- Student authentication and profile management
- Target role analysis using job description input
- Evidence submission with file uploads
- AI-assisted skill extraction and recommendation
- Skill gap engine and dashboard metrics
- Personalized learning path timeline
- Project recommendation engine
- Weekly assessments and scoring
- Skill graph and readiness visualizations
- Faculty review workflow and separate verified skill evaluation
- Notification panel

## Technologies

- Node.js
- Express.js
- bcryptjs
- JWT
- AWS SDK v3
- Chart.js
- Multer
- Helmet
- CORS
- Express-rate-limit
- dotenv

## Installation

1. Open a terminal in the project root.
2. Run:

```bash
npm install
```

3. Copy `.env.example` to `.env` and update the values.

## Environment Variables

```bash
PORT=5000
JWT_SECRET=replace_me
OPENROUTER_API_KEY=replace_me
OPENROUTER_MODEL=google/gemini-2.5-flash
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=replace_me
AWS_SECRET_ACCESS_KEY=replace_me
S3_BUCKET_NAME=skillbridge-evidence
USE_LOCAL_FALLBACK=true
```

## OpenRouter Setup

1. Sign up at OpenRouter.
2. Create an API key.
3. Add it to the `OPENROUTER_API_KEY` environment variable.
4. Optionally update the model in `OPENROUTER_MODEL`.

## AWS Setup

- Create an AWS account if needed.
- Create an IAM user with DynamoDB and S3 access.
- Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` to `.env`.
- Ensure the S3 bucket exists and is configured for uploads.

## DynamoDB Tables

The project uses the following logical tables:

- Students
- Skills
- StudentSkills
- JobRoles
- JobRequirements
- Evidence
- Assessments
- LearningPaths
- FacultyReviews
- Notifications

The project includes a local file-backed fallback so it can run without AWS access.

## S3 Setup

- Create a bucket such as `skillbridge-evidence`.
- Ensure your AWS credentials allow `s3:PutObject`.
- Files are saved under:

```text
students/{studentId}/evidence/{evidenceId}/
```

## Running Locally

```bash
npm start
```

Then open:

- http://localhost:5000/
- http://localhost:5000/login
- http://localhost:5000/register

## Deployment

For production, deploy the Express application to a Node-compatible host such as Render, Railway, or EC2. Set the environment variables securely and configure a reverse proxy if needed.

## API Documentation

### Authentication

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me

### Profile

- GET /api/profile
- PUT /api/profile

### Roles

- GET /api/roles
- POST /api/roles/analyze

### Evidence

- POST /api/evidence
- GET /api/evidence
- GET /api/evidence/:id
- POST /api/evidence/:id/analyze

### Skills

- GET /api/skills
- GET /api/skills/student

### Skill Gap

- GET /api/skill-gap

### Learning Path

- GET /api/learning-path
- POST /api/learning-path/generate
- PUT /api/learning-path/task

### Projects

- GET /api/projects
- POST /api/projects/recommend

### Assessments

- GET /api/assessment/current
- POST /api/assessment/generate
- POST /api/assessment/submit
- GET /api/assessment/history

### Faculty

- GET /api/faculty/students
- GET /api/faculty/student/:studentId
- POST /api/faculty/evidence/:evidenceId/review

### Notifications

- GET /api/notifications
- PUT /api/notifications/:id/read
