<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sistema</title>
  
  <!-- Bootstrap 5 CSS -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  
  <!-- Bootstrap Icons -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
  
  <!-- SweetAlert2 -->
  <link href="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.min.css" rel="stylesheet">
  
  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --primary-dark: #1a237e;
      --primary-blue: #283593;
      --primary-purple: #6a1b9a;
      --secondary-purple: #8e24aa;
      --gradient-bg: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Poppins', sans-serif;
      background: linear-gradient(135deg, #1a237e 0%, #4a148c 50%, #6a1b9a 100%);
      min-height: 100vh;
    }
    
    .navbar-custom {
      background: var(--gradient-bg);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      padding: 1rem 0;
    }
    
    .navbar-brand {
      font-weight: 600;
      font-size: 1.5rem;
      color: white !important;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    .nav-link {
      color: rgba(255, 255, 255, 0.9) !important;
      font-weight: 500;
      margin: 0 0.5rem;
      transition: all 0.3s ease;
      position: relative;
    }
    
    .nav-link:hover {
      color: white !important;
      transform: translateY(-2px);
    }
    
    .nav-link::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 0;
      height: 2px;
      background: white;
      transition: all 0.3s ease;
      transform: translateX(-50%);
    }
    
    .nav-link:hover::after {
      width: 80%;
    }
    
    .btn-custom {
      background: linear-gradient(135deg, #8e24aa 0%, #6a1b9a 100%);
      border: none;
      color: white;
      font-weight: 500;
      padding: 0.5rem 1.5rem;
      border-radius: 25px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
    }
    
    .btn-custom:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
      background: linear-gradient(135deg, #6a1b9a 0%, #4a148c 100%);
    }
  </style>
  
  <script>
    // Definir a chave de criptografia globalmente
    <?php
    use src\Config;
    $cryptoKey = Config::BASE_CRIPTOGRAFIA;
    if (empty($cryptoKey)) {
        $cryptoKey = 'chave-padrao-desenvolvimento-2024'; // Chave padrão se não estiver configurada
    }
    ?>
    window.BASE_CRIPTOGRAFIA = '<?php echo $cryptoKey; ?>';
  </script>
</head>
<body>

<nav class="navbar navbar-expand-lg navbar-dark navbar-custom">
  <div class="container">
    <a class="navbar-brand" href="/">
      <i class="bi bi-hexagon-fill me-2"></i>
      Dev.Otavio_Silva    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav ms-auto">
        <li class="nav-item">
          <a class="nav-link" href="/">
            <i class="bi bi-house-fill me-1"></i>
            Início
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="/sobre">
            <i class="bi bi-info-circle-fill me-1"></i>
            Sobre
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="/contato">
            <i class="bi bi-envelope-fill me-1"></i>
            Contato
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="/login">
            <i class="bi bi-box-arrow-in-right me-1"></i>
            Login
          </a>
        </li>
      </ul>
    </div>
  </div>
</nav>