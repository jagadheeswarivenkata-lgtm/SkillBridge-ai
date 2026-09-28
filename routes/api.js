const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { docClient, PutCommand, ScanCommand, GetCommand, QueryCommand } = require('../config/dynamodb');
const { uploadEvidenceFile } = require('../config/s3');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const { analyzeJobDescription, analyzeEvidence, generateSkillGap, generateLearningPath, recommendProjects, generateAssessment, evaluateAssessment } = require('../services/openrouterService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const JWT_SECRET = process.env.JWT_SECRET || 'skillbridge_super_secret_jwt_key_2026_dev_secure';
const DEFAULT_STUDENT = {
  fullName: 'Aisha Sharma',
  email: 'aisha@student.skillbridge.ai',
  password: 'Password123!',
  branch: 'CSE',
  college: 'IIIT Hyderabad',
  graduationYear: 2027,
  targetRole: 'AI Engineer'
};

function signToken(user) {
  return jwt.sign({ id: user.studentId || user.userId || user.id, email: user.email, role: user.role || 'student' }, JWT_SECRET, { expiresIn: '7d' });
}

async function scanTable(tableName) {
  const result = await docClient.send(new ScanCommand({ TableName: tableName }));
  return result.Items || [];
}

async function getStudentByEmail(email) {
  const items = await scanTable('Students');
  return items.find((student) => student.email && student.email.toLowerCase() === String(email).toLowerCase()) || null;
}

async function getStudentById(studentId) {
  const items = await scanTable('Students');
  return items.find((student) => student.studentId === studentId) || null;
}

async function listStudentSkills(studentId) {
  const items = await scanTable('StudentSkills');
  return items.filter((skill) => skill.studentId === studentId);
}

async function saveStudentSkill(studentId, skill) {
  const item = { studentId, skillId: skill.skillId || skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ...skill };
  await docClient.send(new PutCommand({ TableName: 'StudentSkills', Item: item }));
  return item;
}

async function addNotification(studentId, type, message, extra = {}) {
  const notification = {
    studentId,
    notificationId: uuidv4(),
    type,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
    ...extra
  };
  await docClient.send(new PutCommand({ TableName: 'Notifications', Item: notification }));
  return notification;
}

function buildSkillGap(studentSkills, roleRequirements) {
  const currentMap = new Map();
  (studentSkills || []).forEach((skill) => {
    currentMap.set(String(skill.name || skill.skillId || skill.skillName || '').toLowerCase(), Number(skill.level || 0));
  });

  const strong = [];
  const developing = [];
  const missing = [];

  roleRequirements.forEach((req) => {
    const name = req.name || req.skillName || req.skill;
    const requiredLevel = Number(req.requiredLevel || req.level || 0);
    const currentLevel = currentMap.get(String(name).toLowerCase()) || 0;
    const gap = Math.max(requiredLevel - currentLevel, 0);
    const evidence = req.evidence || 'Verified by project or assessment evidence';
    const confidence = req.confidence || 0.78;

    if (currentLevel >= requiredLevel) {
      strong.push({ skill: name, currentLevel, requiredLevel, gap, evidence, confidence });
    } else if (currentLevel > 0) {
      developing.push({ skill: name, currentLevel, requiredLevel, gap, evidence, confidence });
    } else {
      missing.push({ skill: name, currentLevel, requiredLevel, gap, evidence, confidence });
    }
  });

  return { strong, developing, missing };
}

function normalizeSkillName(value) {
  return String(value || '').replace(/_/g, ' ');
}

function mapSkillLevel(level) {
  const map = { 0: 'No Evidence', 1: 'Beginner', 2: 'Basic', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };
  return map[Number(level) || 0] || 'No Evidence';
}

function calculateProfileCompletion(student) {
  const fields = [student.fullName, student.email, student.branch, student.college, student.graduationYear, student.targetRole];
  const complete = fields.filter(Boolean).length;
  return Math.round((complete / fields.length) * 100);
}

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'SkillBridge AI API is running.' });
});

