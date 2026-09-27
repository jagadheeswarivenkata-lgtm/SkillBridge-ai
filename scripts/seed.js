const bcrypt = require('bcryptjs');
const { docClient, PutCommand, ScanCommand } = require('../config/dynamodb');
const { v4: uuidv4 } = require('uuid');

async function seedDatabase() {
  const tables = ['Students', 'Roles', 'JobRoles', 'JobRequirements', 'Skills', 'StudentSkills', 'Evidence', 'Assessments', 'LearningPaths', 'FacultyReviews', 'Notifications'];

  for (const tableName of tables) {
    try {
      await docClient.send(new ScanCommand({ TableName: tableName }));
    } catch (error) {
      // The fallback storage handles missing tables by creating them lazily.
    }
  }

  const skillsCatalog = [
    { skillId: 'python', name: 'Python', category: 'Programming' },
    { skillId: 'javascript', name: 'JavaScript', category: 'Web' },
    { skillId: 'sql', name: 'SQL', category: 'Database' },
    { skillId: 'react', name: 'React', category: 'Web' },
    { skillId: 'nodejs', name: 'Node.js', category: 'Web' },
    { skillId: 'aws', name: 'AWS', category: 'Cloud' },
    { skillId: 'docker', name: 'Docker', category: 'Cloud' },
    { skillId: 'machine-learning', name: 'Machine Learning', category: 'AI/ML' },
    { skillId: 'deep-learning', name: 'Deep Learning', category: 'AI/ML' },
    { skillId: 'pytorch', name: 'PyTorch', category: 'AI/ML' },
    { skillId: 'llm', name: 'LLM & Prompt Engineering', category: 'AI/ML' },
    { skillId: 'rag', name: 'RAG Architecture', category: 'AI/ML' }
  ];

  for (const skill of skillsCatalog) {
    await docClient.send(new PutCommand({ TableName: 'Skills', Item: skill }));
  }

  const facultyId = 'faculty-1';
  const faculty = {
    studentId: facultyId,
    fullName: 'Dr. Meera Nair',
    email: 'faculty@skillbridge.ai',
    passwordHash: await bcrypt.hash('Faculty123!', 10),
    role: 'faculty',
    branch: 'AI & Data Science',
    college: 'SkillBridge Academy',
    graduationYear: 2017,
    createdAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: 'Students', Item: faculty }));

  const studentId = 'student-demo';
  const student = {
    studentId,
    fullName: 'Aisha Sharma',
    email: 'aisha@student.skillbridge.ai',
    passwordHash: await bcrypt.hash('Password123!', 10),
    branch: 'CSE',
    college: 'IIIT Hyderabad',
    graduationYear: 2027,
    targetRole: 'AI Engineer',
    role: 'student',
    profileCompletion: 88,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: 'Students', Item: student }));

  const studentSkills = [
    { studentId, skillId: 'python', name: 'Python', level: 4, confidence: 0.88, category: 'Programming', source: 'Project evidence' },
    { studentId, skillId: 'javascript', name: 'JavaScript', level: 3, confidence: 0.76, category: 'Web', source: 'Assessment' },
    { studentId, skillId: 'sql', name: 'SQL', level: 2, confidence: 0.67, category: 'Database', source: 'Assignment' },
    { studentId, skillId: 'machine-learning', name: 'Machine Learning', level: 2, confidence: 0.65, category: 'AI/ML', source: 'Project evidence' },
    { studentId, skillId: 'deep-learning', name: 'Deep Learning', level: 1, confidence: 0.44, category: 'AI/ML', source: 'AI analysis' },
    { studentId, skillId: 'docker', name: 'Docker', level: 1, confidence: 0.49, category: 'Cloud', source: 'Demonstration' }
  ];
  for (const entry of studentSkills) {
    await docClient.send(new PutCommand({ TableName: 'StudentSkills', Item: entry }));
  }

  const roles = [
    {
      roleId: 'ai-engineer',
      title: 'AI Engineer',
      description: 'Build AI-powered systems, integrate LLM workflows, and deploy production-grade services.',
      requirements: [
        { name: 'Python', requiredLevel: 4, confidence: 0.9 },
        { name: 'Machine Learning', requiredLevel: 3, confidence: 0.9 },
        { name: 'Deep Learning', requiredLevel: 3, confidence: 0.82 },
        { name: 'PyTorch', requiredLevel: 3, confidence: 0.8 },
        { name: 'LLM & Prompt Engineering', requiredLevel: 3, confidence: 0.84 },
        { name: 'RAG Architecture', requiredLevel: 3, confidence: 0.82 },
        { name: 'Docker', requiredLevel: 2, confidence: 0.7 }
      ]
    },
    {
      roleId: 'full-stack-developer',
      title: 'Full Stack Developer',
      description: 'Build full-featured web apps with front-end and back-end engineering skills.',
      requirements: [
        { name: 'JavaScript', requiredLevel: 4 },
        { name: 'React', requiredLevel: 3 },
        { name: 'Node.js', requiredLevel: 3 },
        { name: 'SQL', requiredLevel: 3 },
        { name: 'Docker', requiredLevel: 2 }
      ]
    }
  ];

  for (const role of roles) {
    await docClient.send(new PutCommand({ TableName: 'JobRoles', Item: role }));
  }

  const notifications = [
    {
      studentId,
      notificationId: uuidv4(),
      type: 'skill-gap',
      message: 'New skill gap detected in RAG and Deep Learning.',
      isRead: false,
      createdAt: new Date().toISOString()
    },
    {
      studentId,
      notificationId: uuidv4(),
      type: 'assessment',
      message: 'Your weekly AI Engineer assessment is ready.',
      isRead: false,
      createdAt: new Date().toISOString()
    }
  ];
  for (const note of notifications) {
    await docClient.send(new PutCommand({ TableName: 'Notifications', Item: note }));
  }

  const evidence = {
    studentId,
    evidenceId: 'evidence-demo',
    title: 'AI Study Companion',
    description: 'Built a RAG-powered educational chat app using Python, FastAPI, and a vector database.',
    category: 'Project',
    projectUrl: 'https://github.com/example/skillbridge-ai-student',
    skillCategory: 'AI/ML',
    difficultyLevel: 'Intermediate',
    status: 'Verified',
    aiAnalysis: {
      skills: [
        { name: 'Python', level: 'Intermediate', confidence: 0.8 },
        { name: 'Machine Learning', level: 'Basic', confidence: 0.67 },
        { name: 'RAG', level: 'Basic', confidence: 0.6 }
      ],
      recommendations: ['Add evaluation metrics', 'Package as a deployable API', 'Add a feedback loop']
    },
    createdAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: 'Evidence', Item: evidence }));

  const assessment = {
    studentId,
    assessmentId: 'assessment-demo',
    title: 'Week 1 Assessment',
    weekNumber: 1,
    skillsTested: ['Python', 'Machine Learning'],
    questions: [
      { id: 'q1', type: 'mcq', question: 'Which metric is usually used for classification problems?', options: ['Accuracy', 'Bandwidth', 'Latency', 'RAM'], answer: 'Accuracy' }
    ],
    score: 82,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: 'Assessments', Item: assessment }));

  const path = {
    studentId,
    pathId: 'path-demo',
    title: 'AI Engineer Learning Path',
    targetRole: 'AI Engineer',
    phases: [
      { phase: 'PHASE 1', title: 'Python & Data Skills', duration: '7 days', tasks: [{ title: 'Python functions', completed: true }, { title: 'SQL fundamentals', completed: true }], completed: true },
      { phase: 'PHASE 2', title: 'Machine Learning', duration: '10 days', tasks: [{ title: 'Feature engineering', completed: false }, { title: 'Model evaluation', completed: false }], completed: false },
      { phase: 'PHASE 3', title: 'Deep Learning & RAG', duration: '14 days', tasks: [{ title: 'PyTorch basics', completed: false }, { title: 'RAG pipeline', completed: false }], completed: false }
    ],
    createdAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: 'LearningPaths', Item: path }));

  console.log('SkillBridge seed data initialized successfully.');
}

if (require.main === module) {
  seedDatabase().catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });
}

module.exports = { seedDatabase };
