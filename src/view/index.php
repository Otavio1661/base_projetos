<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .login-card {
      background: rgba(255,255,255,0.97);
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      padding: 50px 40px 40px 40px;
      max-width: 400px;
      width: 100%;
      position: relative;
      z-index: 1;
      animation: fadeIn 1s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .login-title {
      font-size: 2.2rem;
      font-weight: 700;
      color: #4f3ca7;
      margin-bottom: 20px;
      text-align: center;
    }
    .form-label {
      color: #4f3ca7;
      font-weight: 600;
    }
    .form-control {
      border-radius: 10px;
      border: 1px solid #d1d5db;
      font-size: 1.1rem;
      padding: 12px 15px;
      margin-bottom: 18px;
    }
    .btn-login {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      color: #fff;
      font-weight: 700;
      font-size: 1.1rem;
      border-radius: 50px;
      padding: 12px 0;
      width: 100%;
      box-shadow: 0 8px 24px rgba(102,126,234,0.18);
      transition: all 0.2s;
    }
    .btn-login:hover {
      background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(102,126,234,0.28);
    }
    .login-footer {
      text-align: center;
      margin-top: 18px;
      color: #888;
      font-size: 0.98rem;
    }
    .login-footer a {
      color: #764ba2;
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }
    .login-footer a:hover {
      color: #667eea;
    }
    .login-icon {
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 3.5rem;
      color: #764ba2;
      margin-bottom: 18px;
      animation: bounce 2s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-icon">
      <span>🔒</span>
    </div>
    <div class="login-title">Bem-vindo!</div>
    <form method="post" action="/login">
      <div class="mb-3">
        <label for="email" class="form-label">E-mail</label>
        <input type="email" class="form-control" id="email" name="email" placeholder="Digite seu e-mail" required autofocus>
      </div>
      <div class="mb-3">
        <label for="password" class="form-label">Senha</label>
        <input type="password" class="form-control" id="password" name="password" placeholder="Digite sua senha" required>
      </div>
      <button type="submit" class="btn btn-login">Entrar</button>
    </form>
    <div class="login-footer">
      Esqueceu a senha? <a href="#">Recuperar</a>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
        const form = document.querySelector('form');
        
        form.addEventListener('submit', async function(e) {
            e.preventDefault(); // Prevenir envio padrão do formulário
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            const data = {
                email: email,
                senha: password
            };

            try {
                const result = await r4.fetch('/login', 'POST', data);
                
                if (result.success) {
                    window.location.href = '/dashboard';
                } else {
                    alert('Falha no login: ' + (result.message || 'Erro desconhecido'));
                }
            } catch (error) {
                console.error('Erro ao processar login:', error);
                alert('Erro ao processar login. Tente novamente.');
            }
        });
    });
  </script>
</body>
</html>