router.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword, branch, college, graduationYear } = req.body || {};
    if (!fullName || !email || !password || !confirmPassword || !branch || !college || !graduationYear) {
      return res.status(400).json({ success: false, message: 'Please complete all registration fields.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const existingUser = await getStudentByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account already exists with this email.' });
    }

    const studentId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    const student = {
      studentId,
      fullName,
      email: email.toLowerCase(),
      passwordHash,
      branch,
      college,
      graduationYear:Number(graduationYear),
      targetRole: 'AI Engineer',
      role: 'student',
      profileCompletion: 85,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({ TableName: 'Students', Item: student }));

    const token = signToken(student);
    await addNotification(studentId, 'skill-dashboard', 'Welcome to SkillBridge AI! Your profile is ready for skill analysis.', { metadata: { page: 'dashboard' } });

    return res.status(201).json({
      success: true,
      token,
      user: {
        studentId: student.studentId,
        fullName: student.fullName,
        email: student.email,
        role: student.role,
        targetRole: student.targetRole,
        branch: student.branch,
        college: student.college,
        graduationYear: student.graduationYear
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Unable to register at the moment.' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const student = await getStudentByEmail(email);
    if (!student) {
      return res.status(401).json({ success: false, message: 'No account found with that email.' });
    }

    const isValidPassword = await bcrypt.compare(password, student.passwordHash || '');
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
    }

    const token = signToken(student);
    res.json({ success: true, token, user: { studentId: student.studentId, fullName: student.fullName, email: student.email, role: student.role || 'student', targetRole: student.targetRole || 'AI Engineer' } });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Unable to log in right now.' });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  const user = await getStudentById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  return res.json({
    success: true,
    user: {
      studentId: user.studentId,
      fullName: user.fullName,
      email: user.email,
      branch: user.branch,
      college: user.college,
      graduationYear: user.graduationYear,
      targetRole: user.targetRole || 'AI Engineer',
      role: user.role || 'student',
      profileCompletion: calculateProfileCompletion(user)
    }
  });
});

router.get('/profile', authMiddleware, async (req, res) => {
  const user = await getStudentById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'Student not found.' });
  res.json({ success: true, user: { ...user, profileCompletion: calculateProfileCompletion(user) } });
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const currentUser = await getStudentById(req.user.id);
    if (!currentUser) return res.status(404).json({ success: false, message: 'Student not found.' });

    const updates = req.body || {};
    const updatedUser = {
      ...currentUser,
      ...updates,
      email: (updates.email || currentUser.email || '').toLowerCase(),
      graduationYear: updates.graduationYear ? Number(updates.graduationYear) : currentUser.graduationYear,
      profileCompletion: calculateProfileCompletion({ ...currentUser, ...updates }),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({ TableName: 'Students', Item: updatedUser }));
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Unable to update profile.' });
  }
});

router.get('/roles', async (req, res) => {
  const roles = await scanTable('JobRoles');
  res.json({ success: true, roles });
});

router.post('/roles/analyze', authMiddleware, async (req, res) => {
  try {
    const { roleTitle, customRole, jobDescription } = req.body || {};
    const title = customRole || roleTitle || 'AI Engineer';
    const description = jobDescription || `Target role: ${title}`;
    const analysis = await analyzeJobDescription(title, description);
    const roleId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const roleEntry = {
      roleId,
      title,
      description,
      requirements: analysis.technicalSkills || analysis.requirements || [],
      experienceExpectations: analysis.experienceExpectations || [],
      tools: analysis.tools || [],
      softSkills: analysis.softSkills || [],
      createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({ TableName: 'JobRoles', Item: roleEntry }));

    const user = await getStudentById(req.user.id);
    if (user) {
      const updatedUser = { ...user, targetRole: title, updatedAt: new Date().toISOString() };
      await docClient.send(new PutCommand({ TableName: 'Students', Item: updatedUser }));
      await addNotification(req.user.id, 'skill-gap', `Target role set to ${title}. Skill gap analysis is ready.`, { metadata: { role: title } });
    }

    res.json({ success: true, role: roleEntry, analysis });
  } catch (error) {
    console.error('Analyze role error:', error);
    res.status(500).json({ success: false, message: 'Unable to analyze the target role right now.' });
  }
});

