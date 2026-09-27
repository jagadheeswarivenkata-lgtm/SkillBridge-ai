const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('skillbridge_token');
}

function setToken(token) {
  if (token) localStorage.setItem('skillbridge_token', token);
  else localStorage.removeItem('skillbridge_token');
}

function getCurrentUser() {
  const raw = localStorage.getItem('skillbridge_user');
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(user) {
  if (user) localStorage.setItem('skillbridge_user', JSON.stringify(user));
  else localStorage.removeItem('skillbridge_user');
}

function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: 'include'
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || 'Request failed.');
    }
    return payload;
  });
}

function logout() {
  setToken('');
  setCurrentUser(null);
  window.location.href = '/login.html';
}

function showToast(message, type = 'success') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.right = '22px';
  toast.style.bottom = '22px';
  toast.style.zIndex = '200';
  toast.style.padding = '12px 16px';
  toast.style.borderRadius = '12px';
  toast.style.background = type === 'error' ? '#f26d7d' : '#2ec5a3';
  toast.style.color = '#fff';
  toast.style.boxShadow = '0 12px 30px rgba(0,0,0,0.24)';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function ensureAuthenticated() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function clamp(num, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(num) || 0));
}

function renderRingChart(canvas, value, color) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width = 130; 
  const center = size / 2;
  const radius = 44;
  const start = -Math.PI / 2;
  const end = start + (value / 100) * (Math.PI * 2);

  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.arc(center, center, radius, start, end);
  ctx.stroke();
}

function initCommonUi() {
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) logoutButton.addEventListener('click', logout);

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light');
    });
  }

  if (document.body.dataset.page !== 'landing') {
    const token = getToken();
    const user = getCurrentUser();
    if (token && user) {
      const profileChip = document.getElementById('profileChip');
      if (profileChip) profileChip.textContent = user.fullName || 'Student';
    }
  }
}

