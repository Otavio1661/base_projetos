<?php

namespace App\Utils;

/**
 * Gerador DETERMINÍSTICO de dados fictícios para o mini ERP (/erp). Nada aqui é real: nomes, e-mails,
 * documentos e valores são sorteados com mt_srand(semente), então o mesmo seed gera sempre os mesmos dados.
 * Usado por tools/erp-seed.php (JSON) e tools/erp-seed-transacoes.php (SQLite, 2 milhões de linhas).
 */
final class ErpDados
{
    public const NOMES = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Fabio', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina', 'Nicolas', 'Olivia', 'Paulo', 'Rafaela', 'Rodrigo', 'Sabrina', 'Thiago', 'Vanessa', 'Wesley', 'Yara', 'Zeca', 'Amanda', 'Beatriz', 'Caio', 'Debora', 'Eduardo', 'Fernanda', 'Guilherme', 'Helena', 'Igor', 'Juliana', 'Kleber', 'Larissa', 'Mateus', 'Natalia', 'Otavio', 'Patricia', 'Renato', 'Sandra', 'Tatiane', 'Ulisses', 'Viviane', 'Washington', 'Alice', 'Bernardo', 'Camila', 'Diego'];
    public const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Carvalho', 'Ferreira', 'Rodrigues', 'Almeida', 'Costa', 'Gomes', 'Martins', 'Araujo', 'Ribeiro', 'Barbosa', 'Cardoso', 'Rocha', 'Dias', 'Nunes', 'Moreira', 'Teixeira', 'Mendes', 'Freitas', 'Cavalcanti', 'Ramos', 'Pinto', 'Moura', 'Campos', 'Fogaça'];
    public const CIDADES = [
        ['São Paulo', 'SP'], ['Campinas', 'SP'], ['Santos', 'SP'], ['Ribeirão Preto', 'SP'], ['Rio de Janeiro', 'RJ'], ['Niterói', 'RJ'], ['Belo Horizonte', 'MG'],
        ['Uberlândia', 'MG'], ['Juiz de Fora', 'MG'], ['Curitiba', 'PR'], ['Londrina', 'PR'], ['Maringá', 'PR'], ['Cascavel', 'PR'], ['Foz do Iguaçu', 'PR'],
        ['Porto Alegre', 'RS'], ['Caxias do Sul', 'RS'], ['Florianópolis', 'SC'], ['Joinville', 'SC'], ['Blumenau', 'SC'], ['Salvador', 'BA'], ['Feira de Santana', 'BA'],
        ['Recife', 'PE'], ['Caruaru', 'PE'], ['Fortaleza', 'CE'], ['Sobral', 'CE'], ['Natal', 'RN'], ['João Pessoa', 'PB'], ['Maceió', 'AL'], ['Aracaju', 'SE'],
        ['São Luís', 'MA'], ['Teresina', 'PI'], ['Belém', 'PA'], ['Manaus', 'AM'], ['Macapá', 'AP'], ['Palmas', 'TO'], ['Goiânia', 'GO'], ['Brasília', 'DF'],
        ['Cuiabá', 'MT'], ['Campo Grande', 'MS'], ['Vitória', 'ES'], ['Porto Velho', 'RO'], ['Rio Branco', 'AC'], ['Boa Vista', 'RR'],
    ];
    public const PRODUTOS = [
        ['Notebook', 'Informática', 4200], ['Mouse sem fio', 'Informática', 89], ['Teclado mecânico', 'Informática', 349], ['Monitor 24"', 'Informática', 899], ['Webcam Full HD', 'Informática', 229],
        ['Cadeira ergonômica', 'Escritório', 1190], ['Mesa de escritório', 'Escritório', 780], ['Luminária de mesa', 'Escritório', 119], ['Organizador de cabos', 'Escritório', 29], ['Quadro branco', 'Escritório', 190],
        ['Smartphone', 'Eletrônicos', 2390], ['Fone Bluetooth', 'Eletrônicos', 259], ['Caixa de som', 'Eletrônicos', 399], ['Carregador rápido', 'Eletrônicos', 79], ['Smartwatch', 'Eletrônicos', 749],
        ['Café especial 1kg', 'Alimentos', 69], ['Castanhas 500g', 'Alimentos', 45], ['Chocolate 70%', 'Alimentos', 18], ['Azeite extra virgem', 'Alimentos', 52], ['Granola artesanal', 'Alimentos', 24],
        ['Camiseta básica', 'Vestuário', 59], ['Calça jeans', 'Vestuário', 179], ['Tênis casual', 'Vestuário', 299], ['Jaqueta corta-vento', 'Vestuário', 249], ['Boné', 'Vestuário', 49],
        ['Furadeira', 'Ferramentas', 329], ['Jogo de chaves', 'Ferramentas', 99], ['Trena 5m', 'Ferramentas', 22], ['Parafusadeira', 'Ferramentas', 389], ['Alicate universal', 'Ferramentas', 39],
        ['Shampoo', 'Beleza', 28], ['Perfume 100ml', 'Beleza', 219], ['Hidratante', 'Beleza', 41], ['Protetor solar', 'Beleza', 56], ['Kit de maquiagem', 'Beleza', 139],
        ['Bicicleta urbana', 'Esportes', 1590], ['Bola de futebol', 'Esportes', 89], ['Halteres 10kg', 'Esportes', 149], ['Tapete de yoga', 'Esportes', 79], ['Garrafa térmica', 'Esportes', 69],
    ];
    public const STATUS_PEDIDO = ['aberto', 'pago', 'enviado', 'cancelado'];
    public const STATUS_TRANSACAO = ['aprovada', 'pendente', 'estornada', 'recusada'];
    public const CARGOS = ['vendas', 'financeiro', 'estoque', 'gestor'];

    private static function pick(array $a): mixed
    {
        return $a[mt_rand(0, count($a) - 1)];
    }

    /** Dígitos de documento FICTÍCIO (não passa pela validação real de CPF/CNPJ: é só para o visual). */
    private static function digitos(int $n): string
    {
        $s = '';
        for ($i = 0; $i < $n; $i++) {
            $s .= mt_rand(0, 9);
        }
        return $s;
    }

    public static function dataAleatoria(string $inicio, int $dias): string
    {
        return date('Y-m-d', strtotime($inicio) + mt_rand(0, $dias) * 86400);
    }

    public static function slug(string $s): string
    {
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT', $s);
        $t = strtolower((string) ($t === false ? $s : $t));
        return trim((string) preg_replace('/[^a-z0-9]+/', '.', $t), '.');
    }

    public static function cliente(int $id): array
    {
        $pj = mt_rand(1, 100) <= 30;
        $nome = self::pick(self::NOMES) . ' ' . self::pick(self::SOBRENOMES);
        $c = self::pick(self::CIDADES);
        if ($pj) {
            $nome = self::pick(['Comercial', 'Distribuidora', 'Auto Peças', 'Mercearia', 'Tecnologia', 'Construções', 'Farmácia', 'Padaria']) . ' ' . self::pick(self::SOBRENOMES) . ' ' . self::pick(['LTDA', 'ME', 'EIRELI']);
        }
        return [
            'id' => $id,
            'nome' => $nome,
            'email' => self::slug($nome) . $id . '@exemplo.test',
            'telefone' => '(' . mt_rand(11, 99) . ') 9' . self::digitos(4) . '-' . self::digitos(4),
            'cidade' => $c[0],
            'uf' => $c[1],
            'tipo' => $pj ? 'PJ' : 'PF',
            'documento' => $pj ? self::digitos(14) : self::digitos(11),
            'limite' => mt_rand(5, 200) * 100,
            'ativo' => mt_rand(1, 100) <= 90,
            'criadoEm' => self::dataAleatoria('2023-01-01', 1050),
        ];
    }

    public static function produto(int $id): array
    {
        $p = self::PRODUTOS[($id - 1) % count(self::PRODUTOS)];
        $variante = intdiv($id - 1, count(self::PRODUTOS));
        $nome = $p[0] . ($variante > 0 ? ' ' . self::pick(['Pro', 'Plus', 'Lite', 'Max', 'Eco', 'Prime']) . ' ' . ($variante + 1) : '');
        return [
            'id' => $id,
            'sku' => strtoupper(substr(self::slug($p[1]), 0, 3)) . '-' . str_pad((string) $id, 5, '0', STR_PAD_LEFT),
            'nome' => $nome,
            'categoria' => $p[1],
            'preco' => round($p[2] * (0.8 + mt_rand(0, 60) / 100), 2),
            'estoque' => mt_rand(0, 100) <= 8 ? 0 : mt_rand(1, 500),
            'ativo' => mt_rand(1, 100) <= 92,
        ];
    }

    public static function pedido(int $id, array $clientes): array
    {
        $c = $clientes[mt_rand(0, count($clientes) - 1)];
        $r = mt_rand(1, 100);
        return [
            'id' => $id,
            'clienteId' => $c['id'],
            'cliente' => $c['nome'],
            'data' => self::dataAleatoria('2025-01-01', 680),
            'itens' => mt_rand(1, 12),
            'total' => round(mt_rand(3000, 900000) / 100, 2),
            'status' => $r <= 18 ? 'aberto' : ($r <= 72 ? 'pago' : ($r <= 94 ? 'enviado' : 'cancelado')),
            'obs' => mt_rand(1, 100) <= 25 ? self::pick(['Entrega urgente', 'Presente', 'Cliente VIP', 'Pagamento parcelado', 'Retirar na loja', 'Nota fiscal com CNPJ']) : '',
        ];
    }

    /** Linha da tabela grande (sem `id`: é o rowid). Devolve [cliente, cidade, uf, produto, categoria, valor, data, status, busca]. */
    public static function transacao(): array
    {
        $nome = self::NOMES[mt_rand(0, 49)] . ' ' . self::SOBRENOMES[mt_rand(0, 29)];
        $c = self::CIDADES[mt_rand(0, 42)];
        $p = self::PRODUTOS[mt_rand(0, 39)];
        $r = mt_rand(1, 100);
        $status = $r <= 78 ? 'aprovada' : ($r <= 90 ? 'pendente' : ($r <= 96 ? 'estornada' : 'recusada'));
        $valor = round($p[2] * mt_rand(70, 140) / 100 * mt_rand(1, 3), 2);
        $data = date('Y-m-d', 1704067200 + mt_rand(0, 1050) * 86400);   // 2024-01-01 + até ~35 meses
        return [$nome, $c[0], $c[1], $p[0], $p[1], $valor, $data, $status,
            mb_strtolower($nome . ' ' . $c[0] . ' ' . $c[1] . ' ' . $p[0] . ' ' . $p[1] . ' ' . $status . ' ' . $data, 'UTF-8')];
    }
}