router.post('/evidence', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { title, description, category, projectUrl, difficultyLevel, skillCategory, date } = req.body || {};
    if (!title || !description || !category) {
      return res.status(400).json({ success: false, message: 'Evidence title, description, and type are required.' });
    }

    const evidenceId = uuidv4();
    const uploadedFile = req.file;
    const fileMeta = uploadedFile ? await uploadEvidenceFile(req.user.id, evidenceId, uploadedFile) : null;

    const evidence = {
      studentId: req.user.id,
      evidenceId,
      title,
      description,
      category,
      skillCategory: skillCategory || category,
      projectUrl: projectUrl || '',
      fileUrl: fileMeta ? fileMeta.url : '',
      fileName: fileMeta ? fileMeta.fileName : '',
      difficultyLevel: difficultyLevel || 'Intermediate',
      date: date || new Date().toISOString(),
      status: 'Pending Review',
      aiAnalysis: null,
      facultyReview: null,
      createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({ TableName: 'Evidence', Item: evidence }));
    const analysis = await analyzeEvidence(title, description, category, projectUrl);
    evidence.aiAnalysis = analysis;
    await docClient.send(new PutCommand({ TableName: 'Evidence', Item: evidence }));

    await addNotification(req.user.id, 'evidence-submitted', `Evidence submitted: ${title}. AI analysis has been added for review.`, { metadata: { evidenceId } });

    res.status(201).json({ success: true, evidence, analysis });
  } catch (error) {
    console.error('Submit evidence error:', error);
    res.status(500).json({ success: false, message: 'Unable to submit evidence right now.' });
  }
});

router.get('/evidence', authMiddleware, async (req, res) => {
  const items = await scanTable('Evidence');
  const studentEvidence = items.filter((item) => item.studentId === req.user.id);
  res.json({ success: true, evidence: studentEvidence });
});

router.get('/evidence/:id', authMiddleware, async (req, res) => {
  const items = await scanTable('Evidence');
  const found = items.find((item) => item.evidenceId === req.params.id && item.studentId === req.user.id);
  if (!found) return res.status(404).json({ success: false, message: 'Evidence not found.' });
  res.json({ success: true, evidence: found });
});

router.post('/evidence/:id/analyze', authMiddleware, async (req, res) => {
  const items = await scanTable('Evidence');
  const found = items.find((item) => item.evidenceId === req.params.id && item.studentId === req.user.id);
  if (!found) return res.status(404).json({ success: false, message: 'Evidence not found.' });

  const analysis = await analyzeEvidence(found.title, found.description, found.category, found.projectUrl);
  found.aiAnalysis = analysis;
  await docClient.send(new PutCommand({ TableName: 'Evidence', Item: found }));
  res.json({ success: true, analysis });
});

router.get('/skills', async (req, res) => {
  const items = await scanTable('Skills');
  res.json({ success: true, skills: items.length ? items : [
    { skillId: 'python', name: 'Python', category: 'Programming' },
    { skillId: 'javascript', name: 'JavaScript', category: 'Web' },
    { skillId: 'sql', name: 'SQL', category: 'Database' },
    { skillId: 'react', name: 'React', category: 'Web' },
    { skillId: 'nodejs', name: 'Node.js', category: 'Web' },
    { skillId: 'aws', name: 'AWS', category: 'Cloud' },
    { skillId: 'docker', name: 'Docker', category: 'Cloud' },
    { skillId: 'machine-learning', name: 'Machine Learning', category: 'AI/ML' },
    { skillId: 'rag', name: 'RAG', category: 'AI/ML' }
  ] });
});

router.get('/skills/student', authMiddleware, async (req, res) => {
  const skills = await listStudentSkills(req.user.id);
  res.json({ success: true, skills: skills.length ? skills : [
    { studentId: req.user.id, skillId: 'python', name: 'Python', level: 4, category: 'Programming', confidence: 0.88 },
    { studentId: req.user.id, skillId: 'javascript', name: 'JavaScript', level: 3, category: 'Web', confidence: 0.72 },
    { studentId: req.user.id, skillId: 'sql', name: 'SQL', level: 2, category: 'Database', confidence: 0.66 },
    { studentId: req.user.id, skillId: 'ml', name: 'Machine Learning', level: 2, category: 'AI/ML', confidence: 0.61 }
  ] });
});

router.get('/skill-gap', authMiddleware, async (req, res) => {
  const studentSkills = await listStudentSkills(req.user.id);
  const user = await getStudentById(req.user.id);
  const targetRole = user?.targetRole || 'AI Engineer';
  const roles = await scanTable('JobRoles');
  const role = roles.find((entry) => entry.title === targetRole) || { title: targetRole, requirements: [
    { name: 'Python', requiredLevel: 4 },
    { name: 'Machine Learning', requiredLevel: 3 },
    { name: 'Deep Learning', requiredLevel: 3 },
    { name: 'PyTorch', requiredLevel: 3 },
    { name: 'LLM & Prompt Engineering', requiredLevel: 2 },
    { name: 'RAG Architecture', requiredLevel: 2 },
    { name: 'Docker', requiredLevel: 2 }
  ] };

  const gap = buildSkillGap(studentSkills, role.requirements || []);
  res.json({ success: true, role: targetRole, gap, studentSkills });
});

