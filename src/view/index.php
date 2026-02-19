<?php include 'resources/header.php'; ?>

<style>
  body {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  .login-main {
    min-height: 100vh;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
  }
  
  .login-container {
    width: 100%;
    max-width: 450px;
  }
  
  .login-card {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    animation: slideUp 0.5s ease;
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .login-header {
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    padding: 2.5rem 2rem;
    text-align: center;
    color: white;
  }
  
  .login-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .login-header p {
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
    font-size: 0.95rem;
  }
  
  .login-icon {
    width: 80px;
    height: 80px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
    font-size: 2.5rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }
  
  .login-body {
    padding: 2.5rem 2rem;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  .form-label {
    color: #1a237e;
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    font-size: 0.95rem;
  }
  
  .form-label i {
    margin-right: 0.5rem;
    color: #6a1b9a;
  }
  
  .form-control {
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    transition: all 0.3s ease;
  }
  
  .form-control:focus {
    border-color: #6a1b9a;
    box-shadow: 0 0 0 0.2rem rgba(106, 27, 154, 0.15);
  }
  
  .form-control.is-invalid {
    border-color: #dc3545;
    padding-right: calc(1.5em + 0.75rem);
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' width='12' height='12' fill='none' stroke='%23dc3545'%3e%3ccircle cx='6' cy='6' r='4.5'/%3e%3cpath stroke-linejoin='round' d='M5.8 3.6h.4L6 6.5z'/%3e%3ccircle cx='6' cy='8.2' r='.6' fill='%23dc3545' stroke='none'/%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right calc(0.375em + 0.1875rem) center;
    background-size: calc(0.75em + 0.375rem) calc(0.75em + 0.375rem);
    animation: shake 0.4s;
  }
  
  .form-control.is-invalid:focus {
    border-color: #dc3545;
    box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25);
  }
  
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
  }
  
  .password-toggle {
    position: relative;
  }
  
  .password-toggle-btn {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #6a1b9a;
    cursor: pointer;
    padding: 0.5rem;
    font-size: 1.2rem;
    transition: all 0.3s ease;
  }
  
  .password-toggle-btn:hover {
    color: #4a148c;
  }
  
  .form-check {
    margin-bottom: 1.5rem;
  }
  
  .form-check-input:checked {
    background-color: #6a1b9a;
    border-color: #6a1b9a;
  }
  
  .form-check-label {
    color: #555;
    font-size: 0.9rem;
  }
  
  .btn-login {
    width: 100%;
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    border: none;
    color: white;
    font-weight: 600;
    padding: 0.85rem;
    border-radius: 10px;
    font-size: 1.05rem;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(106, 27, 154, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .btn-login:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(106, 27, 154, 0.4);
    background: linear-gradient(135deg, #6a1b9a 0%, #4a148c 100%);
  }
  
  .btn-login:active {
    transform: translateY(0);
  }
  
  .forgot-password {
    text-align: center;
    margin-top: 1rem;
  }
  
  .forgot-password a {
    color: #6a1b9a;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.9rem;
    transition: all 0.3s ease;
  }
  
  .forgot-password a:hover {
    color: #4a148c;
    text-decoration: underline;
  }
  
  .register-link {
    text-align: center;
    padding: 1.5rem;
    background: #f8f9fa;
    color: #555;
    font-size: 0.9rem;
  }
  
  .register-link a {
    color: #6a1b9a;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.3s ease;
  }
  
  .register-link a:hover {
    color: #4a148c;
    text-decoration: underline;
  }
  
  .loading-spinner {
    display: none;
    margin-left: 0.5rem;
  }
  
  @media (max-width: 480px) {
    .login-header h1 {
      font-size: 1.5rem;
    }
    
    .login-body {
      padding: 2rem 1.5rem;
    }
  }
</style>

<main class="login-main">
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="login-icon">
          <i class="bi bi-shield-lock-fill"></i>
        </div>
        <h1>Bem-vindo!</h1>
        <p>Faça login para continuar</p>
      </div>
      
      <div class="login-body">
        <form id="loginForm" method="POST" action="/auth/login">
          <div class="form-group">
            <label for="username" class="form-label">
              <i class="bi bi-person-fill"></i>
              Usuário
            </label>
            <input 
              type="text" 
              class="form-control" 
              id="username" 
              name="username" 
              placeholder="Digite seu usuário"
              required
              autocomplete="username"
            >
          </div>
          
          <div class="form-group">
            <label for="password" class="form-label">
              <i class="bi bi-lock-fill"></i>
              Senha
            </label>
            <div class="password-toggle">
              <input 
                type="password" 
                class="form-control" 
                id="password" 
                name="password" 
                placeholder="Digite sua senha"
                required
                autocomplete="current-password"
              >
              <button 
                type="button" 
                class="password-toggle-btn" 
                onclick="togglePassword()"
                aria-label="Mostrar/Ocultar senha"
              >
                <i class="bi bi-eye-fill" id="toggleIcon"></i>
              </button>
            </div>
          </div>
          
          <button type="submit" class="btn btn-login">
            Entrar
            <span class="loading-spinner spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          </button>
        </form>
      </div>

    </div>
  </div>
</main>

<script>
  // Toggle password visibility
  function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggleIcon');
    
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleIcon.classList.remove('bi-eye-fill');
      toggleIcon.classList.add('bi-eye-slash-fill');
    } else {
      passwordInput.type = 'password';
      toggleIcon.classList.remove('bi-eye-slash-fill');
      toggleIcon.classList.add('bi-eye-fill');
    }
  }
  
  // Validação de campo vazio
  function validateField(field, errorMessage) {
    if (!field.value.trim()) {
      field.classList.add('is-invalid');
      return false;
    }
    field.classList.remove('is-invalid');
    return true;
  }
  
  // Limpar erro ao digitar
  document.getElementById('username').addEventListener('input', function() {
    this.classList.remove('is-invalid');
  });
  
  document.getElementById('password').addEventListener('input', function() {
    this.classList.remove('is-invalid');
  });
  
  // Handle form submission
  document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    const username = usernameField.value.trim();
    const password = passwordField.value.trim();
    const loadingSpinner = document.querySelector('.loading-spinner');
    const submitButton = document.querySelector('.btn-login');
    
    // Validação dos campos
    let isValid = true;
    
    if (!validateField(usernameField, 'Usuário é obrigatório')) {
      isValid = false;
    }
    
    if (!validateField(passwordField, 'Senha é obrigatória')) {
      isValid = false;
    }
    
    if (!isValid) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'Por favor, preencha todos os campos.',
        confirmButtonColor: '#6a1b9a'
      });
      return;
    }
    
    // Validação de tamanho mínimo
    if (username.length < 3) {
      usernameField.classList.add('is-invalid');
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'O usuário deve ter pelo menos 3 caracteres.',
        confirmButtonColor: '#6a1b9a'
      });
      return;
    }
    
    if (password.length < 3) {
      passwordField.classList.add('is-invalid');
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'A senha deve ter pelo menos 3 caracteres.',
        confirmButtonColor: '#6a1b9a'
      });
      return;
    }
    
    // Show loading state
    loadingSpinner.style.display = 'inline-block';
    submitButton.disabled = true;
    submitButton.style.opacity = '0.7';
    
    try {
      // Verificar se r4 está disponível
      if (typeof r4 === 'undefined') {
        throw new Error('Sistema de criptografia não carregado. Recarregue a página.');
      }
      
      // Criptografar os dados de login usando r4.js
      const encryptedData = await r4.encryptData({
        username: username,
        password: password
      });
      
      // Verificar se a criptografia funcionou
      if (!encryptedData || !encryptedData.x || !encryptedData.y || !encryptedData.z) {
        throw new Error('Erro ao criptografar dados.');
      }
      
      // Enviar dados criptografados
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(encryptedData)
      });
      
      // Verificar se a resposta é válida
      if (!response.ok) {
        throw new Error('Erro na comunicação com o servidor.');
      }
      
      const encryptedResponse = await response.json();
      
      // Verificar se a resposta está criptografada
      if (!encryptedResponse || !encryptedResponse.x || !encryptedResponse.y || !encryptedResponse.z) {
        throw new Error('Resposta do servidor inválida.');
      }
      
      // Descriptografar a resposta do servidor
      const data = await r4.decryptData(encryptedResponse);
      
      loadingSpinner.style.display = 'none';
      submitButton.disabled = false;
      submitButton.style.opacity = '1';
      
      // Verificar se a descriptografia funcionou
      if (!data) {
        Swal.fire({
          icon: 'error',
          title: 'Erro',
          text: 'Erro ao processar resposta do servidor. Tente novamente.',
          confirmButtonColor: '#6a1b9a'
        });
        return;
      }
      
      // Processar resposta
      if (data.success) {
        // Limpar campos
        usernameField.value = '';
        passwordField.value = '';
        
        Swal.fire({
          icon: 'success',
          title: 'Login Realizado!',
          html: `<p>${data.message || 'Bem-vindo de volta!'}</p>
                 <p><strong>${data.user?.nome || username}</strong></p>`,
          confirmButtonColor: '#6a1b9a',
          timer: 2500,
          showConfirmButton: false,
          allowOutsideClick: false,
          allowEscapeKey: false
        }).then(() => {
          // Redirecionar
          window.location.href = data.redirect || '/dashboard';
        });
      } else {
        // Erro de login
        passwordField.value = '';
        passwordField.focus();
        
        Swal.fire({
          icon: 'error',
          title: 'Erro ao fazer login',
          text: data.message || 'Usuário ou senha incorretos!',
          confirmButtonColor: '#6a1b9a',
          confirmButtonText: 'Tentar novamente'
        });
      }
    } catch (error) {
      loadingSpinner.style.display = 'none';
      submitButton.disabled = false;
      submitButton.style.opacity = '1';
      
      console.error('Erro no login:', error);
      
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: error.message || 'Ocorreu um erro ao tentar fazer login. Tente novamente.',
        confirmButtonColor: '#6a1b9a',
        confirmButtonText: 'OK'
      });
    }
  });
  
  // Add enter key support
  document.getElementById('password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      document.getElementById('loginForm').dispatchEvent(new Event('submit'));
    }
  });
  
  // Focar no primeiro campo ao carregar
  window.addEventListener('load', function() {
    document.getElementById('username').focus();
  });
</script>

<?php include 'resources/footer.php'; ?>