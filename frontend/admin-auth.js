const API_BASE_URL = (window.BACKEND_API_BASE || '').replace(/\/$/, '');
const ADMIN_API_URL = `${API_BASE_URL}/api/admin`;

window.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('adminLoginForm');
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleAdminLogin();
  });
  checkExistingSession();
});

async function checkExistingSession() {
  try {
    const response = await fetch(`${ADMIN_API_URL}/check`, {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const result = await response.json();
    if (result.success) {
      window.location.href = '/admin-dashboard';
    }
  } catch (error) {
    // ignore; not signed in yet
  }
}

async function handleAdminLogin() {
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const authMessage = document.getElementById('authMessage');

  if (!emailInput || !passwordInput || !authMessage) return;

  authMessage.textContent = '';
  authMessage.classList.remove('error', 'success');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    authMessage.textContent = 'Please enter both email and password.';
    authMessage.classList.add('error');
    return;
  }

  try {
    const response = await fetch(`${ADMIN_API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();
    if (result.success) {
      authMessage.textContent = 'Login successful. Redirecting...';
      authMessage.classList.add('success');
      window.location.href = '/admin-dashboard';
      return;
    }

    authMessage.textContent = result.message || 'Invalid login credentials.';
    authMessage.classList.add('error');
  } catch (error) {
    authMessage.textContent = 'Unable to reach the authentication server.';
    authMessage.classList.add('error');
    console.error('Login error:', error);
  }
}