function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setToken(response.token);
      setCurrentUser(response.user);
      showToast('Login successful. Redirecting...');
      setTimeout(() => window.location.href = '/dashboard.html', 700);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      fullName: document.getElementById('fullName').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
      confirmPassword: document.getElementById('confirmPassword').value,
      branch: document.getElementById('branch').value,
      college: document.getElementById('college').value.trim(),
      graduationYear: document.getElementById('graduationYear').value
    };

    try {
      const response = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setToken(response.token);
      setCurrentUser(response.user);
      showToast('Account created. Taking you to your dashboard...');
      setTimeout(() => window.location.href = '/dashboard.html', 700);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function getDashboardData() {
  const [me, skills, gap, assessments, notifications, projects] = await Promise.all([
    apiFetch('/auth/me'),
    apiFetch('/skills/student'),
    apiFetch('/skill-gap'),
    apiFetch('/assessment/history'),
    apiFetch('/notifications'),
    apiFetch('/projects')
  ]);
  return { me: me.user, skills: skills.skills, gap: gap.gap, assessments: assessments.history || [], notifications: notifications.notifications || [], projects: projects.projects || [] };
}

function renderDashboard() {
  if (!ensureAuthenticated()) return;

  const dashboardRoot = document.getElementById('dashboardRoot');
  if (!dashboardRoot) return;

  getDashboardData()
    .then(({ me, skills, gap, assessments, notifications, projects }) => {
      const currentSkillNames = skills.length ? skills.map((skill) => skill.name || skill.skillId) : [];
      const skillCount = skills.length || 0;
      const gapCount = (gap.missing || []).length + (gap.developing || []).length;
      const projectCount = projects.length || 0;
      const recentAssessment = assessments.length ? assessments[assessments.length - 1] : null;
      const averageScore = assessments.length ? Math.round(assessments.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / assessments.length) : 81;
      const readiness = clamp(72 + (skillCount * 1.5) + (recentAssessment?.score || 0) / 10, 0, 96);

      const welcome = document.getElementById('welcomeTitle');
      if (welcome) {
        const hour = new Date().getHours();
        const period = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        welcome.textContent = `${period}, ${me.fullName || 'Student'}`;
      }

      const metricCards = [
        { label: 'Overall Skill Readiness', value: `${Math.round(readiness)}%`, accent: '#4da3ff', icon: 'fa-chart-line' },
        { label: 'Skills Demonstrated', value: String(skillCount), accent: '#41d7d0', icon: 'fa-brain' },
        { label: 'Skill Gaps', value: String(gapCount), accent: '#b56ffb', icon: 'fa-bullseye' },
        { label: 'Completed Projects', value: String(projectCount), accent: '#2ec5a3', icon: 'fa-briefcase' },
        { label: 'Assessment Average', value: `${averageScore}%`, accent: '#f4b642', icon: 'fa-clipboard-check' },
        { label: 'Learning Progress', value: `${Math.round(clamp(68 + (projects.length * 2), 0, 100))}%`, accent: '#7a6efc', icon: 'fa-graduation-cap' }
      ];

      const cardsContainer = document.getElementById('statsGrid');
      if (cardsContainer) {
        cardsContainer.innerHTML = metricCards.map((card, index) => `
          <div class="stat-card">
            <div class="stat-header">
              <span class="small-text">${card.label}</span>
              <span class="icon-circle" style="background:${card.accent}1a; color:${card.accent};"><i class="fa-solid ${card.icon}"></i></span>
            </div>
            <div class="value-lg" data-counter="${card.value}">${index === 0 ? Math.round(readiness) : card.value.replace('%','')}</div>
            <div class="progress-strip" style="margin-top:16px"><div class="progress-bar" style="width:${index === 0 ? Math.round(readiness) : clamp((Math.round(Number(card.value.toString().replace(/%|[^0-9]/g,'')) || 0) / 100) * 100,0,100)}%; background:linear-gradient(90deg, ${card.accent}, rgba(255,255,255,0.85));"></div></div>
          </div>
        `).join('');
      }

      const ring = document.getElementById('readinessRing');
      if (ring) {
        const canvas = document.createElement('canvas');
        const value = Math.round(readiness);
        canvas.width = 130; canvas.height = 130;
        ring.innerHTML = '';
        ring.appendChild(canvas);
        const valueLabel = document.createElement('div');
        valueLabel.className = 'ring-value';
        valueLabel.textContent = `${value}%`;
        ring.appendChild(valueLabel);
        renderRingChart(canvas, value, '#4da3ff');
      }

      const radarCanvas = document.getElementById('skillRadarChart');
      if (radarCanvas) {
        new Chart(radarCanvas, {
          type: 'radar',
          data: {
            labels: currentSkillNames.slice(0, 6),
            datasets: [{
              label: 'Current Capability',
              data: skills.slice(0, 6).map((skill) => clamp((Number(skill.level) || 0) * 20, 0, 100)),
              borderColor: '#4da3ff',
              backgroundColor: 'rgba(77,163,255,0.22)',
              pointRadius: 3
            }]
          },
          options: {
            scales: { r: { min: 0, max: 100, ticks: { display: false } } },
            plugins: { legend: { display: false } }
          }
        });
      }

      const barCanvas = document.getElementById('currentVsTargetChart');
      if (barCanvas) {
        const labels = ['Python', 'ML', 'Deep Learning', 'RAG', 'Docker'];
        const current = [90, 62, 35, 28, 40];
        const target = [95, 80, 70, 70, 70];
        new Chart(barCanvas, {
          type: 'bar',
          data: { labels, datasets: [
            { label: 'Current', data: current, backgroundColor: '#4da3ff' },
            { label: 'Target', data: target, backgroundColor: '#7a6efc' }
          ] },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
      }

      const lineCanvas = document.getElementById('weeklyTrendChart');
      if (lineCanvas) {
        new Chart(lineCanvas, {
          type: 'line',
          data: { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], datasets: [{ label: 'Readiness', data: [62, 71, 82, 88], borderColor: '#41d7d0', backgroundColor: 'rgba(65,215,208,0.15)', tension: 0.4, fill: true }] },
          options: { responsive: true, plugins: { legend: { display: false } } }
        });
      }

      const gapList = document.getElementById('skillGapList');
      if (gapList) {
        const combined = [...(gap.missing || []), ...(gap.developing || [])].slice(0, 5);
        gapList.innerHTML = combined.map((item) => `
          <li>
            <span>${item.skill}</span>
            <span class="tag ${item.gap > 2 ? 'warning' : 'primary'}">Gap ${item.gap}</span>
          </li>
        `).join('');
      }

      const projectsList = document.getElementById('projectList');
      if (projectsList) {
        projectsList.innerHTML = (projects || []).slice(0, 3).map((project) => `
          <div class="project-card">
            <div class="row"><strong>${project.title}</strong><span class="badge">${project.difficulty || 'Intermediate'}</span></div>
            <p class="muted">${project.description}</p>
            <div class="list-inline">${(project.skills || []).map((skill) => `<span class="tag primary">${skill}</span>`).join('')}</div>
          </div>
        `).join('');
      }

      const notificationsList = document.getElementById('notificationList');
      if (notificationsList) {
        notificationsList.innerHTML = (notifications || []).slice(0, 4).map((item) => `
          <li><span>${item.message}</span><span class="small-text">${new Date(item.createdAt).toLocaleDateString()}</span></li>
        `).join('');
      }
    })
    .catch((error) => {
      showToast(error.message, 'error');
    });
}

async function loadProfile() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/profile');
    const user = response.user || getCurrentUser();
    const form = document.getElementById('profileForm');
    if (!form) return;
    document.getElementById('name').value = user.fullName || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('college').value = user.college || '';
    document.getElementById('branch').value = user.branch || '';
    document.getElementById('graduationYear').value = user.graduationYear || '';
    document.getElementById('targetRole').value = user.targetRole || 'AI Engineer';
    document.getElementById('profileCompletion').textContent = `${user.profileCompletion || 85}%`;
    document.getElementById('profileCompletionFill').style.width = `${user.profileCompletion || 85}%`;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function initProfileForm() {
  if (!document.getElementById('profileForm')) return;
  loadProfile();

  document.getElementById('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      fullName: document.getElementById('name').value,
      email: document.getElementById('email').value,
      college: document.getElementById('college').value,
      branch: document.getElementById('branch').value,
      graduationYear: document.getElementById('graduationYear').value,
      targetRole: document.getElementById('targetRole').value
    };

    try {
      const response = await apiFetch('/profile', { method: 'PUT', body: JSON.stringify(payload) });
      setCurrentUser(response.user);
      showToast('Profile updated successfully.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function loadRoleForm() {
  if (!ensureAuthenticated()) return;
  const options = [
    'Software Developer', 'Data Scientist', 'Machine Learning Engineer', 'AI Engineer', 'Full Stack Developer', 'Cloud Engineer', 'DevOps Engineer', 'Embedded Systems Engineer', 'Data Analyst', 'Cybersecurity Analyst'
  ];
  const select = document.getElementById('roleSelect');
  if (select) {
    select.innerHTML = options.map((role) => `<option value="${role}">${role}</option>`).join('');
  }

  try {
    const response = await apiFetch('/auth/me');
    if (response.user?.targetRole) {
      const targetInput = document.getElementById('customRole');
      if (targetInput) targetInput.value = response.user.targetRole;
    }
  } catch (error) {
    console.warn(error);
  }
}

function initRoleForm() {
  if (!document.getElementById('roleForm')) return;
  loadRoleForm();

  document.getElementById('roleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const roleTitle = document.getElementById('roleSelect').value;
    const customRole = document.getElementById('customRole').value.trim();
    const jobDescription = document.getElementById('jobDescription').value.trim();

    try {
      const response = await apiFetch('/roles/analyze', {
        method: 'POST',
        body: JSON.stringify({ roleTitle, customRole, jobDescription })
      });
      showToast('Target role analyzed successfully.');
      const resultBox = document.getElementById('analysisResult');
      if (resultBox) resultBox.innerHTML = jsonSummaryCard(response.analysis || response.role || {});
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function jsonSummaryCard(data) {
  const skills = data.technicalSkills || data.requirements || [];
  return `
    <div class="card-stack">
      <div class="info-card">
        <h4>Role Requirements</h4>
        <div class="list-inline">${(skills || []).slice(0, 6).map((skill) => `<span class="tag primary">${skill.name || skill.skill || 'Skill'}</span>`).join('')}</div>
      </div>
      <div class="info-card">
        <h4>Detected Focus</h4>
        <ul class="list">
          ${(skills || []).slice(0, 5).map((skill) => `<li><span>${skill.name || skill.skill}</span><span class="muted">${skill.requiredLevel || 'Intermediate'}</span></li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

async function loadEvidence() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/evidence');
    const evidenceList = document.getElementById('evidenceList');
    if (!evidenceList) return;
    evidenceList.innerHTML = (response.evidence || []).map((item) => `
      <div class="project-card">
        <div class="row"><strong>${item.title}</strong><span class="badge">${item.status || 'Pending Review'}</span></div>
        <p class="muted">${item.description}</p>
        <div class="row small-text"><span>${item.category}</span><span>${new Date(item.date || item.createdAt).toLocaleDateString()}</span></div>
      </div>
    `).join('') || '<div class="muted">No evidence submitted yet.</div>';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function initEvidenceForm() {
  if (!document.getElementById('evidenceForm')) return;
  document.getElementById('evidenceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`${API_BASE}/evidence`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData
      }).then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.message || 'Evidence submission failed.');
        return payload;
      });

      showToast('Evidence submitted and analyzed.');
      form.reset();
      loadEvidence();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  loadEvidence();
}

async function loadSkillGapPage() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/skill-gap');
    const { strong = [], developing = [], missing = [] } = response.gap || {};
    const container = document.getElementById('skillGapCards');
    if (!container) return;

    const buildCard = (type, items) => `
      <div class="panel">
        <h4>${type}</h4>
        ${items.length ? items.map((item) => `
          <div class="project-card">
            <div class="row"><strong>${item.skill}</strong><span class="tag ${type === 'Strong Skills' ? 'success' : type === 'Developing' ? 'warning' : 'danger'}">${item.currentLevel || 0}/${item.requiredLevel || 0}</span></div>
            <p class="small-text">Required: ${item.requiredLevel} • Gap: ${item.gap || 0}</p>
            <div class="progress-strip"><div class="progress-bar" style="width:${clamp((item.currentLevel / Math.max(item.requiredLevel, 1)) * 100, 0, 100)}%"></div></div>
          </div>
        `).join('') : '<p class="muted">No items in this category.</p>'}
      </div>
    `;

    container.innerHTML = buildCard('Strong Skills', strong) + buildCard('Developing', developing) + buildCard('Missing', missing);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadGraphsPage() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/skill-gap');
    const labels = ['Python', 'JavaScript', 'SQL', 'React', 'AWS', 'Docker'];
    const current = [90, 72, 55, 35, 25, 40];
    const target = [95, 80, 70, 70, 70, 70];

    new Chart(document.getElementById('radarChart'), {
      type: 'radar',
      data: { labels, datasets: [{ label: 'Current', data: current, borderColor: '#4da3ff', backgroundColor: 'rgba(77,163,255,0.22)' }, { label: 'Target', data: target, borderColor: '#b56ffb', backgroundColor: 'rgba(181,111,251,0.12)' }] },
      options: { responsive: true }
    });

    new Chart(document.getElementById('lineChart'), {
      type: 'line',
      data: { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], datasets: [{ data: [62, 71, 82, 88], borderColor: '#41d7d0', tension: 0.4, fill: true, backgroundColor: 'rgba(65,215,208,0.13)' }] },
      options: { responsive: true }
    });

    new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Current', data: current, backgroundColor: '#4da3ff' }, { label: 'Required', data: target, backgroundColor: '#7a6efc' }] },
      options: { responsive: true }
    });

    new Chart(document.getElementById('distributionChart'), {
      type: 'doughnut',
      data: { labels: ['Strong', 'Developing', 'Missing'], datasets: [{ data: [40, 35, 25], backgroundColor: ['#2ec5a3', '#f4b642', '#f26d7d'] }] },
      options: { responsive: true }
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadLearningPath() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/learning-path');
    const phases = response.learningPath?.phases || [];
    const container = document.getElementById('learningPathTimeline');
    if (!container) return;
    container.innerHTML = phases.map((phase) => `
      <div class="timeline-item">
        <div class="row"><h4>${phase.phase || 'PHASE'} • ${phase.title}</h4><span class="badge">${phase.duration || '7 days'}</span></div>
        <ul class="list">
          ${(phase.tasks || []).map((task) => `<li><span>${typeof task === 'string' ? task : (task.title || 'Task')}</span><span class="tag ${task.completed ? 'success' : 'primary'}">${task.completed ? 'Done' : 'Next'}</span></li>`).join('')}
        </ul>
      </div>
    `).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadProjectsPage() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/projects');
    const container = document.getElementById('projectsList');
    if (!container) return;
    container.innerHTML = (response.projects || []).map((project) => `
      <div class="project-card">
        <div class="row"><h4>${project.title}</h4><span class="badge">${project.difficulty || 'Intermediate'}</span></div>
        <p class="muted">${project.description}</p>
        <div class="list-inline">${(project.skills || []).map((skill) => `<span class="tag primary">${skill}</span>`).join('')}</div>
        <div class="row small-text" style="margin-top:12px;"><span>Duration: ${project.duration || '5 days'}</span><span>Skill: ${project.mappedSkill || 'Core gap'}</span></div>
      </div>
    `).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadAssessment() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/assessment/current');
    const assessment = response.assessment || {};
    const questionsWrap = document.getElementById('assessmentQuestions');
    if (!questionsWrap) return;

    questionsWrap.innerHTML = (assessment.questions || []).map((question, index) => `
      <div class="project-card">
        <strong>Q${index + 1}. ${question.question}</strong>
        ${(question.options || []).length ? `
          <div class="list-inline" style="margin-top:12px;">${question.options.map((option) => `<label class="tag primary" style="cursor:pointer"><input type="radio" name="q${question.id || index}" value="${option}" style="margin-right:6px;">${option}</label>`).join('')}</div>
        ` : `<textarea id="answer-${question.id || index}" placeholder="Write your answer here..." class="form-control" style="margin-top:12px; width:100%;"></textarea>`}
      </div>
    `).join('');

    document.getElementById('assessmentForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const answers = {};
      (assessment.questions || []).forEach((question, index) => {
        const name = `q${question.id || index}`;
        const selected = document.querySelector(`input[name="${name}"]:checked`);
        const text = document.getElementById(`answer-${question.id || index}`)?.value;
        answers[question.id || `q${index + 1}`] = selected ? selected.value : text || '';
      });

      try {
        const result = await apiFetch('/assessment/submit', { method: 'POST', body: JSON.stringify({ assessmentId: assessment.assessmentId, answers }) });
        showToast(`Assessment submitted. Score: ${result.assessment.score}%`);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadFacultyPage() {
  if (!ensureAuthenticated()) return;
  try {
    const response = await apiFetch('/faculty/students');
    const list = document.getElementById('facultyStudents');
    if (!list) return;
    list.innerHTML = (response.students || []).map((student) => `
      <div class="faculty-card">
        <div class="row"><strong>${student.fullName}</strong><span class="tag primary">${student.targetRole || 'AI Engineer'}</span></div>
        <p class="muted">${student.college} • ${student.branch}</p>
        <a href="/student-detail.html?studentId=${student.studentId}" class="btn btn-soft">Review Student</a>
      </div>
    `).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadStudentDetailPage() {
  if (!ensureAuthenticated()) return;
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('studentId');
  if (!studentId) return;

  try {
    const response = await apiFetch(`/faculty/student/${studentId}`);
    const student = response.student || {};
    document.getElementById('studentName').textContent = student.fullName || 'Student';
    document.getElementById('studentMeta').textContent = `${student.college || ''} • ${student.branch || ''}`;
    const evidence = response.evidence || [];
    document.getElementById('evidenceReview').innerHTML = evidence.map((item) => `
      <div class="project-card">
        <div class="row"><strong>${item.title}</strong><span class="badge">${item.status || 'Pending Review'}</span></div>
        <p class="muted">${item.description}</p>
      </div>
    `).join('');

    const form = document.getElementById('reviewForm');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const payload = {
          status: document.getElementById('reviewStatus').value,
          comments: document.getElementById('reviewComment').value,
          verifiedSkillLevel: Number(document.getElementById('verifiedSkillLevel').value || 3)
        };
        const result = await apiFetch(`/faculty/evidence/${evidence[0]?.evidenceId || 'unknown'}/review`, { method: 'POST', body: JSON.stringify(payload) });
        showToast('Faculty review submitted.');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCommonUi();

  const page = document.body.dataset.page;
  if (page === 'login') initLoginForm();
  if (page === 'register') initRegisterForm();
  if (page === 'dashboard') renderDashboard();
  if (page === 'profile') initProfileForm();
  if (page === 'target-role') initRoleForm();
  if (page === 'evidence') initEvidenceForm();
  if (page === 'skill-gap') loadSkillGapPage();
  if (page === 'skill-graph') loadGraphsPage();
  if (page === 'learning-path') loadLearningPath();
  if (page === 'projects') loadProjectsPage();
  if (page === 'assessment') loadAssessment();
  if (page === 'faculty') loadFacultyPage();
  if (page === 'student-detail') loadStudentDetailPage();
});
