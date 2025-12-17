<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 - Página não encontrada</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      overflow: hidden;
    }
    
    .error-container {
      animation: fadeIn 0.8s ease-in;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .error-card {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      padding: 60px 40px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      max-width: 600px;
      margin: 0 auto;
    }
    
    .error-number {
      font-size: 150px;
      font-weight: 900;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1;
      margin-bottom: 20px;
      animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.05);
      }
    }
    
    .error-title {
      font-size: 32px;
      font-weight: 700;
      color: #2d3748;
      margin-bottom: 15px;
    }
    
    .error-message {
      font-size: 18px;
      color: #718096;
      margin-bottom: 30px;
      line-height: 1.6;
    }
    
    .btn-home {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      padding: 15px 40px;
      font-size: 18px;
      font-weight: 600;
      border-radius: 50px;
      color: white;
      text-decoration: none;
      display: inline-block;
      transition: all 0.3s ease;
      box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
    }
    
    .btn-home:hover {
      transform: translateY(-3px);
      box-shadow: 0 15px 35px rgba(102, 126, 234, 0.6);
      color: white;
    }
    
    .floating-shapes {
      position: absolute;
      width: 100%;
      height: 100%;
      overflow: hidden;
      z-index: 0;
    }
    
    .shape {
      position: absolute;
      opacity: 0.1;
      animation: float 20s infinite ease-in-out;
    }
    
    .shape:nth-child(1) {
      width: 80px;
      height: 80px;
      background: white;
      border-radius: 50%;
      top: 10%;
      left: 10%;
      animation-delay: 0s;
    }
    
    .shape:nth-child(2) {
      width: 60px;
      height: 60px;
      background: white;
      border-radius: 50%;
      top: 70%;
      left: 80%;
      animation-delay: 5s;
    }
    
    .shape:nth-child(3) {
      width: 100px;
      height: 100px;
      background: white;
      border-radius: 50%;
      top: 40%;
      left: 70%;
      animation-delay: 10s;
    }
    
    @keyframes float {
      0%, 100% {
        transform: translateY(0) rotate(0deg);
      }
      50% {
        transform: translateY(-30px) rotate(180deg);
      }
    }
    
    .error-icon {
      font-size: 80px;
      margin-bottom: 20px;
      animation: bounce 2s ease-in-out infinite;
    }
    
    @keyframes bounce {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-10px);
      }
    }
  </style>
</head>
<body class="d-flex align-items-center justify-content-center vh-100">
  
  <div class="floating-shapes">
    <div class="shape"></div>
    <div class="shape"></div>
    <div class="shape"></div>
  </div>

  <div class="error-container">
    <div class="error-card">
      <div class="error-icon">🔍</div>
      <h1 class="error-number">404</h1>
      <h2 class="error-title">Página não encontrada</h2>
      <p class="error-message">
        Oops! Parece que a página que você está procurando foi movida, removida ou nunca existiu.
      </p>
      <a href="/home" class="btn-home">
        Voltar para a página inicial
      </a>
    </div>
  </div>

</body>
</html>