router.get('/learning-path', authMiddleware, async (req, res) => {
  const items = await scanTable('LearningPaths');
  const current = items.find((path) => path.studentId === req.user.id) || null;
  if (current) return res.json({ success: true, learningPath: current });

  const user = await getStudentById(req.user.id);
  const targetRole = user?.targetRole || 'AI Engineer';
  const skillGap = await generateSkillGap(await listStudentSkills(req.user.id), [
    { name: 'Python', requiredLevel: 4 },
    { name: 'Machine Learning', requiredLevel: 3 },
    { name: 'Deep Learning', requiredLevel: 3 },
    { name: 'PyTorch', requiredLevel: 3 },
    { name: 'LLM & Prompt Engineering', requiredLevel: 2 },
    { name: 'RAG Architecture', requiredLevel: 2 },
    { name: 'Docker', requiredLevel: 2 }
  ]);

  const learningPath = await generateLearningPath(await listStudentSkills(req.user.id), targetRole, skillGap.missing || skillGap.developing || []);
  const pathEntry = {
    studentId: req.user.id,
    pathId: uuidv4(),
    title: `${targetRole} Learning Path`,
    targetRole,
    phases: learningPath.phases || [
      { phase: 'PHASE 1', title: 'JavaScript & Python Foundations', duration: '7 days', tasks: ['ES6 concepts', 'Async programming', 'Functions & Data structures'], completed: false },
      { phase: 'PHASE 2', title: 'Machine Learning Fundamentals', duration: '10 days', tasks: ['Math for ML', 'Scikit-learn', 'Model evaluation'], completed: false },
      { phase: 'PHASE 3', title: 'Deep Learning & LLMs', duration: '10 days', tasks: ['PyTorch', 'RAG', 'Prompt design'], completed: false },
      { phase: 'PHASE 4', title: 'Cloud & Deployment', duration: '7 days', tasks: ['Docker', 'S3', 'DynamoDB'], completed: false }
    ],
    createdAt: new Date().toISOString()
  };

  await docClient.send(new PutCommand({ TableName: 'LearningPaths', Item: pathEntry }));
  res.json({ success: true, learningPath: pathEntry });
});

router.post('/learning-path/generate', authMiddleware, async (req, res) => {
  const user = await getStudentById(req.user.id);
  const targetRole = user?.targetRole || 'AI Engineer';
  const studentSkills = await listStudentSkills(req.user.id);
  const gap = await generateSkillGap(studentSkills, [
    { name: 'Python', requiredLevel: 4 },
    { name: 'Machine Learning', requiredLevel: 3 },
    { name: 'Deep Learning', requiredLevel: 3 },
    { name: 'PyTorch', requiredLevel: 3 },
    { name: 'RAG Architecture', requiredLevel: 2 },
    { name: 'Docker', requiredLevel: 2 }
  ]);

  const generated = await generateLearningPath(studentSkills, targetRole, gap.missing || gap.developing || []);
  const pathEntry = {
    studentId: req.user.id,
    pathId: uuidv4(),
    title: `${targetRole} roadmap`,
    targetRole,
    phases: generated.phases || [],
    createdAt: new Date().toISOString()
  };

  await docClient.send(new PutCommand({ TableName: 'LearningPaths', Item: pathEntry }));
  res.json({ success: true, learningPath: pathEntry });
});

router.put('/learning-path/task', authMiddleware, async (req, res) => {
  const { pathId, phaseIndex, taskIndex, completed } = req.body || {};
  const items = await scanTable('LearningPaths');
  const path = items.find((item) => item.studentId === req.user.id && item.pathId === pathId);
  if (!path) return res.status(404).json({ success: false, message: 'Learning path not found.' });

  const phases = path.phases || [];
  if (phases[phaseIndex] && phases[phaseIndex].tasks[taskIndex]) {
    phases[phaseIndex].tasks[taskIndex] = {
      ...phases[phaseIndex].tasks[taskIndex],
      completed: Boolean(completed)
    };
  }

  const updated = { ...path, phases };
  await docClient.send(new PutCommand({ TableName: 'LearningPaths', Item: updated }));
  await addNotification(req.user.id, 'learning-task', 'A learning task was marked complete.', { metadata: { pathId } });
  res.json({ success: true, learningPath: updated });
});

router.get('/projects', authMiddleware, async (req, res) => {
  const user = await getStudentById(req.user.id);
  const studentSkills = await listStudentSkills(req.user.id);
  const gap = await generateSkillGap(studentSkills, [
    { name: 'Python', requiredLevel: 4 },
    { name: 'Machine Learning', requiredLevel: 3 },
    { name: 'Deep Learning', requiredLevel: 3 },
    { name: 'PyTorch', requiredLevel: 3 },
    { name: 'LLM & Prompt Engineering', requiredLevel: 2 },
    { name: 'RAG Architecture', requiredLevel: 2 },
    { name: 'Docker', requiredLevel: 2 }
  ]);

  const recommendations = await recommendProjects(gap.missing || gap.developing || [], user?.targetRole || 'AI Engineer');
  res.json({ success: true, projects: recommendations.projects || [
    {
      title: 'LLM-Powered Study Companion',
      description: 'Build an AI tutor that answers questions using a locally stored knowledge base and RAG.',
      skills: ['RAG', 'Python', 'LLM', 'Prompt Engineering'],
      difficulty: 'Intermediate',
      duration: '7 days',
      mappedSkill: 'RAG Architecture'
    },
    {
      title: 'Model Monitoring Dashboard',
      description: 'Create a dashboard to evaluate model drift, performance, and training metrics.',
      skills: ['Machine Learning', 'Python', 'Docker', 'ML Ops'],
      difficulty: 'Intermediate',
      duration: '8 days',
      mappedSkill: 'Machine Learning'
    }
  ] });
});

router.post('/projects/recommend', authMiddleware, async (req, res) => {
  const { skills } = req.body || {};
  const targetRole = (await getStudentById(req.user.id))?.targetRole || 'AI Engineer';
  const results = await recommendProjects(skills || [], targetRole);
  res.json({ success: true, projects: results.projects || [] });
});

router.get('/assessment/current', authMiddleware, async (req, res) => {
  const items = await scanTable('Assessments');
  const studentAssessments = items.filter((assessment) => assessment.studentId === req.user.id);

  let current = studentAssessments.find((assessment) => assessment.score === null || assessment.score === undefined || assessment.score === '') || null;

  if (!current) {
    const generated = await generateAssessment({ phases: ['Python', 'Machine Learning', 'RAG'] }, ['Python', 'Machine Learning', 'RAG'], 1);
    current = {
      studentId: req.user.id,
      assessmentId: uuidv4(),
      title: 'Weekly AI Engineer Assessment',
      weekNumber: 1,
      skillsTested: ['Python', 'Machine Learning', 'RAG'],
      questions: generated.questions || [
        { id: 'q1', type: 'mcq', question: 'Which Python library is widely used for tensor operations in deep learning?', options: ['NumPy', 'PyTorch', 'Pandas', 'Scikit-learn'], answer: 'PyTorch' },
        { id: 'q2', type: 'short', question: 'Explain the purpose of a retrieval-augmented generation (RAG) pipeline.', answer: '' },
        { id: 'q3', type: 'scenario', question: 'A model performs poorly in production due to stale data. What should the first step be?', options: ['Ignore it', 'Monitor drift and retrain', 'Change the frontend', 'Remove validation'], answer: 'Monitor drift and retrain' }
      ],
      score: null,
      submittedAt: null,
      generatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({ TableName: 'Assessments', Item: current }));
  }

  res.json({ success: true, assessment: current });
});

router.post('/assessment/generate', authMiddleware, async (req, res) => {
  const { weekNumber = 1 } = req.body || {};
  const skills = ['Python', 'Machine Learning', 'RAG'];
  const generated = await generateAssessment({ phases: ['Python', 'ML', 'RAG'] }, skills, weekNumber);
  const assessment = {
    studentId: req.user.id,
    assessmentId: uuidv4(),
    title: `Week ${weekNumber} Assessment`,
    weekNumber,
    skillsTested: skills,
    questions: generated.questions || [
      { id: 'q1', type: 'mcq', question: 'What does a confusion matrix help evaluate?', options: ['Database design', 'Model classification performance', 'JavaScript loops', 'Network latency'], answer: 'Model classification performance' }
    ],
    score: null,
    generatedAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: 'Assessments', Item: assessment }));
  res.json({ success: true, assessment });
});

router.post('/assessment/submit', authMiddleware, async (req, res) => {
  try {
    const { assessmentId, answers } = req.body || {};
    const items = await scanTable('Assessments');
    const assessment = items.find((item) => item.assessmentId === assessmentId && item.studentId === req.user.id);
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found.' });
    console.log('Submitting ', JSON.stringify(assessment.questions));
    const evaluation = await evaluateAssessment(assessment.questions || [], answers || {});
    console.log('Evaluation result:', evaluation);
    const score = Number(evaluation.percentage ?? evaluation.score ?? 0);
    const updated = {
      ...assessment,
      answers: answers || {},
      score,
      submittedAt: new Date().toISOString(),
      evaluation,
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({ TableName: 'Assessments', Item: updated }));
    await addNotification(req.user.id, 'assessment-result', `Assessment submitted with a score of ${score}%.`, { metadata: { score } });
    res.json({ success: true, assessment: updated, evaluation });
  } catch (error) {
    console.error('Submit assessment error:', error);
    res.status(500).json({ success: false, message: 'Unable to submit assessment.' });
  }
});

router.get('/assessment/history', authMiddleware, async (req, res) => {
  const items = await scanTable('Assessments');
  const history = items.filter((assessment) => assessment.studentId === req.user.id).sort((a, b) => (a.weekNumber || 0) - (b.weekNumber || 0));
  res.json({ success: true, history });
});

router.get('/faculty/students', authMiddleware, requireRole('faculty'), async (req, res) => {
  const students = await scanTable('Students');
  res.json({ success: true, students: students.filter((student) => student.role !== 'faculty') });
});

router.get('/faculty/student/:studentId', authMiddleware, requireRole('faculty'), async (req, res) => {
  const student = await getStudentById(req.params.studentId);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
  const skills = await listStudentSkills(student.studentId);
  const evidence = (await scanTable('Evidence')).filter((item) => item.studentId === student.studentId);
  const assessments = (await scanTable('Assessments')).filter((item) => item.studentId === student.studentId);
  const path = (await scanTable('LearningPaths')).find((item) => item.studentId === student.studentId) || null;
  const reviews = (await scanTable('FacultyReviews')).filter((item) => item.studentId === student.studentId);
  res.json({ success: true, student, skills, evidence, assessments, learningPath: path, reviews });
});

router.post('/faculty/evidence/:evidenceId/review', authMiddleware, requireRole('faculty'), async (req, res) => {
  const { status, comments, verifiedSkillLevel } = req.body || {};
  const evidenceItems = await scanTable('Evidence');
  const evidence = evidenceItems.find((item) => item.evidenceId === req.params.evidenceId);
  if (!evidence) return res.status(404).json({ success: false, message: 'Evidence not found.' });

  const review = {
    studentId: evidence.studentId,
    reviewId: uuidv4(),
    evidenceId: evidence.evidenceId,
    status: status || 'Verified',
    comments: comments || 'Faculty review completed.',
    verifiedSkillLevel: verifiedSkillLevel || 3,
    reviewedAt: new Date().toISOString()
  };

  evidence.status = review.status;
  evidence.facultyReview = review;
  await docClient.send(new PutCommand({ TableName: 'Evidence', Item: evidence }));
  await docClient.send(new PutCommand({ TableName: 'FacultyReviews', Item: review }));
  await addNotification(evidence.studentId, 'faculty-review', `Faculty reviewed evidence: ${review.status}.`, { metadata: { evidenceId: evidence.evidenceId } });

  res.json({ success: true, review, evidence });
});

router.get('/notifications', authMiddleware, async (req, res) => {
  const items = await scanTable('Notifications');
  const notifications = items.filter((item) => item.studentId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, notifications });
});

router.put('/notifications/:id/read', authMiddleware, async (req, res) => {
  const items = await scanTable('Notifications');
  const found = items.find((item) => item.studentId === req.user.id && item.notificationId === req.params.id);
  if (!found) return res.status(404).json({ success: false, message: 'Notification not found.' });
  found.isRead = true;
  await docClient.send(new PutCommand({ TableName: 'Notifications', Item: found }));
  res.json({ success: true, notification: found });
});

module.exports = router;
